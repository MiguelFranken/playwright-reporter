"use client"

import * as React from "react"
import { FileText, UploadCloud, X } from "lucide-react"
import { cn } from "../lib/cn"
import { formatBytes } from "../lib/format"

type FileInputProps = Omit<React.ComponentProps<"input">, "type" | "children"> & {
  /** The call to action in the empty zone. */
  prompt?: React.ReactNode
  /** A quieter second line under the prompt, such as the accepted formats. */
  hint?: React.ReactNode
  /** Called with the picked files (empty when cleared). */
  onFilesChange?: (files: File[]) => void
}

/**
 * A drop zone around a real `<input type="file">`. The native input covers the
 * whole zone, transparent, so clicking, dropping, keyboard focus, `required`
 * and form submission all stay the browser's own. Once a file is picked the
 * zone shows its name and size, with a button to clear it.
 */
function FileInput({
  className,
  prompt = "Choose a file or drag it here",
  hint,
  multiple,
  disabled,
  onChange,
  onFilesChange,
  ...props
}: FileInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [dragging, setDragging] = React.useState(false)

  const update = (next: File[]) => {
    setFiles(next)
    onFilesChange?.(next)
  }

  const clear = () => {
    const input = inputRef.current
    if (input) input.value = ""
    update([])
    input?.focus()
  }

  const picked = files.length > 0

  return (
    <div
      data-slot="file-input"
      data-dragging={dragging || undefined}
      data-picked={picked || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        [
          "group/file relative flex w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-sunken/60 text-foreground",
          "transition-[color,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:border-muted-foreground/50 hover:bg-surface-sunken",
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/25",
          "has-[input[aria-invalid=true]]:border-danger-border has-[input[aria-invalid=true]]:ring-[3px] has-[input[aria-invalid=true]]:ring-destructive/20",
          "data-dragging:border-solid data-dragging:border-accent-border data-dragging:bg-accent-subtle",
          "flex-col justify-center px-4 py-6 text-center",
          "data-picked:flex-row data-picked:justify-start data-picked:border-solid data-picked:bg-surface data-picked:px-3 data-picked:py-2.5 data-picked:text-start",
          "data-disabled:pointer-events-none data-disabled:bg-surface-sunken data-disabled:text-muted-foreground",
        ],
        className
      )}
    >
      <input
        {...props}
        ref={inputRef}
        type="file"
        multiple={multiple}
        disabled={disabled}
        data-slot="file-input-control"
        className="absolute inset-0 z-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => {
          update(Array.from(event.target.files ?? []))
          onChange?.(event)
        }}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
      />
      {picked ? (
        <>
          <span className="pointer-events-none flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-text">
            <FileText className="size-4.5" aria-hidden />
          </span>
          <span className="pointer-events-none flex min-w-0 flex-1 flex-col">
            <span className="truncate text-label-m">
              {files.length === 1 ? files[0]!.name : `${files.length} files`}
            </span>
            <span className="text-body-xs text-muted-foreground">
              {formatBytes(files.reduce((sum, f) => sum + f.size, 0))} · Click or drop to replace
            </span>
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={multiple ? "Remove files" : "Remove file"}
            className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
          >
            <X className="size-4" aria-hidden />
          </button>
        </>
      ) : (
        <>
          <span className="pointer-events-none flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-xs transition-colors group-hover/file:text-foreground group-data-dragging/file:border-accent-border group-data-dragging/file:text-accent-text">
            <UploadCloud className="size-5" aria-hidden />
          </span>
          <span className="pointer-events-none flex flex-col gap-0.5">
            <span className="text-label-m">
              {dragging ? "Drop to add" : prompt}
            </span>
            {hint ? <span className="text-body-xs text-muted-foreground">{hint}</span> : null}
          </span>
        </>
      )}
    </div>
  )
}

export { FileInput }
export type { FileInputProps }
