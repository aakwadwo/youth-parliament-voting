import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // A visible 1px --input border (3.02:1 on white) rather than a tinted
        // fill: WCAG 1.4.11 wants 3:1 on the boundary of a control, and a
        // bordered field reads institutional rather than consumer-app.
        "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground transition-[color,border-color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25 aria-invalid:focus-visible:ring-destructive",
        // Native date/time controls otherwise render a near-invisible icon.
        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
        // File inputs get a real, tappable button affordance.
        "file:mr-3 file:-ml-1 file:inline-flex file:h-8 file:cursor-pointer file:items-center file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-muted",
        // 16px on phones stops iOS Safari zooming the viewport on focus; the
        // text only steps down once there is a wider screen.
        "md:text-sm",
        className
      )}
      {...props} />
  );
}

export { Input }
