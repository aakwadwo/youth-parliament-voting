import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        // A border and nothing else. Shadow is reserved for surfaces that
        // genuinely float above the page (dialogs, popovers, the mobile
        // drawer); a panel sitting in the document flow does not need one to
        // read as a panel, and stacking soft shadows on every container is
        // what makes an interface look generated rather than designed.
        "group/card flex flex-col gap-5 overflow-hidden rounded-xl border border-border bg-card py-5 text-sm text-card-foreground has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-4 sm:gap-6 sm:py-6 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props} />
  );
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-xl px-4 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] sm:px-6 [.border-b]:pb-5 group-data-[size=sm]/card:[.border-b]:pb-4 sm:[.border-b]:pb-6",
        className
      )}
      {...props} />
  );
}

function CardTitle({
  className,
  ...props
}) {
  return (
    <h3
      data-slot="card-title"
      className={cn("font-heading text-base font-semibold tracking-tight", className)}
      {...props} />
  );
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props} />
  );
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props} />
  );
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-4 sm:px-6", className)}
      {...props} />
  );
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl px-4 group-data-[size=sm]/card:px-4 sm:px-6 [.border-t]:pt-5 group-data-[size=sm]/card:[.border-t]:pt-4 sm:[.border-t]:pt-6",
        className
      )}
      {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
