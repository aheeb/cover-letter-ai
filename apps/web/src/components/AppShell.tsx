import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-zinc-50/50">
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-zinc-900" />
            <span className="text-sm font-semibold tracking-tight">
              cover-letter-ai
            </span>
          </div>
          <div className="hidden text-xs font-medium text-zinc-500 sm:block">
            Single-user MVP
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
