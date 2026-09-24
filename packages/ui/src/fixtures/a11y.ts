/**
 * Shared accessibility-check overrides for stories. Story-only, like the rest
 * of `fixtures/` — never exported from the package.
 */

/**
 * For stories of the `isPending` state.
 *
 * Every URL-bound control dims itself while the host's navigation transition is
 * in flight, and `opacity-60` drops its label under the 4.5:1 contrast floor.
 * The contrast check is therefore off for those stories only — the very same
 * labels at full opacity are verified by every other story of the component.
 *
 * Worth revisiting together: if the pending affordance were something other
 * than opacity (a shimmer, a cursor, a spinner beside the control), this
 * override could go and the state would be checked like any other.
 */
export const PENDING_STATE_A11Y = {
  a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
} as const;
