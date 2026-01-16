import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type SenderProfile = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country?: string;
  location: string;
};

type ProfileMetadata = {
  cover_letter?: {
    sender?: Partial<SenderProfile>;
    cv?: {
      fileKey?: string;
      fileName?: string;
    };
  };
};

function normalizeSender(sender?: Partial<SenderProfile>): SenderProfile {
  return {
    name: sender?.name ?? "",
    street: sender?.street ?? "",
    postalCode: sender?.postalCode ?? "",
    city: sender?.city ?? "",
    country: sender?.country ?? "",
    location: sender?.location ?? "",
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.privateMetadata as ProfileMetadata;

  return NextResponse.json({
    sender: normalizeSender(metadata?.cover_letter?.sender),
    cv: {
      fileKey: metadata?.cover_letter?.cv?.fileKey ?? null,
      fileName: metadata?.cover_letter?.cv?.fileName ?? null,
    },
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as Partial<SenderProfile> | null;
  if (!payload) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const sender: SenderProfile = {
    name: (payload.name ?? "").trim(),
    street: (payload.street ?? "").trim(),
    postalCode: (payload.postalCode ?? "").trim(),
    city: (payload.city ?? "").trim(),
    country: (payload.country ?? "").trim(),
    location: (payload.location ?? "").trim(),
  };

  if (!sender.name || !sender.street || !sender.postalCode || !sender.city || !sender.location) {
    return NextResponse.json(
      { error: "name, street, postalCode, city, and location are required." },
      { status: 400 }
    );
  }

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      cover_letter: {
        sender,
      },
    },
  });

  return NextResponse.json({ sender });
}
