import { auth, clerkClient } from "@clerk/nextjs/server";
import { UTApi } from "uploadthing/server";
import { NextResponse } from "next/server";

type ProfileMetadata = {
  cover_letter?: {
    sender?: {
      name?: string;
      street?: string;
      postalCode?: string;
      city?: string;
      country?: string;
      location?: string;
    };
    cv?: {
      fileKey?: string;
      fileName?: string;
      fileUrl?: string;
    };
  };
};

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

function getPlanSlug(): string | null {
  const planId = process.env.CLERK_BILLING_PLAN_ID?.trim();
  if (planId && planId.length > 0) return planId;
  const slug = process.env.CLERK_BILLING_PLAN_SLUG?.trim();
  return slug && slug.length > 0 ? slug : null;
}

async function isBypassUser(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.emailAddresses.some(
    (email) => email.emailAddress.toLowerCase() === "andri.heeb2002@gmail.com"
  );
}

function getInternalTokenHeader(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  return token ? { "X-Internal-Token": token } : {};
}

async function getCvFile(userId: string, incomingFile?: File | null): Promise<File | null> {
  if (incomingFile) return incomingFile;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.privateMetadata as ProfileMetadata;
  const fileKey = metadata?.cover_letter?.cv?.fileKey;
  const fileUrl = metadata?.cover_letter?.cv?.fileUrl;
  const fileName = metadata?.cover_letter?.cv?.fileName || "cv.pdf";
  if (!fileKey && !fileUrl) return null;

  const url = fileUrl
    ? fileUrl
    : (await utapi.generateSignedURL(fileKey!, { expiresIn: "15 minutes" })).ufsUrl;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch CV file");
  }
  const blob = await res.blob();
  return new File([blob], fileName, { type: "application/pdf" });
}

export async function POST(request: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bypass = await isBypassUser(userId);
  if (!bypass) {
    const planSlug = getPlanSlug();
    if (!planSlug) {
      return NextResponse.json(
        { error: "Missing CLERK_BILLING_PLAN_ID or CLERK_BILLING_PLAN_SLUG" },
        { status: 500 }
      );
    }
    if (!has({ plan: planSlug })) {
      return NextResponse.json(
        { error: "Active yearly plan required." },
        { status: 403 }
      );
    }
  }

  const incomingForm = await request.formData();
  const incomingCv = incomingForm.get("cv_pdf");
  const incomingFile =
    incomingCv instanceof File && incomingCv.size > 0 ? incomingCv : null;

  if (!incomingFile && !process.env.UPLOADTHING_TOKEN) {
    return NextResponse.json(
      { error: "UPLOADTHING_TOKEN is not configured" },
      { status: 500 }
    );
  }

  let cvFile: File | null = null;
  try {
    cvFile = await getCvFile(userId, incomingFile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load CV" },
      { status: 500 }
    );
  }

  if (!cvFile) {
    return NextResponse.json(
      { error: "No CV uploaded yet. Add it in Settings first." },
      { status: 400 }
    );
  }

  const apiForm = new FormData();
  apiForm.append("cv_pdf", cvFile);

  const fields = ["job_url", "job_text", "language", "tone", "length", "target_role"];
  for (const field of fields) {
    const value = incomingForm.get(field);
    if (typeof value === "string" && value.trim().length > 0) {
      apiForm.append(field, value.trim());
    }
  }

  const apiBaseUrl =
    process.env.API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:8000";

  const apiRes = await fetch(new URL("/v1/letter", apiBaseUrl), {
    method: "POST",
    headers: {
      ...getInternalTokenHeader(),
    },
    body: apiForm,
  });

  if (!apiRes.ok) {
    const bodyText = await apiRes.text();
    return new NextResponse(bodyText || "Upstream error", {
      status: apiRes.status,
    });
  }

  const data = await apiRes.json();
  return NextResponse.json(data);
}
