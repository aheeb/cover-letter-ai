import { PricingTable } from "@clerk/nextjs";
import { AppLayout } from "@/components/layout";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const tPricing = await getTranslations("pricing");
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tPricing("title")}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {tPricing("description")}
          </p>
        </div>
        <PricingTable />
      </div>
    </AppLayout>
  );
}
