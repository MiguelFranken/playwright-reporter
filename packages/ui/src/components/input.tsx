import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "../lib/cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        [
          "h-9 w-full min-w-0 rounded-lg border border-input bg-surface px-3 py-1 text-base text-foreground shadow-xs outline-none",
          "transition-[color,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "placeholder:text-muted-foreground/80",
          "hover:border-border-strong",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:hover:border-ring",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted-foreground disabled:opacity-70",
          "aria-invalid:border-danger-border aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
          "md:text-body-m dark:bg-surface-sunken",
        ],
        className
      )}
      {...props}
    />
  )
}

export { Input }
