import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "@/components/layout";
import { GeneratorForm } from "@/components/GeneratorForm";
import { Button } from "@/components/ui/button";
import { getPlanIdentifier, isFreeAccessUser } from "@/lib/access";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { FileText, Upload, Sparkles, Download, ArrowRight, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function LandingPage({
  tLanding,
  tActions,
}: {
  tLanding: Translator;
  tActions: Translator;
}) {
  return (
    <AppLayout showSidebar={false}>
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
        {/* Hero Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{tLanding("badge")}</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {tLanding("headlineLine1")}
            <br />
            <span className="text-muted-foreground">
              {tLanding("headlineLine2")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {tLanding("description")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SignUpButton mode="modal">
              <Button size="lg" className="w-full sm:w-auto">
                {tActions("getStarted")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                {tActions("signIn")}
              </Button>
            </SignInButton>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {tLanding("priceNote")}
          </p>
        </div>

        {/* How it Works */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            {tLanding("howItWorks")}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {tLanding("steps.uploadTitle")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tLanding("steps.uploadDescription")}
              </p>
            </div>
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {tLanding("steps.jobTitle")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tLanding("steps.jobDescription")}
              </p>
            </div>
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {tLanding("steps.downloadTitle")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tLanding("steps.downloadDescription")}
              </p>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}

function OnboardingPage({
  tOnboarding,
  tActions,
}: {
  tOnboarding: Translator;
  tActions: Translator;
}) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tOnboarding("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {tOnboarding("subtitle")}
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1: Subscribe */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  1
                </div>
                <div>
                  <CardTitle className="text-base">
                    {tOnboarding("step1Title")}
                  </CardTitle>
                  <CardDescription>
                    {tOnboarding("step1Description")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/pricing">
                  {tActions("viewPricing")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Profile */}
          <Card className="opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted text-muted-foreground text-sm font-medium">
                  2
                </div>
                <div>
                  <CardTitle className="text-base">
                    {tOnboarding("step2Title")}
                  </CardTitle>
                  <CardDescription>
                    {tOnboarding("step2Description")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {tOnboarding("stepUnavailable")}
              </p>
            </CardContent>
          </Card>

          {/* Step 3: Generate */}
          <Card className="opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted text-muted-foreground text-sm font-medium">
                  3
                </div>
                <div>
                  <CardTitle className="text-base">
                    {tOnboarding("step3Title")}
                  </CardTitle>
                  <CardDescription>
                    {tOnboarding("step3Description")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {tOnboarding("stepUnavailable")}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">
              {tOnboarding("proTipLabel")}
            </strong>{" "}
            {tOnboarding("proTipBefore")}{" "}
            <Link
              href="/settings"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              {tOnboarding("proTipLink")}
            </Link>{" "}
            {tOnboarding("proTipAfter")}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

function BillingNotConfiguredPage({ tBilling }: { tBilling: Translator }) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{tBilling("notConfiguredTitle")}</CardTitle>
            <CardDescription>
              {tBilling("notConfiguredDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              {tBilling.rich("notConfiguredHelp", {
                id: (chunks) => (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {chunks}
                  </code>
                ),
                slug: (chunks) => (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {chunks}
                  </code>
                ),
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function GeneratorPage({ tGenerator }: { tGenerator: Translator }) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tGenerator("title")}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {tGenerator("description")}
          </p>
        </div>
        <GeneratorForm />
      </div>
    </AppLayout>
  );
}

export default async function Page() {
  const { userId, has } = await auth();
  const planIdentifier = getPlanIdentifier();
  const bypass = userId ? await isFreeAccessUser(userId) : false;
  const hasPlan = Boolean(planIdentifier && has({ plan: planIdentifier }));
  const hasAccess = Boolean(userId && (bypass || hasPlan));

  const tActions = await getTranslations("actions");
  const tLanding = await getTranslations("landing");
  const tOnboarding = await getTranslations("onboarding");
  const tBilling = await getTranslations("billing");
  const tGenerator = await getTranslations("generator");

  // Not signed in - show landing page
  if (!userId) {
    return <LandingPage tLanding={tLanding} tActions={tActions} />;
  }

  // Signed in but billing not configured
  if (!bypass && !planIdentifier) {
    return <BillingNotConfiguredPage tBilling={tBilling} />;
  }

  // Signed in but no plan
  if (!hasAccess) {
    return <OnboardingPage tOnboarding={tOnboarding} tActions={tActions} />;
  }

  // Has access - show generator
  return <GeneratorPage tGenerator={tGenerator} />;
}
