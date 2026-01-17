from __future__ import annotations

from datetime import date

from app.models import Language


def format_letter_date(today: date, language: Language) -> str:
    if language == Language.en:
        return today.strftime("%B %d, %Y")

    if language == Language.fr:
        months = [
            "janvier",
            "février",
            "mars",
            "avril",
            "mai",
            "juin",
            "juillet",
            "août",
            "septembre",
            "octobre",
            "novembre",
            "décembre",
        ]
        return f"{today.day} {months[today.month - 1]} {today.year}"

    if language == Language.it:
        months = [
            "gennaio",
            "febbraio",
            "marzo",
            "aprile",
            "maggio",
            "giugno",
            "luglio",
            "agosto",
            "settembre",
            "ottobre",
            "novembre",
            "dicembre",
        ]
        return f"{today.day} {months[today.month - 1]} {today.year}"

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


