"use client";

import type { ReactNode } from "react";
import { Sidebar, MobileNav } from "./Sidebar";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import Link from "next/link";

interface AppLayoutProps {
  children: ReactNode;
  /** If true, shows the full app layout with sidebar. If false, shows minimal landing layout */
  showSidebar?: boolean;
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
      <MobileNav />
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <FileText className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight">Cover Letter AI</span>
      </Link>
    </header>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Cover Letter AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Get Started</Button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Button asChild size="sm">
              <Link href="/">Go to App</Link>
            </Button>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-background">
        <LandingHeader />
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
