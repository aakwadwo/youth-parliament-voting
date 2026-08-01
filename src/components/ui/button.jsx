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

function ButtonSpinner({ pending = true }) {
  return (
    <Loader2
      aria-hidden="true"
      // Only animated while it is actually visible: the idle layer stays in the
      // DOM to hold the button's width, and a permanently spinning invisible
      // icon on every async button in the admin portal is wasted paint work.
      className={cn("size-4 shrink-0", pending && "animate-spin")}
    />
  );
}

/**
 * The idle label and the pending label rendered into the same grid cell, with
 * whichever one is not current hidden by `visibility`.
 *
 * Exported because `asChild` buttons cannot use it through `Button` — Slot
 * accepts exactly one child, so anything a link needs inside it has to be
 * assembled by the caller. `NavButton` is the caller that does, and it uses
 * this rather than its own copy so there is still one spinner treatment on the
 * platform rather than one for actions and a second for navigation.
 */
function PendingSwap({ pending = false, pendingLabel, children }) {
  return (
    <span className="grid grid-cols-1 grid-rows-1 items-center">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-2",
          pending && "invisible"
        )}>
        {children}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-2",
          !pending && "invisible"
        )}>
        <ButtonSpinner pending={pending} />
        {pendingLabel}
      </span>
    </span>
  );
}

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
 *
 * There are two ways to spend the width the spinner needs, and which one a
 * caller wants depends on whether the button carries a leading icon:
 *
 *   * With `pendingLabel`, both states are rendered into the same grid cell and
 *     the idle one is hidden with `visibility` — so the button is always as wide
 *     as the wider of "Save changes" and "⟳ Saving…", and swapping between them
 *     moves nothing on the page. `visibility: hidden` also takes the idle layer
 *     out of the accessibility tree, so a screen reader reads one label, not two.
 *
 *   * Without it, the spinner is simply prepended. A button with a leading icon
 *     (Refresh, Sign out) should hide that icon while pending — the icon and the
 *     spinner are both `size-4` behind the same gap, so the geometry is
 *     identical in both states and again nothing shifts.
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
  // buttons. A link that does have a pending state to show composes PendingSwap
  // into its own children instead; see NavButton.
  let content
  if (asChild) {
    content = children
  } else if (pendingLabel != null) {
    content = (
      <PendingSwap pending={pending} pendingLabel={pendingLabel}>
        {children}
      </PendingSwap>
    )
  } else {
    content = (
      <>
        {pending ? <ButtonSpinner /> : null}
        {children}
      </>
    )
  }

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

export { Button, buttonVariants, PendingSwap }
