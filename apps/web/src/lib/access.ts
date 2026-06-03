import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

const FREE_ACCESS_EMAILS = new Set([
  "andri.heeb2002@gmail.com",
  "cornelia@zeh-klartext.ch",
  "jessiefallout4@gmail.com",
]);

export function getPlanIdentifier(): string | null {
  const planId = process.env.CLERK_BILLING_PLAN_ID?.trim();
  if (planId && planId.length > 0) return planId;
  const planSlug = process.env.CLERK_BILLING_PLAN_SLUG?.trim();
  return planSlug && planSlug.length > 0 ? planSlug : null;
}

export async function isFreeAccessUser(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.emailAddresses.some((email) =>
    FREE_ACCESS_EMAILS.has(email.emailAddress.trim().toLowerCase())
  );
}
