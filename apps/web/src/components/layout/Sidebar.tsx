"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { CreditCard, FileText, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Generate Letter",
    href: "/",
    icon: FileText,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "Pricing",
    href: "/pricing",
    icon: CreditCard,
  },
];

function NavItem({
  item,
  isActive,
  onClick,
  onPrefetch,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
  onClick?: () => void;
  onPrefetch?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      prefetch
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive
            ? "text-primary-foreground"
            : "text-muted-foreground group-hover:text-accent-foreground"
        )}
      />
      {item.title}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const { user } = useUser();

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  const handleNavigate = (href: string) => () => {
    if (href !== pathname) {
      setPendingPath(href);
    }
    onNavigate?.();
  };

  const handlePrefetch = (href: string) => () => {
    router.prefetch(href);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight">Cover Letter AI</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={
                pendingPath ? pendingPath === item.href : pathname === item.href
              }
              onClick={handleNavigate(item.href)}
              onPrefetch={handlePrefetch(item.href)}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className="mt-auto border-t p-4">
        <SignedIn>
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">
                {user?.firstName || user?.emailAddresses?.[0]?.emailAddress}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
            </div>
          </div>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <Button variant="outline" className="w-full">
              Sign in
            </Button>
          </SignInButton>
        </SignedOut>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation Menu</SheetTitle>
        </SheetHeader>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}
