"use client"

import * as React from "react"
import { cn } from "../lib/cn"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // A scrollable region needs to be reachable by keyboard, or the content a
    // horizontal table hides is unreachable without a mouse (axe:
    // scrollable-region-focusable).
    <div
      data-slot="table-container"
      tabIndex={0}
      className="relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-body-s", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_th]:border-b [&_th]:border-separator [&_th]:bg-surface-sunken/50",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "[&>tr>td]:border-t [&>tr>td]:border-separator [&>tr>td]:bg-surface-sunken/50 font-medium",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors duration-100 [&>td]:border-b [&>td]:border-separator last:[&>td]:border-b-0 hover:bg-muted/60 has-aria-expanded:bg-muted/60 data-[state=selected]:bg-accent-subtle",
        className
      )}
      {...props}
    />
  )
}

// The first and last columns pad their outer edge by --table-inset: the cell
// padding by default, the card's spacing inside a flush CardContent.
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 first:pl-[var(--table-inset,calc(var(--spacing)*3))] last:pr-[var(--table-inset,calc(var(--spacing)*3))] text-left align-middle text-eyebrow whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 first:pl-[var(--table-inset,calc(var(--spacing)*3))] last:pr-[var(--table-inset,calc(var(--spacing)*3))] align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
