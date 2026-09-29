"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "../lib/cn"

/**
 * A single-value slider in the house style: a hairline-thin track, the filled
 * part in ink like the primary action, and a white thumb that lifts on hover
 * and takes the focus ring. Built on Base UI's Slider, so arrows, Page Up/Down,
 * Home and End work and the value is announced.
 */
function Slider({
  className,
  thumbLabel,
  valueText,
  ...props
}: Omit<SliderPrimitive.Root.Props<number>, "children"> & {
  /** Accessible name of the thumb, e.g. "Screen size". */
  thumbLabel: string
  /** How the value is announced, e.g. "18% of the real size". */
  valueText?: (value: number) => string
}) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn("relative flex w-full touch-none items-center select-none data-disabled:opacity-50", className)} {...props}>
      <SliderPrimitive.Control className="relative flex h-5 w-full cursor-pointer items-center">
        <SliderPrimitive.Track className="relative h-1 w-full overflow-hidden rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)]">
          <SliderPrimitive.Indicator className="rounded-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={thumbLabel}
          getAriaValueText={valueText ? (_formatted, value) => valueText(value) : undefined}
          className="block size-4 rounded-full border border-border-strong bg-surface shadow-e2 transition-[transform,box-shadow] duration-150 outline-none hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/40 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40 data-dragging:scale-110 data-dragging:shadow-e3"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
