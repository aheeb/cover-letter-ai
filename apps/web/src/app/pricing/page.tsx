import { PricingTable } from "@clerk/nextjs";
import { AppLayout } from "@/components/layout";

export default function Page() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="mt-1 text-muted-foreground">
            Get unlimited access to generate professional cover letters.
          </p>
        </div>
        <PricingTable />
      </div>
    </AppLayout>
  );
}
