from __future__ import annotations

from datetime import date

from app.models import Language


def format_letter_date(today: date, language: Language) -> str:
    if language == Language.en:
        return today.strftime("%B %d, %Y")

    months = [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
    ]
    month_name = months[today.month - 1]
    return f"{today.day}. {month_name} {today.year}"


