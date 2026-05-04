import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "neo";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[transform,box-shadow] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-110",
        variant === "secondary" && "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:brightness-110",
        variant === "ghost" && "rounded-lg bg-transparent font-medium text-[var(--foreground)] hover:bg-stone-900/5",
        variant === "danger" && "rounded-lg bg-red-700 text-white hover:bg-red-600",
        variant === "neo" &&
          "border border-[var(--neo-ink)] bg-[var(--neo-pop)] text-[var(--neo-ink)] shadow-[var(--neo-shadow-sm)] hover:brightness-[0.99] active:brightness-95",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
