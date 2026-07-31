import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

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

/**
 * `pending` is the one loading treatment used across the whole platform.
 *
 * Every asynchronous action previously hand-assembled its own — a `disabled`
 * prop here, a `<Spinner />` there, a ternary on the label somewhere else — so
 * some buttons spun, some only greyed out, and a few gave no feedback at all
 * while a request was in flight. Putting it on the primitive means an action
 * cannot be wired up without also getting the disabled state, the spinner and
 * the assistive-technology announcement.
 *
 * `aria-busy` plus `disabled` is what actually prevents the double submission:
 * a disabled button emits no further click events, so a voter jabbing "Submit
 * my vote" on a slow connection cannot queue two ballots.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  // asChild hands rendering to the child element (a <Link>, usually), and Slot
  // accepts exactly one child — so the spinner is only ever injected for real
  // buttons. Navigation links do not have a pending state to show anyway.
  const content = asChild ? children : (
    <>
      {pending ? <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </>
  )

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // A <button> inside a <form> defaults to type="submit". Defaulting to
      // "button" means secondary actions (Back, Cancel) can never accidentally
      // submit a registration or a ballot.
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : (disabled || pending)}
      aria-busy={pending || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}>
      {content}
    </Comp>
  );
}

export { Button, buttonVariants }
