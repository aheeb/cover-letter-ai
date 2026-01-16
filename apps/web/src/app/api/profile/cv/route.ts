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

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.UPLOADTHING_TOKEN) {
    return NextResponse.json(
      { error: "UPLOADTHING_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("cv_pdf");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing cv_pdf file" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "cv_pdf must be a PDF" }, { status: 400 });
  }

  const uploadResult = await utapi.uploadFiles([file], {
    acl: "public-read",
    contentDisposition: "attachment",
  });

  const result = Array.isArray(uploadResult)
    ? uploadResult.length > 0
      ? uploadResult[0]
      : null
    : uploadResult;

  if (!result || !result.data || result.error) {
    return NextResponse.json(
      { error: result?.error?.message || "Failed to upload CV" },
      { status: 500 }
    );
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.privateMetadata as ProfileMetadata;

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      cover_letter: {
        sender: metadata?.cover_letter?.sender ?? {},
        cv: {
          fileKey: result.data.key,
          fileName: result.data.name,
          fileUrl: result.data.url,
        },
      },
    },
  });

  return NextResponse.json({
    fileKey: result.data.key,
    fileName: result.data.name,
  });
}
