import { AppShell } from "@/components/AppShell";
import { GeneratorForm } from "@/components/GeneratorForm";

export default function Page() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">
          Motivationsschreiben Generator
        </h1>
        <p className="mt-3 text-zinc-600">
          Job-Link oder Jobtext + CV (PDF) → sauberes Schweizer Motivationsschreiben als Word-Download.
        </p>

        <div className="mt-8">
          <GeneratorForm />
        </div>
      </main>
    </AppShell>
  );
}


