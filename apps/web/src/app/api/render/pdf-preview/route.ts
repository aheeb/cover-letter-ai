import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getPlanIdentifier, isFreeAccessUser } from "@/lib/access";
import { getApiBaseUrl } from "@/lib/env";

const MAX_PDF_BYTES = 8_000_000;

function getInternalTokenHeader(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  return token ? { "X-Internal-Token": token } : {};
}

/** Converts an authenticated user's generated PDF into a PNG preview. */
export async function POST(request: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bypass = await isFreeAccessUser(userId);
  const planSlug = getPlanIdentifier();
  if (!bypass && (!planSlug || !has({ plan: planSlug }))) {
    return NextResponse.json({ error: "Active yearly plan required." }, { status: 403 });
  }

  const pdf = await request.arrayBuffer();
  if (pdf.byteLength === 0 || pdf.byteLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "Invalid PDF size." }, { status: 400 });
  }

  const form = new FormData();
  form.append("pdf", new Blob([pdf], { type: "application/pdf" }), "preview.pdf");

  let apiResponse: Response;
  try {
    apiResponse = await fetch(new URL("/v1/render/pdf-preview", getApiBaseUrl()), {
      method: "POST",
      headers: getInternalTokenHeader(),
      body: form,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reach API backend",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  if (!apiResponse.ok) {
    return new NextResponse((await apiResponse.text()) || "Upstream error", {
      status: apiResponse.status,
    });
  }

  return new NextResponse(await apiResponse.arrayBuffer(), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}
