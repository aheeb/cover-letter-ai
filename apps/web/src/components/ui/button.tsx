import { cn } from "@/lib/utils";
import * as React from "react";

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "outline" | "ghost" | "link" | "destructive";
    size?: "default" | "sm" | "lg" | "icon";
  }
>(({ className, variant = "default", size = "default", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90":
            variant === "default",
          "border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900":
            variant === "outline",
          "hover:bg-zinc-100 hover:text-zinc-900": variant === "ghost",
          "text-zinc-900 underline-offset-4 hover:underline":
            variant === "link",
          "bg-red-500 text-zinc-50 hover:bg-red-500/90":
            variant === "destructive",
          "h-10 px-4 py-2": size === "default",
          "h-9 rounded-md px-3": size === "sm",
          "h-11 rounded-md px-8": size === "lg",
          "h-10 w-10": size === "icon",
        },
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button };
