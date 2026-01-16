import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { AppLayout } from "@/components/layout";
import { GeneratorForm } from "@/components/GeneratorForm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { FileText, Upload, Sparkles, Download, ArrowRight, CheckCircle2 } from "lucide-react";

function getPlanIdentifier(): string | null {
  const planId = process.env.CLERK_BILLING_PLAN_ID?.trim();
  if (planId && planId.length > 0) return planId;
  const planSlug = process.env.CLERK_BILLING_PLAN_SLUG?.trim();
  return planSlug && planSlug.length > 0 ? planSlug : null;
}

async function isBypassUser(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.emailAddresses.some(
    (email) => email.emailAddress.toLowerCase() === "andri.heeb2002@gmail.com"
  );
}

function LandingPage() {
  return (
    <AppLayout showSidebar={false}>
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
        {/* Hero Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Swiss-style professional letters</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Your Cover Letter,
            <br />
            <span className="text-muted-foreground">Professionally Crafted</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Upload your CV, paste the job link, and get a perfectly formatted
            Word document ready to send. Built for the Swiss job market.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SignUpButton mode="modal">
              <Button size="lg" className="w-full sm:w-auto">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Sign In
              </Button>
            </SignInButton>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            CHF 50/year · Cancel anytime
          </p>
        </div>

        {/* How it Works */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            How It Works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">1. Upload Your CV</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your CV once. We extract your experience and skills
                automatically.
              </p>
            </div>
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">2. Add Job Details</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Paste the job URL or description. We analyze it to tailor your
                letter.
              </p>
            </div>
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">3. Download & Send</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Preview, edit if needed, and download your professional DOCX
                file.
              </p>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}

function OnboardingPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome! Let&apos;s get you set up
          </h1>
          <p className="mt-2 text-muted-foreground">
            Complete these steps to start generating cover letters.
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
                  <CardTitle className="text-base">Choose Your Plan</CardTitle>
                  <CardDescription>
                    Get yearly access for CHF 50
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/pricing">
                  View Pricing
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
                  <CardTitle className="text-base">Set Up Your Profile</CardTitle>
                  <CardDescription>
                    Add your CV and sender details
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Available after subscribing
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
                  <CardTitle className="text-base">Generate Letters</CardTitle>
                  <CardDescription>
                    Create unlimited cover letters
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Available after subscribing
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Pro tip:</strong> You can already{" "}
            <Link href="/settings" className="text-primary underline underline-offset-4 hover:no-underline">
              set up your profile
            </Link>{" "}
            while deciding on a plan.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

function BillingNotConfiguredPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Billing Not Configured</CardTitle>
            <CardDescription>
              The billing plan has not been set up yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Please set <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">CLERK_BILLING_PLAN_ID</code> or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">CLERK_BILLING_PLAN_SLUG</code> in your
              environment variables.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function GeneratorPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Generate Cover Letter
          </h1>
          <p className="mt-1 text-muted-foreground">
            Add a job posting and we&apos;ll create a tailored cover letter for you.
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
  const bypass = userId ? await isBypassUser(userId) : false;
  const hasPlan = Boolean(planIdentifier && has({ plan: planIdentifier }));
  const hasAccess = Boolean(userId && (bypass || hasPlan));

  // Not signed in - show landing page
  if (!userId) {
    return <LandingPage />;
  }

  // Signed in but billing not configured
  if (!bypass && !planIdentifier) {
    return <BillingNotConfiguredPage />;
  }

  // Signed in but no plan
  if (!hasAccess) {
    return <OnboardingPage />;
  }

  // Has access - show generator
  return <GeneratorPage />;
}
