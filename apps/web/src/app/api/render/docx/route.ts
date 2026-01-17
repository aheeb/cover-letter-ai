import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { formatSenderAddress, type SenderProfile } from "@/lib/sender";
import { getApiBaseUrl } from "@/lib/env";

type ProfileMetadata = {
  cover_letter?: {
    sender?: Partial<SenderProfile>;
  };
};

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

async function getSenderProfile(userId: string): Promise<SenderProfile | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.privateMetadata as ProfileMetadata;
  const sender = metadata?.cover_letter?.sender;

  const profile: SenderProfile = {
    name: sender?.name ?? "",
    street: sender?.street ?? "",
    postalCode: sender?.postalCode ?? "",
    city: sender?.city ?? "",
    country: sender?.country ?? "",
    location: sender?.location ?? "",
  };

  if (
    !profile.name ||
    !profile.street ||
    !profile.postalCode ||
    !profile.city ||
    !profile.location
  ) {
    return null;
  }

  return profile;
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

  const senderProfile = await getSenderProfile(userId);
  if (!senderProfile) {
    return NextResponse.json(
      { error: "Sender details missing. Add them in Settings." },
      { status: 400 }
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const payload = {
    ...body,
    sender_adress: formatSenderAddress(senderProfile),
    sender_name: senderProfile.name,
    location: senderProfile.location,
  };

  const apiBaseUrl = getApiBaseUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(new URL("/v1/render/docx", apiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getInternalTokenHeader(),
      },
      body: JSON.stringify(payload),
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

  const buf = await apiRes.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
}
