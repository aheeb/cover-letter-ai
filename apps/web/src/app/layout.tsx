import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={inter.variable}>
      <body
        className={cn(
          "min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased",
          inter.className
        )}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
