'use client';

import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { cn } from '../../lib/cn';

export interface FieldSelectItem {
  value: string;
  label: string;
  /** Indents the option, for suites. */
  depth?: number;
}

/** A labelled select for a form, one of the case's classifications. */
export function FieldSelect({
  id,
  label,
  value,
  items,
  onValueChange,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  items: FieldSelectItem[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} disabled={disabled} onValueChange={(v) => v !== null && onValueChange(String(v))}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <span style={item.depth ? { paddingInlineStart: `${item.depth * 12}px` } : undefined}>{item.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
