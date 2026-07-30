import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // touch-manipulation removes the 300ms tap delay on phones; every size below
  // is at least 36px tall, and the sizes used for primary actions are 44px+.
  "group/button inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-border-strong bg-background text-foreground hover:border-input hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted aria-expanded:bg-muted",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-brand-red-700 focus-visible:ring-destructive dark:hover:bg-brand-red-300",
        "destructive-soft":
          "border-danger-border bg-danger-surface text-danger-foreground hover:bg-danger-surface/70 focus-visible:ring-destructive",
        link: "text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-[0.8125rem]",
        lg: "h-11 px-5 text-base",
        // The primary commit action on a mobile form or ballot.
        xl: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // A <button> inside a <form> defaults to type="submit". Defaulting to
      // "button" means secondary actions (Back, Cancel) can never accidentally
      // submit a registration or a ballot.
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
