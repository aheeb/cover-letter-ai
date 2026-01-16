import { UserProfile } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <UserProfile />
    </div>
  );
}
