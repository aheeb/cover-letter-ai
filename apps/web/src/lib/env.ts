export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (raw && raw.length > 0) return raw;

  // If this is running on Vercel (i.e. a deployed frontend), never fall back to localhost.
  // Default to the production Railway API domain so the app works even if env vars were missed.
  const isVercel = Boolean(process.env.VERCEL);
  if (isVercel) return "https://cover-letter-ai-production.up.railway.app";

  // Local dev default
  return "http://localhost:8000";
}
