from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Language(str, Enum):
    de = "de"
    en = "en"


class Tone(str, Enum):
    professional = "professional"
    friendly = "friendly"
    concise = "concise"


class Length(str, Enum):
    short = "short"
    medium = "medium"
    long = "long"


class GenerateOptions(BaseModel):
    language: Language = Language.de
    tone: Tone = Tone.professional
    length: Length = Length.medium
    target_role: str | None = None


class LetterData(BaseModel):
    company: str = Field(min_length=1)
    role_title: str = Field(min_length=1)
    recipient_block: str = Field(min_length=1, description="Recipient address block (company + address if known).")
    body_paragraphs: list[str] = Field(min_length=2)


class JobPreview(BaseModel):
    role: str | None = None


