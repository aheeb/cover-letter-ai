import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cover Letter AI",
  description: "Generate professional Swiss-style cover letters in minutes",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="de"
        suppressHydrationWarning
        className={cn(GeistSans.variable, GeistMono.variable)}
      >
        <body
          className="min-h-screen bg-background font-sans text-foreground antialiased"
          suppressHydrationWarning
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
