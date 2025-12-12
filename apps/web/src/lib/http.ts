export class HttpError extends Error {
  public readonly status: number;
  public readonly bodyText: string;

  constructor(args: { status: number; bodyText: string }) {
    super(`HTTP ${args.status}`);
    this.status = args.status;
    this.bodyText = args.bodyText;
  }
}

export async function fetchOk(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new HttpError({ status: res.status, bodyText });
  }
  return res;
}
