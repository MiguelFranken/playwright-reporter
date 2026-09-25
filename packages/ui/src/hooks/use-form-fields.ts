import { useCallback, useEffect, useRef } from 'react';

/** A form's text fields by name, as the form would post them. */
export type FormFields = Record<string, string>;

/**
 * Reports a form's fields every time the user changes one, so the host can
 * preview what saving would do before it is saved.
 *
 * Attach `ref` and `onChange` to the `<form>`: typing bubbles up as a change.
 * Fields held in state and posted through hidden inputs (a switch, a segmented
 * control) change without an input event, so pass their values as `deps` and
 * they are reported once the hidden inputs have rendered.
 *
 * Nothing is reported on mount, nor for a change that leaves the fields as
 * they were: until they differ, there is nothing to preview.
 */
export function useFormFields(onFieldsChange: ((fields: FormFields) => void) | undefined, deps: readonly unknown[]) {
  const ref = useRef<HTMLFormElement>(null);
  // The latest callback, so a host passing an inline function does not re-run the effect below.
  const callback = useRef(onFieldsChange);
  useEffect(() => {
    callback.current = onFieldsChange;
  });

  // What was last reported, starting from the fields as rendered: a change
  // that lands back on the same values (or a Strict Mode re-run) reports nothing.
  const last = useRef<string | null>(null);
  const read = useCallback((): FormFields | null => {
    if (!ref.current) return null;
    const fields: FormFields = {};
    new FormData(ref.current).forEach((value, name) => {
      // React adds `$ACTION_*` inputs to a form whose action is a server
      // action, for progressive enhancement: plumbing, not the user's fields.
      if (typeof value === 'string' && !name.startsWith('$ACTION')) fields[name] = value;
    });
    return fields;
  }, []);

  const report = useCallback(() => {
    const fields = read();
    if (!fields) return;
    const key = JSON.stringify(fields);
    if (key === last.current) return;
    last.current = key;
    callback.current?.(fields);
  }, [read]);

  useEffect(() => {
    if (last.current === null) {
      const fields = read();
      last.current = fields ? JSON.stringify(fields) : null;
      return;
    }
    report();
    // The deps are the caller's state values, not this effect's own.
  }, deps);

  return { ref, onChange: report };
}
