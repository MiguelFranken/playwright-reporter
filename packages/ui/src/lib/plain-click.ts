/**
 * Links a host can answer in place.
 *
 * A view's filters and selections are links, because their state lives in the
 * URL and a page read that way stays shareable. A host that already holds the
 * data behind a link can answer a plain left click itself — update the URL
 * without a navigation and re-render from what it has — while a modified
 * click (new tab, new window, download) still follows the link as it should.
 */
export interface LinkClick {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
  defaultPrevented?: boolean;
  preventDefault(): void;
}

/** A click that would navigate this page, as opposed to opening somewhere else. */
export function isPlainClick(event: LinkClick): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Wraps `handle` into an anchor `onClick` that takes over plain clicks — the
 * link does not navigate, `handle` runs instead — and lets every other click
 * through. Without a handler the link stays an ordinary link.
 */
export function takeOverPlainClick(handle: (() => void) | undefined) {
  if (!handle) return undefined;
  return (event: LinkClick) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    handle();
  };
}
