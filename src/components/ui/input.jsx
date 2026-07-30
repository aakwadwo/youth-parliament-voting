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

        // --- input[type=date] on iOS Safari -------------------------------
        //
        // A date input is the one control here that does not behave like a
        // text box. Left native, mobile WebKit sizes it to its *content* and
        // quietly ignores `width: 100%`, so on a 320–390px screen the date of
        // birth field rendered wider than the name and phone fields beside it,
        // pushing the card — and with it the whole page — past the viewport.
        // This is invisible in desktop Chrome, which honours the width, which
        // is why an overflow audit on the desktop browser came back clean
        // while real phones scrolled sideways.
        //
        // `appearance-none` is what actually restores normal box sizing. The
        // rest stops WebKit's internal spinner wrappers reintroducing their own
        // width and centring: `::-webkit-date-and-time-value` is centred by
        // default on iOS, which is what made the value sit off-axis from every
        // other field's text even when the widths did match.
        "[&[type=date]]:appearance-none [&[type=date]]:min-w-0",
        "[&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit]:leading-[1.5]",
        "[&::-webkit-datetime-edit-fields-wrapper]:p-0",
        "[&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left",
        //
        // No attempt to grey out the empty dd/mm/yyyy hint the way a real
        // placeholder is greyed: a date input is never :placeholder-shown, and
        // an empty one is not :invalid either while these forms use aria-required
        // rather than the native `required` attribute. Both selectors compile
        // fine and match nothing, so the visible format hint sits above the
        // field instead, where it is also readable once a date has been picked.
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
