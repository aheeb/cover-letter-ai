from __future__ import annotations

import json
from typing import Any

import httpx

from app.logging import get_logger
from app.settings import Settings

logger = get_logger(__name__)


class GooglePlacesError(RuntimeError):
    pass


class GooglePlacesService:
    """
    Google Places API (New) client for Text Search and Place Details.

    - Text Search (New): POST to https://places.googleapis.com/v1/places:searchText
      Requires X-Goog-Api-Key + X-Goog-FieldMask headers
    - Place Details (New): GET to https://places.googleapis.com/v1/places/PLACE_ID
      Requires X-Goog-Api-Key + X-Goog-FieldMask headers
    """

    def __init__(self, api_key: str, region_code: str | None = None, language_code: str | None = None, timeout: float = 10.0):
        self.api_key = api_key
        self.region_code = region_code
        self.language_code = language_code
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def text_search(self, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        """
        Perform Text Search (New) to find places matching the query.

        Returns list of place candidates with minimal fields for address resolution.
        """
        url = "https://places.googleapis.com/v1/places:searchText"

        request_body = {
            "textQuery": query,
            "pageSize": max_results,
        }

        if self.region_code:
            request_body["regionCode"] = self.region_code
        if self.language_code:
            request_body["languageCode"] = self.language_code

        # FieldMask for minimal address-relevant fields
        field_mask = "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.postalAddress,places.types"

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }

        logger.info(f"Google Places Text Search: query={query}, max_results={max_results}")

        try:
            response = self._client.post(url, json=request_body, headers=headers)
            response.raise_for_status()

            data = response.json()
            places = data.get("places", [])

            logger.info(f"Google Places Text Search success: query={query}, results_count={len(places)}")
            return places

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                error_data = e.response.json()
                error_message = error_data.get("error", {}).get("message", "Bad request")
                logger.warning(f"Google Places Text Search failed: query={query}, status_code=400, error={error_message}")
                return []  # Return empty list for bad requests (likely no matches)
            elif e.response.status_code == 403:
                # 403 Forbidden usually means API key issue
                try:
                    error_data = e.response.json()
                    error_message = error_data.get("error", {}).get("message", "Forbidden")
                    error_status = error_data.get("error", {}).get("status", "PERMISSION_DENIED")
                    error_details = error_data.get("error", {}).get("details", [])
                    logger.error(
                        f"Google Places Text Search 403 Forbidden: query={query}, "
                        f"error={error_message}, status={error_status}, details={error_details}. "
                        f"Check: 1) API key is valid and set in GOOGLE_PLACES_API_KEY, "
                        f"2) Places API (New) is enabled in Google Cloud Console, "
                        f"3) Billing is enabled for the project, "
                        f"4) API key restrictions (IP/referrer) allow this request"
                    )
                except Exception:
                    logger.error(f"Google Places Text Search 403 Forbidden: query={query}, error={str(e)}, response_text={e.response.text if hasattr(e.response, 'text') else 'N/A'}")
                raise GooglePlacesError(f"Places API 403 Forbidden - check API key configuration: {error_message if 'error_message' in locals() else 'Unknown error'}") from e
            else:
                logger.error(f"Google Places Text Search HTTP error: query={query}, status_code={e.response.status_code}, error={str(e)}")
                raise GooglePlacesError(f"Places API error: {e.response.status_code}") from e
        except Exception as e:
            logger.error(f"Google Places Text Search error: query={query}, error={str(e)}")
            raise GooglePlacesError(f"Places API request failed: {e}") from e

    def place_details(self, place_id: str) -> dict[str, Any]:
        """
        Get detailed information for a specific place by ID.

        Returns comprehensive place details for address construction.
        """
        url = f"https://places.googleapis.com/v1/places/{place_id}"

        # FieldMask for all address and name fields needed
        field_mask = "id,displayName,formattedAddress,addressComponents,postalAddress,types,businessStatus"

        headers = {
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }

        logger.info(f"Google Places Place Details: place_id={place_id}")

        try:
            response = self._client.get(url, headers=headers)
            response.raise_for_status()

            place_details = response.json()

            logger.info(f"Google Places Place Details success: place_id={place_id}")
            return place_details

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"Google Places Place Details not found: place_id={place_id}, status_code=404")
                raise GooglePlacesError(f"Place not found: {place_id}") from e
            elif e.response.status_code == 403:
                # 403 Forbidden usually means API key issue
                try:
                    error_data = e.response.json()
                    error_message = error_data.get("error", {}).get("message", "Forbidden")
                    error_status = error_data.get("error", {}).get("status", "PERMISSION_DENIED")
                    error_details = error_data.get("error", {}).get("details", [])
                    logger.error(
                        f"Google Places Place Details 403 Forbidden: place_id={place_id}, "
                        f"error={error_message}, status={error_status}, details={error_details}. "
                        f"Check: 1) API key is valid and set in GOOGLE_PLACES_API_KEY, "
                        f"2) Places API (New) is enabled in Google Cloud Console, "
                        f"3) Billing is enabled for the project, "
                        f"4) API key restrictions (IP/referrer) allow this request"
                    )
                except Exception:
                    logger.error(f"Google Places Place Details 403 Forbidden: place_id={place_id}, error={str(e)}, response_text={e.response.text if hasattr(e.response, 'text') else 'N/A'}")
                raise GooglePlacesError(f"Places API 403 Forbidden - check API key configuration: {error_message if 'error_message' in locals() else 'Unknown error'}") from e
            else:
                logger.error(f"Google Places Place Details HTTP error: place_id={place_id}, status_code={e.response.status_code}, error={str(e)}")
                raise GooglePlacesError(f"Places API error: {e.response.status_code}") from e
        except Exception as e:
            logger.error(f"Google Places Place Details error: place_id={place_id}, error={str(e)}")
            raise GooglePlacesError(f"Places API request failed: {e}") from e


def create_google_places_service(settings: Settings) -> GooglePlacesService | None:
    """
    Create Google Places service if API key is configured.
    """
    if not settings.google_places_api_key:
        logger.debug("Google Places API key not configured, skipping Places service")
        return None

    # Log API key prefix for debugging (first 10 chars + last 4 chars for verification)
    api_key_preview = (
        f"{settings.google_places_api_key[:10]}...{settings.google_places_api_key[-4:]}"
        if len(settings.google_places_api_key) > 14
        else "***"
    )
    logger.info(f"Creating Google Places service with API key: {api_key_preview}")

    return GooglePlacesService(
        api_key=settings.google_places_api_key,
        region_code=settings.google_places_region_code,
        language_code=settings.google_places_language_code,
        timeout=settings.request_timeout_seconds,
    )
