import { NextResponse } from "next/server";
import { isLocale } from "@/i18n/config";

function normalizeLocale(value: string): string {
  return value.toLowerCase().replace("_", "-");
}

function resolveLocale(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeLocale(value);
  if (isLocale(normalized)) return normalized;
  const base = normalized.split("-")[0];
  if (base && isLocale(base)) return base;
  return null;
}

export async function POST(request: Request) {
  let payload: { locale?: string } | null = null;
  try {
    payload = (await request.json()) as { locale?: string };
  } catch {
    payload = null;
  }

  const resolved = resolveLocale(payload?.locale);
  if (!resolved) {
    return NextResponse.json(
      { error: "Unsupported locale" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ locale: resolved });
  response.cookies.set("locale", resolved, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const dynamic = "force-dynamic";
