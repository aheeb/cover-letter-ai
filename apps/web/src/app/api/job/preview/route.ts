import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/env";

function getInternalTokenHeader(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  return token ? { "X-Internal-Token": token } : {};
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const jobUrl = formData.get("job_url");
  if (typeof jobUrl !== "string" || jobUrl.trim().length === 0) {
    return NextResponse.json(
      { error: "job_url is required" },
      { status: 400 }
    );
  }

  const apiForm = new FormData();
  apiForm.append("job_url", jobUrl.trim());

  const apiBaseUrl = getApiBaseUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(new URL("/v1/job/preview", apiBaseUrl), {
      method: "POST",
      headers: {
        ...getInternalTokenHeader(),
      },
      body: apiForm,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach API backend",
        api_base_url: apiBaseUrl,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  if (!apiRes.ok) {
    const bodyText = await apiRes.text();
    return new NextResponse(bodyText || "Upstream error", {
      status: apiRes.status,
    });
  }

  const data = await apiRes.json();
  return NextResponse.json(data);
}
