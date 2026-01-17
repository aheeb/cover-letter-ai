"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { locales } from "@/i18n/config";

type LanguageSwitcherProps = {
  className?: string;
  selectClassName?: string;
};

export function LanguageSwitcher({
  className,
  selectClassName,
}: LanguageSwitcherProps) {
  const router = useRouter();
  const locale = useLocale();
  const tLanguage = useTranslations("language");
  const [currentLocale, setCurrentLocale] = useState(locale);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale]);

  const handleChange = (nextLocale: string) => {
    setCurrentLocale(nextLocale);
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      router.refresh();
    });
  };

  return (
    <div className={cn("flex items-center", className)}>
      <Select
        aria-label={tLanguage("label")}
        value={currentLocale}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        className={cn("h-9 w-[140px] text-xs", selectClassName)}
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {tLanguage(`names.${value}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
