from __future__ import annotations

import re

from openai import OpenAI

from app.models import ContactGender, ContactPerson, GenerateOptions, Language, Length, LetterData
from app.settings import get_settings


class LlmError(RuntimeError):
    pass


def _max_completion_tokens(options: GenerateOptions) -> int:
    """
    Upper bound for generated tokens (controls response length/cost).
    """
    if options.length == Length.short:
        return 450
    if options.length == Length.medium:
        return 650
    return 900


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
        "fragen",
        "auskunft",
        "recruit",
        "hiring",
        "talent",
        "hr",
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
    if _normalize_for_search(surname) not in normalized_job:
        # As a stronger check, see if the full name appears.
        if _normalize_for_search(full_name) not in normalized_job:
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


def _ensure_salutation_first_paragraph(
    *, body_paragraphs: list[str], salutation: str
) -> list[str]:
    body = [p.strip() for p in body_paragraphs if p and p.strip()]
    salutation = _normalize_salutation_line(salutation)
    if not salutation:
        return body
    if not body:
        return [salutation]

    first = body[0].strip()

    # If the first paragraph already starts with a salutation, normalize and ensure it's its own paragraph.
    if _SALUTATION_RE.match(first):
        # Split "Sehr geehrte ... , rest" into two paragraphs to match the desired formatting.
        if "\n" in first:
            head, tail = first.split("\n", 1)
            head = _normalize_salutation_line(head)
            tail = tail.strip()
            out = [head]
            if tail:
                out.append(tail)
            out.extend(body[1:])
            return out
        if "," in first:
            head, tail = first.split(",", 1)
            head = _normalize_salutation_line(head)
            tail = tail.strip()
            out = [head]
            if tail:
                out.append(tail)
            out.extend(body[1:])
            return out
        body[0] = _normalize_salutation_line(first)
        return body

    # Otherwise, prepend the computed salutation.
    return [salutation, *body]


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


def generate_letter(*, job_text: str, cv_text: str, options: GenerateOptions) -> LetterData:
    settings = get_settings()
    if not settings.openai_api_key:
        raise LlmError("Missing OPENAI_API_KEY.")

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.request_timeout_seconds)

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
        "- Empfängerblock: 2-3 Zeilen, OHNE Kommata: (1) Firma, (2) Strasse + Nr (falls ableitbar), (3) PLZ Ort (falls ableitbar).\n"
        "- Body: Beginne IMMER mit einer eigenen Anrede-Zeile als erstem Absatz.\n"
        "  - Wenn im Jobtext eine konkrete Ansprechperson genannt ist (z.B. 'Frau Müller' oder 'Herr Meier'), verwende diese korrekt: 'Sehr geehrte Frau Müller' / 'Sehr geehrter Herr Meier'.\n"
        "  - Wenn keine Ansprechperson explizit genannt ist: 'Sehr geehrte Damen und Herren'.\n"
        "  - Erfinde KEINE Ansprechperson und rate keine Namen.\n"
        "- Danach: 2-4 weitere Absätze mit konkretem Fit auf Aufgaben/Anforderungen, Beispiele aus CV.\n"
        "- WICHTIG: Wiederhole im Body KEINEN Empfängerblock und keine Adresszeilen.\n"
        "- WICHTIG: Keine Signatur-/Kontaktzeilen im Body (kein Name + Adresse + Telefon + E-Mail).\n"
        "- Keine erfundenen Fakten; wenn etwas nicht im CV steht, nicht behaupten.\n"
        "- Response-Format: Wenn eine konkrete Ansprechperson im Jobtext erwähnt ist, fülle `contact_person` mit `full_name` (Original-Schreibweise) und `gender` (`female|male|unknown`). Sonst setze `contact_person` auf null.\n"
    )

    model = settings.openai_model or "gpt-5-mini"
    max_completion_tokens = _max_completion_tokens(options)

    def call_parse(*, max_tokens: int) -> LetterData:
        completion = client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "developer", "content": dev_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=LetterData,
            max_completion_tokens=max_tokens,
            # gpt-5-mini does not support `none` (only gpt-5.1+ supports disabling reasoning).
            reasoning_effort="minimal",
        )
        message = completion.choices[0].message
        if message.parsed is None:
            raise LlmError("LLM did not return parsed structured output.")
        return message.parsed

    try:
        letter = _sanitize_letter(call_parse(max_tokens=max_completion_tokens))
        honorific, name = _contact_from_job_text(
            job_text=job_text, language=options.language, contact_person=letter.contact_person
        )
        salutation = _salutation_from_contact(language=options.language, honorific=honorific, name=name)
        body = _ensure_salutation_first_paragraph(body_paragraphs=letter.body_paragraphs, salutation=salutation)
        return letter.model_copy(update={"body_paragraphs": body})
    except Exception as exc:  # noqa: BLE001
        # If the JSON parse failed due to hitting the length limit, retry once with a bit more headroom.
        msg = str(exc)
        if "length limit was reached" in msg or "Could not parse response content" in msg:
            letter = _sanitize_letter(call_parse(max_tokens=max_completion_tokens + 500))
            honorific, name = _contact_from_job_text(
                job_text=job_text, language=options.language, contact_person=letter.contact_person
            )
            salutation = _salutation_from_contact(language=options.language, honorific=honorific, name=name)
            body = _ensure_salutation_first_paragraph(body_paragraphs=letter.body_paragraphs, salutation=salutation)
            return letter.model_copy(update={"body_paragraphs": body})
        raise

    # Unreachable


