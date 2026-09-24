"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * Two shapes, and they are not interchangeable.
 *
 * `default` is a segmented control: a filled track with a pill that marks the
 * choice. It suits two or three peer options inside a card.
 *
 * `line` is a navigation strip — the shape a page's own sections take. It
 * carries its own rule underneath and a single underline that *travels* to the
 * tab you pick, so the eye follows the change instead of re-finding it. The
 * strip therefore owns its border and padding; a call site that re-declares
 * them only has to keep them in sync.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "w-fit gap-0 rounded-lg bg-muted p-[3px] group-data-horizontal/tabs:h-8",
        line:
          "relative w-full justify-start gap-0.5 rounded-none border-b border-separator bg-transparent px-1 pb-2 group-data-horizontal/tabs:h-auto",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      {variant === "line" ? <TabsIndicator /> : null}
    </TabsPrimitive.List>
  )
}

/**
 * The travelling underline.
 *
 * Base UI measures the active tab against the list and publishes the result as
 * `--active-tab-left` / `--active-tab-width`, so the movement is a plain CSS
 * transition rather than anything this component has to drive. It animates
 * `translate` and `width` — both compositable — instead of `left`, which would
 * lay the strip out again on every frame.
 *
 * `renderBeforeHydration` paints it from the server markup, so it does not flash
 * in from the left edge on first load. It does this by emitting an inline
 * `<script>` next to the indicator, which is safe: Base UI re-renders that same
 * element during the client's hydration pass with `suppressHydrationWarning`,
 * and marks the indicator span the same way, so the markup reconciles.
 *
 * If you are here because of React's "Encountered a script tag while rendering
 * React component" warning — that one is `next-themes`, whose provider always
 * renders the theme-class script. Storybook wraps every story in it, so the
 * warning appears once per story file whether or not the story has tabs.
 *
 * `TabsList` renders this for the `line` variant already; it is exported for a
 * strip that needs to place it somewhere else.
 */
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      renderBeforeHydration
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-foreground transition-[translate,width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-label-m whitespace-nowrap text-foreground/60 transition-[color,background-color] duration-150 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        // A line tab sizes to its label and takes a soft hover plate, the way a
        // navigation item does. The plate stops at the strip's padding, so it
        // never collides with the underline travelling below it.
        //
        // The selected tab is marked by colour and the underline, never by a
        // heavier weight: re-weighting the label would re-flow the strip while
        // the underline is still animating towards the width it measured.
        "group-data-[variant=line]/tabs-list:h-auto group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:py-1.5 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:shadow-none",
        "group-data-[variant=line]/tabs-list:hover:bg-muted group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:hover:bg-muted dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:hover:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator, tabsListVariants }
