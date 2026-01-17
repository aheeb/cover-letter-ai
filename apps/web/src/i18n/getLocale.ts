import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, locales, type Locale } from "./config";

function normalizeLocale(value: string): string {
  return value.toLowerCase().replace("_", "-");
}

function parseAcceptLanguage(headerValue: string): string[] {
  return headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [lang = "", qValue] = part
        .split(";")
        .map((segment) => segment.trim());
      if (!lang) return null;
      const q =
        qValue && qValue.startsWith("q=")
          ? Number.parseFloat(qValue.slice(2))
          : 1;
      return { lang, q: Number.isNaN(q) ? 1 : q };
    })
    .filter((entry): entry is { lang: string; q: number } => Boolean(entry))
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.lang);
}

function resolveLocaleFromHeader(headerValue: string | null): Locale | null {
  if (!headerValue) return null;
  const ordered = parseAcceptLanguage(headerValue);
  for (const entry of ordered) {
    const normalized = normalizeLocale(entry);
    if (isLocale(normalized)) return normalized;
    const base = normalized.split("-")[0];
    if (base && isLocale(base)) return base;
  }
  return null;
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  if (cookieLocale) {
    const normalized = normalizeLocale(cookieLocale);
    if (isLocale(normalized)) return normalized;
  }

  const headerStore = await headers();
  const headerLocale = resolveLocaleFromHeader(
    headerStore.get("accept-language")
  );
  if (headerLocale) return headerLocale;

  return defaultLocale;
}

export const supportedLocales = locales;
