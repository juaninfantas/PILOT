import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** WebKit/Safari/Chrome: ícono calendadero al ras del padding derecho. */
const dateInputCalendar =
  "relative pl-3 pr-9 text-start [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:right-1.5 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        type === "date" ? dateInputCalendar : "px-3",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
