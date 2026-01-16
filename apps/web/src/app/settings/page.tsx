import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/layout";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { SenderProfile } from "@/lib/sender";

type ProfileResponse = {
  sender: SenderProfile;
  cv: {
    fileKey: string | null;
    fileName: string | null;
  };
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

async function getProfile(userId: string): Promise<ProfileResponse> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.privateMetadata as ProfileMetadata;

  return {
    sender: normalizeSender(metadata?.cover_letter?.sender),
    cv: {
      fileKey: metadata?.cover_letter?.cv?.fileKey ?? null,
      fileName: metadata?.cover_letter?.cv?.fileName ?? null,
    },
  };
}

export default async function Page() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const profile = await getProfile(userId);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <SettingsForm initialData={profile} />
      </div>
    </AppLayout>
  );
}
