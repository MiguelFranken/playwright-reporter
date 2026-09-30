/**
 * The order of a library flow whose checkpoints come from several runs: the
 * newest run's order, with each checkpoint only an older run still shows
 * slotted in where that run had it — after the checkpoint it followed there,
 * or before the one it preceded.
 */

/** One run's checkpoint names in capture order, newest run first in the list passed in. */
export type RunOrder = readonly string[];

export function mergeCheckpointOrder(runs: readonly RunOrder[], keep?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const placed = new Set<string>();
  const wanted = (name: string) => !keep || keep.has(name);
  for (const order of runs) {
    order.forEach((name, i) => {
      if (placed.has(name) || !wanted(name)) return;
      const before = order.slice(0, i).findLast((n) => placed.has(n));
      const after = order.slice(i + 1).find((n) => placed.has(n));
      const at = before !== undefined ? out.indexOf(before) + 1 : after !== undefined ? out.indexOf(after) : out.length;
      out.splice(at, 0, name);
      placed.add(name);
    });
  }
  return out;
}
