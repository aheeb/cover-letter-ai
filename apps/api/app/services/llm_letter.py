from __future__ import annotations

import json
import re

from openai import OpenAI

from app.logging import get_logger
from app.models import ContactGender, ContactPerson, GenerateOptions, Language, Length, LetterData
from app.services.google_places import GooglePlacesError, GooglePlacesService, create_google_places_service
from app.settings import get_settings


class LlmError(RuntimeError):
    pass


logger = get_logger(__name__)


class AddressResolutionResult:
    """Result of address resolution process."""
    def __init__(self, source: str, confidence: str, recipient_block: str):
        self.source = source  # "places" or "fallback"
        self.confidence = confidence  # "high", "low"
        self.recipient_block = recipient_block


def _extract_company_from_job_text(job_text: str) -> str | None:
    """
    Extract company name from job text using simple heuristics.
    This is used as a fallback when the LLM doesn't identify a clear company.
    """
    # Look for common patterns
    patterns = [
        r"(?:bei|at|für|for)\s+([A-Z][A-Za-zÄÖÜäöüß0-9&\s]{2,50})(?:\s|$)",
        r"([A-Z][A-Za-zÄÖÜäöüß0-9&\s]{3,50})\s+(?:sucht|recruiting|hiring|stellenangebot)",
        r"([A-Z][A-Za-zÄÖÜäöüß0-9&\s]{3,50})\s+(?:AG|GmbH|S\.A\.|Ltd|Inc|Corp)",
    ]

    for pattern in patterns:
        match = re.search(pattern, job_text, re.IGNORECASE)
        if match:
            company = match.group(1).strip()
            # Clean up common false positives
            if len(company) > 3 and not any(word in company.lower() for word in ["wir", "uns", "die", "der", "das"]):
                return company

    return None


def _create_recipient_block_from_places(place_details: dict) -> str:
    """
    Create a deterministic recipient block from Google Places details.

    Format: Company Name\nStreet Address\nPostal Code City
    """
    lines = []

    # Company name
    display_name = place_details.get("displayName", {}).get("text", "")
    if display_name:
        lines.append(display_name)

    # Address components
    address_components = place_details.get("addressComponents", [])
    street_number = ""
    route = ""
    postal_code = ""
    locality = ""

    for component in address_components:
        types = component.get("types", [])
        long_text = component.get("longText", "")

        if "street_number" in types:
            street_number = long_text
        elif "route" in types:
            route = long_text
        elif "postal_code" in types:
            postal_code = long_text
        elif "locality" in types or "administrative_area_level_1" in types:
            locality = long_text

    # Street line
    if route:
        street_line = route
        if street_number:
            street_line = f"{street_number} {route}"
        lines.append(street_line)

    # Postal code + city line
    if postal_code or locality:
        city_line = f"{postal_code} {locality}".strip()
        lines.append(city_line)

    # Ensure we have at least the company name
    if not lines:
        lines.append(display_name or "Unbekannte Firma")

    return "\n".join(lines)


def _normalize_text_for_matching(text: str) -> str:
    """
    Normalize text for fuzzy matching by:
    - Converting to lowercase
    - Collapsing whitespace
    - Normalizing German umlauts (ä→ae, ö→oe, ü→ue, ß→ss)
    - Removing punctuation
    """
    if not text:
        return ""

    # Convert to lowercase
    text = text.lower()

    # Normalize German umlauts
    text = text.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")

    # Normalize street abbreviations
    text = re.sub(r'\bstr\.?\b', 'strasse', text)
    text = re.sub(r'\bstr\b', 'strasse', text)

    # Remove punctuation and collapse whitespace
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)

    return text.strip()


def _verify_address_part(part: str, verification_text: str) -> bool:
    """
    Verify if an address part is supported by the verification text.

    Uses normalized fuzzy matching.
    """
    if not part or not verification_text:
        return False

    normalized_part = _normalize_text_for_matching(part)
    normalized_text = _normalize_text_for_matching(verification_text)

    # For postal codes, require exact match of 4-5 digit codes
    if re.match(r'^\d{4,5}$', normalized_part):
        return normalized_part in normalized_text

    # For other parts, check if the normalized part appears in the text
    # Allow for some flexibility (e.g., "Bahnhofstrasse" should match "Bahnhofstr")
    return normalized_part in normalized_text


def _prune_recipient_block(recipient_block: str, verification_text: str) -> str:
    """
    Prune unverifiable parts from recipient block by verifying against verification text.

    Keeps verified parts and removes unverified ones.
    """
    if not recipient_block or not verification_text:
        return recipient_block

    lines = recipient_block.splitlines()
    if len(lines) < 2:
        # If only company name, keep it (we can't verify company names reliably)
        return recipient_block

    verified_lines = []

    # Always keep the first line (company name) - we assume the LLM got this right
    verified_lines.append(lines[0])

    # Verify and keep subsequent lines
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue

        if _verify_address_part(line, verification_text):
            verified_lines.append(line)
            logger.debug("Kept verified address line: %s", line)
        else:
            logger.debug("Removed unverified address line: %s", line)

    # If we removed all address lines, add a placeholder
    if len(verified_lines) == 1:
        verified_lines.append("Adresse unbekannt")

    return "\n".join(verified_lines)


def _assess_places_confidence(search_results: list[dict], place_details: dict | None, job_text: str) -> str:
    """
    Assess confidence in Places results based on relevance to job text.

    Returns "high" or "low".
    """
    if not search_results or not place_details:
        return "low"

    # Check if the place details contain address information
    formatted_address = place_details.get("formattedAddress", "")
    if not formatted_address:
        return "low"

    # Extract company name from place details
    company_name = place_details.get("displayName", {}).get("text", "").lower()

    # Check for company name matches in job text
    job_text_lower = job_text.lower()
    if company_name and company_name in job_text_lower:
        return "high"

    # Check for location matches (city, postal code)
    address_components = place_details.get("addressComponents", [])
    cities = []
    postal_codes = []

    for component in address_components:
        types = component.get("types", [])
        long_text = component.get("longText", "").lower()

        if "locality" in types or "administrative_area_level_1" in types:
            cities.append(long_text)
        elif "postal_code" in types:
            postal_codes.append(long_text)

    # Check if any city or postal code from Places appears in job text
    for city in cities:
        if city in job_text_lower:
            return "high"

    for postal in postal_codes:
        if postal in job_text_lower:
            return "high"

    # If we have detailed address but no strong matches, still consider it reasonably confident
    # (better than LLM hallucination)
    if len(address_components) >= 3:  # street, city, postal code
        return "high"

    return "low"


def _resolve_recipient_address(*, job_text: str, letter_recipient_block: str, places_service: GooglePlacesService | None, is_from_firecrawl: bool) -> AddressResolutionResult:
    """
    Resolve recipient address using Places API when possible, fallback to LLM result.

    The LLM has already attempted to use Places tools. We assess if we should trust
    the Places-derived result or fall back to the LLM's original recipient_block.
    When falling back, we verify and prune address parts against the job text.
    """
    # For now, since the LLM generates the final recipient_block, we assume it used Places
    # if available. In a future iteration, we could track which path was taken.

    # Simple heuristic: if Places service is available and the recipient block
    # looks structured (has line breaks), assume Places was used
    if places_service and "\n" in letter_recipient_block:
        confidence = "high"  # Assume LLM used Places effectively
        source = "places"
        final_recipient_block = letter_recipient_block
    else:
        confidence = "low"
        source = "fallback"
        # When falling back, verify and prune the LLM-generated recipient block
        final_recipient_block = _prune_recipient_block(letter_recipient_block, job_text)

        if final_recipient_block != letter_recipient_block:
            logger.info(
                "Pruned recipient block in fallback mode",
                extra={
                    "original_block": letter_recipient_block,
                    "pruned_block": final_recipient_block,
                },
            )

    return AddressResolutionResult(
        source=source,
        confidence=confidence,
        recipient_block=final_recipient_block
    )


def _max_completion_tokens(options: GenerateOptions) -> int:
    """
    Upper bound for generated tokens (controls response length/cost).
    
    When using tool calling, the model needs tokens for:
    - Reasoning (if using reasoning models)
    - Tool calls (function_call items)
    - Final structured output (LetterData with multiple paragraphs)
    
    We set higher limits to accommodate all of these.
    """
    if options.length == Length.short:
        return 800  # Increased from 450 to account for tool calling overhead
    if options.length == Length.medium:
        return 1200  # Increased from 650 to account for tool calling overhead
    return 1600  # Increased from 900 to account for tool calling overhead


def _split_nonempty_lines(value: str) -> list[str]:
    return [ln.strip() for ln in value.splitlines() if ln.strip()]


_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
# Matches common phone-number-like strings; we keep it permissive but only apply at *document end*.
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{6,}\d)")
_ZIP_RE = re.compile(r"\b\d{4,5}\b")

_SALUTATION_RE = re.compile(r"^\s*(sehr\s+geehrte|guten\s+tag|dear\b|hello\b)", re.IGNORECASE)
_DE_HONORIFIC_NAME_RE = re.compile(
    r"\b(Frau|Herrn?|Herr)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+){0,3})\b"
)
_EN_HONORIFIC_NAME_RE = re.compile(
    r"\b(Mr|Ms|Mrs|Dr)\.?\s+([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2})\b"
)


def _looks_like_contact_paragraph(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if _EMAIL_RE.search(t):
        return True
    if "e-mail" in t.lower() or "email" in t.lower():
        return True
    if "telefon" in t.lower() or "phone" in t.lower() or "tel." in t.lower():
        return True
    if _PHONE_RE.search(t):
        return True
    # Address-ish heuristics (street + postal code is a strong signal)
    street_words = ("strasse", "straße", "gasse", "weg", "platz", "allee", "ring", "dorfgasse")
    if _ZIP_RE.search(t) and any(w in t.lower() for w in street_words):
        return True
    return False


def _looks_like_person_name(text: str) -> bool:
    """
    Very small heuristic for signature names like 'Andri Heeb'.
    Only used when we already detected a trailing contact block.
    """
    t = text.strip()
    if not t or len(t) > 60:
        return False
    if any(ch in t for ch in "@,;:()[]{}<>/\\"):
        return False
    parts = [p for p in t.split() if p]
    if len(parts) < 2 or len(parts) > 4:
        return False
    if not all(p[:1].isalpha() and p[:1].upper() == p[:1] for p in parts):
        return False
    return True


def _strip_trailing_contact_block(*, body_paragraphs: list[str]) -> tuple[list[str], bool]:
    """
    Strip trailing signature/contact blocks (address/phone/email) if present.

    Returns (cleaned_body, did_strip).
    """
    body = [p.strip() for p in body_paragraphs if p and p.strip()]
    if not body:
        return body, False

    removed = 0
    while body and _looks_like_contact_paragraph(body[-1]):
        body.pop()
        removed += 1

    # If we removed contact lines, also remove a single preceding "name-like" line (signature).
    if removed and body and _looks_like_person_name(body[-1]):
        body.pop()
        removed += 1

    return body, bool(removed)


def _strip_trailing_recipient_block_from_body(
    *, body_paragraphs: list[str], recipient_block: str
) -> list[str]:
    """
    Guardrail: Sometimes the model repeats the recipient block at the end of the body.
    We strip it (only when it appears as a trailing sequence) to avoid duplicated address blocks in the DOCX.
    """
    body = [p.strip() for p in body_paragraphs if p and p.strip()]
    if not body:
        return body

    recipient_lines = _split_nonempty_lines(recipient_block)
    if len(recipient_lines) < 2:
        # Avoid accidental removal when recipient block is too short/ambiguous.
        return body

    normalized_recipient_block = "\n".join(recipient_lines).strip()

    # Case 1: The entire recipient block appears as a single final "paragraph" (contains newlines).
    last = body[-1].strip()
    if last in {recipient_block.strip(), normalized_recipient_block}:
        return body[:-1]

    # Case 2: The recipient block lines appear as multiple trailing paragraphs.
    max_k = min(len(recipient_lines), len(body))
    for k in range(max_k, 1, -1):  # require at least 2 lines to match
        if body[-k:] == recipient_lines[:k]:
            return body[:-k]

    return body


def _strip_markdown_prefix(line: str) -> str:
    # Remove common markdown list/header prefixes and quoting.
    return line.strip().lstrip("#*-•> ").strip()


def _best_effort_contact_from_job_text(*, job_text: str, language: Language) -> tuple[str | None, str | None]:
    """
    Try to detect an explicit contact person mentioned in the job text.

    Returns (honorific, name) where honorific can be e.g. 'Frau'/'Herr' or 'Mr'/'Ms'/... .
    This is intentionally conservative to avoid hallucinating names.
    """
    hints = (
        "kontakt",
        "ansprech",
        "kontaktperson",
        "bewerbung",
        "bewerbungsunterlagen",
        "fragen",
        "auskunft",
        "recruit",
        "hiring",
        "talent",
        "hr",
        "freut sich",
        "freue mich",
        "auf deine bewerbung",
        "auf ihre bewerbung",
    )
    for raw in job_text.splitlines():
        line = _strip_markdown_prefix(raw)
        if not line:
            continue
        lower = line.lower()
        if not any(h in lower for h in hints):
            continue

        if language == Language.de:
            m = _DE_HONORIFIC_NAME_RE.search(line)
            if m:
                honorific = m.group(1).lower()
                honorific = "herr" if honorific.startswith("herr") else "frau"
                name = m.group(2).strip()
                return honorific, name
        else:
            m = _EN_HONORIFIC_NAME_RE.search(line)
            if m:
                honorific = m.group(1).strip()
                name = m.group(2).strip()
                return honorific, name

        # If we couldn't match a titled person but the line looks like "Kontakt: Max Muster",
        # capture a best-effort "name-ish" tail.
        if ":" in line:
            tail = line.split(":", 1)[1].strip()
            parts = [p for p in tail.split() if p]
            if 2 <= len(parts) <= 4 and all(p[:1].isalpha() and p[:1].upper() == p[:1] for p in parts):
                return None, tail

    return None, None


def _honorific_from_gender(language: Language, gender: ContactGender) -> str | None:
    if language == Language.de:
        if gender == ContactGender.female:
            return "frau"
        if gender == ContactGender.male:
            return "herr"
        return None
    if gender == ContactGender.female:
        return "Ms"
    if gender == ContactGender.male:
        return "Mr"
    return None


def _normalize_for_search(value: str) -> str:
    return value.casefold()


def _llm_contact_if_verified(
    *, job_text: str, language: Language, contact_person: ContactPerson | None
) -> tuple[str | None, str | None]:
    if not contact_person:
        return None, None
    full_name = contact_person.full_name.strip()
    if not full_name:
        return None, None

    surname = _surname(full_name).strip()
    if not surname:
        return None, None

    normalized_job = _normalize_for_search(job_text)
    surname_hit = _normalize_for_search(surname) in normalized_job
    fullname_hit = _normalize_for_search(full_name) in normalized_job

    logger.info(
        "LLM contact verification: name=%s gender=%s surname_hit=%s fullname_hit=%s",
        full_name,
        contact_person.gender,
        surname_hit,
        fullname_hit,
    )

    if not surname_hit and not fullname_hit:
        return None, None

    honorific = _honorific_from_gender(language, contact_person.gender)
    return honorific, full_name


def _contact_from_job_text(
    *, job_text: str, language: Language, contact_person: ContactPerson | None
) -> tuple[str | None, str | None]:
    honorific, name = _llm_contact_if_verified(
        job_text=job_text, language=language, contact_person=contact_person
    )
    if honorific or name:
        return honorific, name
    return _best_effort_contact_from_job_text(job_text=job_text, language=language)


def _surname(name: str) -> str:
    parts = [p for p in name.strip().split() if p]
    return parts[-1] if parts else name.strip()


def _default_salutation(language: Language) -> str:
    if language == Language.de:
        return "Sehr geehrte Damen und Herren"
    return "Dear Sir or Madam"


def _salutation_from_contact(*, language: Language, honorific: str | None, name: str | None) -> str:
    if language == Language.de:
        if honorific == "frau" and name:
            return f"Sehr geehrte Frau {_surname(name)}"
        if honorific == "herr" and name:
            return f"Sehr geehrter Herr {_surname(name)}"
        if name:
            return f"Guten Tag {name}"
        return _default_salutation(language)

    # English
    if honorific and name:
        return f"Dear {honorific} {_surname(name)}"
    if name:
        return f"Hello {name}"
    return _default_salutation(language)


def _normalize_salutation_line(value: str) -> str:
    # Swiss/German letters often omit the comma; normalize it away if present.
    return value.strip().rstrip(",").strip()


def _ensure_salutation_comma(value: str) -> str:
    v = value.strip()
    if not v.endswith(","):
        return f"{v},"
    return v


def _lowercase_first_word(value: str) -> str:
    """
    Lowercase the first alphabetical character (for the paragraph after the greeting),
    leaving the rest untouched.
    """
    chars = list(value)
    for i, ch in enumerate(chars):
        if ch.isalpha():
            chars[i] = ch.lower()
            break
    return "".join(chars)


def _contact_line(*, name: str, gender: ContactGender, language: Language, honorific_hint: str | None) -> str | None:
    name = name.strip()
    if not name:
        return None
    if language == Language.de:
        # Prefer "Herrn" for address lines in German
        if honorific_hint == "herr" or gender == ContactGender.male:
            return f"z. Hd. Herrn {name}"
        if honorific_hint == "frau" or gender == ContactGender.female:
            return f"z. Hd. Frau {name}"
        return f"z. Hd. {name}"
    # English
    if honorific_hint in {"Mr", "Ms", "Mrs"}:
        return f"Attn. {honorific_hint} {name}"
    return f"Attn. {name}"


def _insert_contact_line_into_recipient_block(
    recipient_block: str, contact_line: str | None
) -> str:
    if not contact_line:
        return recipient_block
    lines = _split_nonempty_lines(recipient_block)
    if not lines:
        return contact_line
    normalized = {_normalize_salutation_line(ln).casefold() for ln in lines}
    if _normalize_salutation_line(contact_line).casefold() in normalized:
        return "\n".join(lines)
    # Insert after company (first line).
    new_lines = [lines[0], contact_line, *lines[1:]]
    return "\n".join(new_lines)


def _ensure_salutation_first_paragraph(
    *, body_paragraphs: list[str], salutation: str
) -> list[str]:
    body = [p.strip() for p in body_paragraphs if p and p.strip()]
    salutation = _ensure_salutation_comma(_normalize_salutation_line(salutation))
    if not salutation:
        return body
    if not body:
        return [salutation]

    first = body[0].strip()

    # Always enforce the computed salutation as the first paragraph.
    # If the model jammed salutation + content into one paragraph, keep the tail as the next paragraph.
    tail = None
    if "\n" in first:
        _, tail = first.split("\n", 1)
        tail = tail.strip() or None
    elif "," in first:
        _, tail = first.split(",", 1)
        tail = tail.strip() or None

    out: list[str] = [salutation]
    if tail:
        out.append(tail)
    out.extend(body[1:])

    # Lowercase the first word of the first body paragraph (if present) per German letter conventions.
    if len(out) >= 2:
        out[1] = _lowercase_first_word(out[1])

    return out


def _sanitize_letter(letter: LetterData) -> LetterData:
    normalized_recipient_block = _normalize_recipient_block(letter.recipient_block)
    recipient_lines = _split_nonempty_lines(normalized_recipient_block)

    cleaned_body = _strip_trailing_recipient_block_from_body(
        body_paragraphs=letter.body_paragraphs, recipient_block=normalized_recipient_block
    )
    cleaned_body, did_strip_contact = _strip_trailing_contact_block(body_paragraphs=cleaned_body)

    # Keep schema constraints intact; if we over-cleaned, fall back to the original body.
    if len(cleaned_body) < 2:
        cleaned_body = [p.strip() for p in letter.body_paragraphs if p and p.strip()]
        # If the original body ends with a contact block, try stripping it again (best-effort).
        if did_strip_contact:
            cleaned_body, _ = _strip_trailing_contact_block(body_paragraphs=cleaned_body)
            if len(cleaned_body) < 2:
                cleaned_body = [p.strip() for p in letter.body_paragraphs if p and p.strip()]

    contact_person = letter.contact_person
    if contact_person:
        contact_person = contact_person.model_copy(
            update={
                "full_name": contact_person.full_name.strip(),
            }
        )

    return letter.model_copy(
        update={
            "company": letter.company.strip(),
            "role_title": letter.role_title.strip(),
            "recipient_block": normalized_recipient_block,
            "body_paragraphs": cleaned_body,
            "contact_person": contact_person,
        }
    )


def _add_additional_properties_false(schema: dict) -> dict:
    """Recursively add additionalProperties: false to all object definitions in a JSON schema.
    
    OpenAI structured outputs require this for all objects in the schema.
    Also ensures ALL properties are in the required array (strict mode requirement).
    Removes invalid keywords (like 'default') from objects that use $ref.
    
    This function must process the entire schema including $defs/definitions to ensure
    all nested objects (even those referenced via $ref) have all properties in required.
    """
    if not isinstance(schema, dict):
        return schema
    
    # Create a copy to avoid mutating the original
    result = schema.copy()
    
    # CRITICAL: If this object uses $ref, remove other keywords that are invalid with $ref
    # According to JSON Schema spec, $ref cannot coexist with other keywords like 'default'
    # OpenAI's structured outputs API enforces this strictly
    if "$ref" in result:
        # Keep only $ref and description (description is allowed with $ref in some contexts)
        # Remove all other keywords that conflict with $ref
        allowed_with_ref = {"$ref", "description"}
        keys_to_remove = [k for k in result.keys() if k not in allowed_with_ref]
        for key in keys_to_remove:
            result.pop(key, None)
        # Don't process further if it's just a $ref
        return result
    
    # FIRST: Process all definitions/$defs recursively to ensure nested objects are fixed
    # This must happen before processing the root to handle $ref references correctly
    if "definitions" in result:
        result["definitions"] = {
            key: _add_additional_properties_false(value)
            for key, value in result["definitions"].items()
        }
    
    if "$defs" in result:
        result["$defs"] = {
            key: _add_additional_properties_false(value)
            for key, value in result["$defs"].items()
        }
    
    # If this is an object type, add additionalProperties: false and ensure all properties are required
    if result.get("type") == "object":
        result["additionalProperties"] = False
        
        # CRITICAL: In strict mode, ALL properties must be in the required array
        # This is a requirement from OpenAI's structured outputs
        # Even fields with default values must be in required
        if "properties" in result:
            # Get all property keys
            all_property_keys = list(result["properties"].keys())
            # Ensure all properties are in required array
            existing_required = result.get("required", [])
            # Merge and deduplicate - ALL properties must be in required
            result["required"] = list(dict.fromkeys(existing_required + all_property_keys))
    
    # Recursively process properties (after fixing definitions)
    if "properties" in result:
        result["properties"] = {
            key: _add_additional_properties_false(value)
            for key, value in result["properties"].items()
        }
    
    # Recursively process items (for arrays)
    if "items" in result:
        result["items"] = _add_additional_properties_false(result["items"])
    
    # Recursively process anyOf, oneOf, allOf
    # These may contain $ref references, so we need to process them
    for key in ["anyOf", "oneOf", "allOf"]:
        if key in result:
            result[key] = [_add_additional_properties_false(item) for item in result[key]]
    
    return result


def _normalize_recipient_block(value: str) -> str:
    """
    Normalize recipient blocks so they render cleanly in the DOCX template:
    - Prefer 2-3 lines (Firma / Strasse / PLZ Ort)
    - Strip trailing commas
    - If a line contains address parts separated by commas (and also contains digits),
      split it into separate lines (e.g. "Firma AG, Musterstrasse 1," -> ["Firma AG", "Musterstrasse 1"]).
    """
    raw_lines = _split_nonempty_lines(value)
    out: list[str] = []
    for ln in raw_lines:
        cleaned = ln.strip().rstrip(",").strip()
        if not cleaned:
            continue

        # Only split comma-separated parts when the line looks like it contains address info.
        if "," in cleaned and any(ch.isdigit() for ch in cleaned):
            parts = [p.strip().rstrip(",").strip() for p in cleaned.split(",")]
            out.extend([p for p in parts if p])
        else:
            out.append(cleaned)

    # Remove consecutive duplicates (model sometimes repeats a line).
    deduped: list[str] = []
    for ln in out:
        if not deduped or deduped[-1] != ln:
            deduped.append(ln)

    return "\n".join(deduped).strip()


def generate_letter(*, job_text: str, cv_text: str, options: GenerateOptions, is_from_firecrawl: bool = False) -> LetterData:
    settings = get_settings()
    if not settings.openai_api_key:
        raise LlmError("Missing OPENAI_API_KEY.")

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.request_timeout_seconds)
    places_service = create_google_places_service(settings)

    language_hint = "Deutsch (Schweiz)" if options.language == Language.de else "English"
    tone_hint = {
        "professional": "professionell, präzise, seriös",
        "friendly": "professionell, freundlich, nahbar",
        "concise": "sehr präzise und kurz, ohne Floskeln",
    }[options.tone.value]
    length_hint = {
        "short": "kurz",
        "medium": "mittel",
        "long": "lang",
    }[options.length.value]

    target_role = options.target_role.strip() if options.target_role else ""

    dev_prompt = (
        "Du schreibst ein Schweizer Motivationsschreiben (Bewerbungsschreiben). "
        "Du kannst Google Places APIs verwenden, um korrekte Firmenadressen zu finden. "
        "Gib ausschließlich strukturierte Felder gemäß dem Response-Format zurück. "
        "Keine zusätzlichen Felder, kein Fließtext außerhalb des Schemas.\n\n"
        f"Sprache: {language_hint}\n"
        f"Tonalität: {tone_hint}\n"
        f"Länge: {length_hint}\n"
    )
    if target_role:
        dev_prompt += f"Zielrolle (falls Jobtext unklar): {target_role}\n"

    user_prompt = (
        "JOBBESCHREIBUNG (Text):\n"
        f"{job_text}\n\n"
        "LEBENSLAUF (Textauszug):\n"
        f"{cv_text}\n\n"
        "Anforderungen:\n"
        "- Empfängerblock: Verwende Google Places API um die korrekte Firmenadresse zu finden. "
        "  Wenn du die Firma identifizierst, rufe google_places_text_search auf mit dem Firmennamen. "
        "  Wenn mehrere Resultate zurückkommen, wähle basierend auf dem Job-Text das passendste aus. "
        "  Verwende dann google_places_place_details um die vollständigen Adressdetails zu bekommen. "
        "  Erstelle den Empfängerblock aus: (1) Firma, (2) Strasse + Nr, (3) PLZ Ort.\n"
        "- Wenn Google Places nicht verfügbar ist oder keine guten Resultate liefert, "
        "  erstelle den Empfängerblock wie bisher aus dem Job-Text (2-3 Zeilen, OHNE Kommata).\n"
        "- Body: Beginne IMMER mit einer eigenen Anrede-Zeile als erstem Absatz.\n"
        "  - Wenn im Jobtext eine konkrete Ansprechperson genannt ist (z.B. 'Frau Müller' oder 'Herr Meier'), "
        "    verwende diese korrekt: 'Sehr geehrte Frau Müller' / 'Sehr geehrter Herr Meier'.\n"
        "  - Wenn keine Ansprechperson explizit genannt ist: 'Sehr geehrte Damen und Herren'.\n"
        "  - Erfinde KEINE Ansprechperson und rate keine Namen.\n"
        "- Danach: 2-4 weitere Absätze mit konkretem Fit auf Aufgaben/Anforderungen, Beispiele aus CV.\n"
        "- WICHTIG: Wiederhole im Body KEINEN Empfängerblock und keine Adresszeilen.\n"
        "- WICHTIG: Keine Signatur-/Kontaktzeilen im Body (kein Name + Adresse + Telefon + E-Mail).\n"
        "- Keine erfundenen Fakten; wenn etwas nicht im CV steht, nicht behaupten.\n"
        "- Response-Format für Ansprechperson: Wenn der Jobtext irgendwo einen Namen nennt, der als Kontakt/Empfang "
        "  für die Bewerbung dient (z.B. 'Frau Müller freut sich auf Deine Bewerbung', 'Ihre Kontaktperson: Herr Meier', "
        "  'Questions? Call Mr Smith'), fülle `contact_person` mit `full_name` (Original-Schreibweise) und "
        "  `gender` (`female|male|unknown`). Nur wenn KEIN Name genannt ist, setze `contact_person` auf null.\n"
    )

    model = settings.openai_model or "gpt-5-mini"
    # Removed max_completion_tokens limit - let OpenAI use its default (model's context limit)
    # This prevents "max_output_tokens" incomplete response errors

    # Tool definitions for Google Places API
    tools = []
    if places_service:
        tools = [
            {
                "type": "function",
                "name": "google_places_text_search",
                "description": "Suche nach Firmen in Google Places anhand des Firmennamens. Gibt Kandidaten zurück.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Firmenname oder Suchbegriff für die Places-Suche"
                        },
                        "region_code": {
                            "type": ["string", "null"],
                            "description": "Optionaler Regionscode (z.B. 'CH' für Schweiz)"
                        }
                    },
                    "required": ["query", "region_code"],
                    "additionalProperties": False
                },
                "strict": True
            },
            {
                "type": "function",
                "name": "google_places_place_details",
                "description": "Hole detaillierte Informationen zu einem bestimmten Ort anhand der Place ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "place_id": {
                            "type": "string",
                            "description": "Die Google Places Place ID"
                        }
                    },
                    "required": ["place_id"],
                    "additionalProperties": False
                },
                "strict": True
            }
        ]

    # Tool execution functions
    def execute_google_places_text_search(query: str, region_code: str | None = None) -> str:
        """Execute Google Places Text Search and return JSON string."""
        try:
            max_results = 5  # Limit to avoid too many options for the model
            results = places_service.text_search(query, max_results=max_results)
            return json.dumps(results, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Google Places Text Search failed: query={query}, error={str(e)}")
            return json.dumps({"error": str(e)})

    def execute_google_places_place_details(place_id: str) -> str:
        """Execute Google Places Place Details and return JSON string."""
        try:
            result = places_service.place_details(place_id)
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Google Places Place Details failed: place_id={place_id}, error={str(e)}")
            return json.dumps({"error": str(e)})

    def call_responses_api(input_items: list[dict], apply_structured_output: bool = True) -> LetterData:
        """Call OpenAI Responses API and handle tool calls.
        
        Args:
            input_items: Input messages for the API
            apply_structured_output: Whether to apply structured output format (only after tool calls complete)
        """
        # Build request parameters
        request_params = {
            "model": model,
            "input": input_items,
            # max_output_tokens is not set - OpenAI will use its default (model's context limit)
            # This prevents incomplete responses due to token limits
        }
        
        # Only apply structured outputs when we're sure there are no more tool calls
        if apply_structured_output:
            # OpenAI structured outputs require additionalProperties: false on all objects
            schema = _add_additional_properties_false(LetterData.model_json_schema())
            request_params["text"] = {"format": {"type": "json_schema", "name": "letter_data", "schema": schema, "strict": True}}
        
        # Only include tools and tool_choice if tools are actually available
        if tools:
            request_params["tools"] = tools
            request_params["tool_choice"] = "auto"
        
        try:
            response = client.responses.create(**request_params)
        except Exception as e:
            error_msg = str(e)
            if hasattr(e, 'response') and hasattr(e.response, 'json'):
                try:
                    error_data = e.response.json()
                    error_msg = f"{error_msg} - {error_data}"
                except Exception:
                    pass
            logger.error(f"OpenAI Responses API call failed: {error_msg}")
            raise LlmError(f"OpenAI API error: {error_msg}") from e

        # Process tool calls
        # First, add all response output items to input_items (including function_call items)
        # This is required - the API needs to see the function_call before the function_call_output
        # According to docs: "input_list += response.output" - but we need to filter out response-only fields
        # Response-only fields like "status" should NOT be included in input items
        # CRITICAL: Reasoning items must be followed by a function_call or message - they cannot be standalone
        output_items = list(response.output)
        for i, item in enumerate(output_items):
            # Convert to dict first
            if hasattr(item, "model_dump"):
                item_dict = item.model_dump()
            elif hasattr(item, "dict"):
                item_dict = item.dict()
            elif isinstance(item, dict):
                item_dict = item.copy()
            else:
                # Fallback: convert to dict manually
                item_dict = {"type": getattr(item, "type", None)}
                for attr in ["id", "call_id", "name", "arguments", "role", "content", "summary"]:
                    if hasattr(item, attr):
                        value = getattr(item, attr)
                        if attr == "content" and isinstance(value, list):
                            item_dict[attr] = [
                                (
                                    sub_item.model_dump()
                                    if hasattr(sub_item, "model_dump")
                                    else (sub_item.dict() if hasattr(sub_item, "dict") else sub_item)
                                    if not isinstance(sub_item, dict)
                                    else sub_item
                                )
                                for sub_item in value
                            ]
                        else:
                            item_dict[attr] = value
            
            item_type = item_dict.get("type")
            
            # CRITICAL: Reasoning items must be followed by a function_call, message, or custom_tool_call
            # If a reasoning item is the last item or not followed by a valid item, skip it
            if item_type == "reasoning":
                # Check if there's a following item that's valid
                has_following_item = False
                if i + 1 < len(output_items):
                    next_item = output_items[i + 1]
                    next_type = getattr(next_item, "type", None) if hasattr(next_item, "type") else (next_item.get("type") if isinstance(next_item, dict) else None)
                    # Reasoning items can be followed by function_call, message, or custom_tool_call
                    if next_type in ["function_call", "message", "custom_tool_call"]:
                        has_following_item = True
                
                if not has_following_item:
                    # Skip this reasoning item - it doesn't have a required following item
                    logger.warning(f"Skipping reasoning item {item_dict.get('id')} - no valid following item")
                    continue
            
            # Remove response-only fields that shouldn't be in input items
            # According to API docs, these fields are only in responses, not in input:
            # - "status": only in response items
            # Keep only fields that are valid for input items
            if item_type == "function_call":
                # Valid fields: type, id, call_id, name, arguments
                item_dict = {k: v for k, v in item_dict.items() if k in ["type", "id", "call_id", "name", "arguments"]}
            elif item_type == "message":
                # Valid fields: type, id, role, content
                item_dict = {k: v for k, v in item_dict.items() if k in ["type", "id", "role", "content"]}
            elif item_type == "reasoning":
                # Valid fields: type, id, content, summary
                item_dict = {k: v for k, v in item_dict.items() if k in ["type", "id", "content", "summary"]}
            else:
                # For unknown types, just remove status
                item_dict.pop("status", None)
            
            input_items.append(item_dict)
        
        # Now execute tools and add their outputs
        has_tool_calls = False
        for item in response.output:
            if item.type == "function_call":
                has_tool_calls = True
                tool_name = item.name
                tool_args = json.loads(item.arguments)

                # Execute the tool
                if tool_name == "google_places_text_search":
                    output = execute_google_places_text_search(
                        query=tool_args["query"],
                        region_code=tool_args.get("region_code")
                    )
                elif tool_name == "google_places_place_details":
                    output = execute_google_places_place_details(
                        place_id=tool_args["place_id"]
                    )
                else:
                    output = json.dumps({"error": f"Unknown tool: {tool_name}"})

                # Add tool result to input for next call
                input_items.append({
                    "type": "function_call_output",
                    "call_id": item.call_id,
                    "output": output
                })

        # If there were tool calls, we need to make another API call
        # Don't apply structured outputs yet - wait until all tool calls are done
        if has_tool_calls:
            return call_responses_api(input_items, apply_structured_output=False)
        
        # No tool calls - if we weren't applying structured outputs (because tools were used),
        # make one final call with structured outputs to get the formatted response
        if not apply_structured_output and tools:
            return call_responses_api(input_items, apply_structured_output=True)

        # Check for incomplete responses or errors
        if response.status != "completed":
            reason = getattr(response.incomplete_details, "reason", None) if hasattr(response, "incomplete_details") and response.incomplete_details else None
            raise LlmError(f"Response incomplete: {reason}")
        
        # No more tool calls, extract the final LetterData
        for item in response.output:
            if item.type == "message":
                for content_item in item.content:
                    # Check for refusals first
                    if content_item.type == "refusal":
                        refusal_text = getattr(content_item, "refusal", "Model refused to generate response")
                        raise LlmError(f"Model refused to generate response: {refusal_text}")
                    elif content_item.type == "output_text":
                        try:
                            # Parse the JSON response
                            parsed_data = json.loads(content_item.text)
                            return LetterData(**parsed_data)
                        except (json.JSONDecodeError, ValueError) as e:
                            raise LlmError(f"Failed to parse LLM response as LetterData: {e}")

        raise LlmError("No valid LetterData found in response")

    # Initial input
    input_items = [
        {"role": "developer", "content": dev_prompt},
        {"role": "user", "content": user_prompt}
    ]

    try:
        # If tools are available, start without structured outputs (model may need to call tools first)
        # If no tools, we can apply structured outputs immediately
        initial_apply_structured = not bool(tools)
        letter = _sanitize_letter(call_responses_api(input_items, apply_structured_output=initial_apply_structured))

        # Resolve recipient address with Places API confidence assessment
        address_result = _resolve_recipient_address(
            job_text=job_text,
            letter_recipient_block=letter.recipient_block,
            places_service=places_service,
            is_from_firecrawl=is_from_firecrawl
        )

        logger.info(
            "Address resolution: source=%s, confidence=%s",
            address_result.source,
            address_result.confidence,
            extra={
                "address_source": address_result.source,
                "address_confidence": address_result.confidence,
            },
        )

        if letter.contact_person:
            logger.info(
                "LLM contact person: %s (%s)",
                letter.contact_person.full_name,
                letter.contact_person.gender,
                extra={
                    "contact_full_name": letter.contact_person.full_name,
                    "contact_gender": letter.contact_person.gender,
                },
            )
        honorific, name = _contact_from_job_text(
            job_text=job_text, language=options.language, contact_person=letter.contact_person
        )
        salutation = _salutation_from_contact(language=options.language, honorific=honorific, name=name)
        body = _ensure_salutation_first_paragraph(body_paragraphs=letter.body_paragraphs, salutation=salutation)
        contact_line = None
        if name:
            contact_line = _contact_line(
                name=name,
                gender=letter.contact_person.gender if letter.contact_person else ContactGender.unknown,
                language=options.language,
                honorific_hint=honorific,
            )
        recipient_block = _insert_contact_line_into_recipient_block(address_result.recipient_block, contact_line)
        return letter.model_copy(update={"body_paragraphs": body, "recipient_block": recipient_block})
    except Exception as exc:  # noqa: BLE001
        logger.error(f"LLM generation failed: {exc}")
        raise LlmError(f"LLM generation failed: {exc}") from exc


