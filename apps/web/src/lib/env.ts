export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  return raw && raw.length > 0 ? raw : "http://localhost:8000";
}
