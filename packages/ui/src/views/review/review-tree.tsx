'use client';

import { FileCode2, Folder, FolderOpen, Layers } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { cn } from '../../lib/cn';
import { REVIEW_GROUPING_LABELS, REVIEW_GROUPINGS, UNLINKED_FOLDER, type ReviewFolder, type ReviewGrouping } from '../../lib/review';

/**
 * The folders a review is browsed by: the test case suites the flows'
 * tests are linked to, or their spec files. Each folder says how many images
 * below it still need review, so the tree is also the to-do list.
 */
export function ReviewTree({
  folders,
  selected,
  onSelect,
  grouping,
  onGroupingChange,
  total,
  needsReview,
}: {
  folders: readonly ReviewFolder[];
  /** The selected folder's id, or `null` for everything. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  grouping: ReviewGrouping;
  onGroupingChange: (next: ReviewGrouping) => void;
  total: number;
  needsReview: number;
}) {
  return (
    <nav aria-label="Review folders" className="flex flex-col gap-3">
      <ToggleGroup
        variant="segment"
        size="sm"
        value={[grouping]}
        onValueChange={(v) => v[0] && onGroupingChange(v[0] as ReviewGrouping)}
        aria-label="Group by"
        className="w-full"
      >
        {REVIEW_GROUPINGS.map((g) => (
          <ToggleGroupItem key={g} value={g} className="flex-1">
            {g === 'suite' ? 'Suites' : 'Files'}
            <span className="sr-only"> ({REVIEW_GROUPING_LABELS[g]})</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ul className="flex flex-col gap-px text-sm">
        <Row depth={0} label="All flows" icon={Layers} active={selected === null} onClick={() => onSelect(null)} total={total} needsReview={needsReview} />
        {folders.map((f) => (
          <Branch key={f.id} folder={f} depth={0} selected={selected} onSelect={onSelect} grouping={grouping} />
        ))}
      </ul>
    </nav>
  );
}

function Branch({ folder, depth, selected, onSelect, grouping }: { folder: ReviewFolder; depth: number; selected: string | null; onSelect: (id: string) => void; grouping: ReviewGrouping }) {
  const active = selected === folder.id;
  const open = active || Boolean(selected?.startsWith(`${folder.id} / `));
  const isFile = grouping === 'file' ? folder.children.length === 0 : folder.path[0] === UNLINKED_FOLDER && folder.path.length > 1;
  const Icon = isFile ? FileCode2 : open ? FolderOpen : Folder;
  return (
    <>
      <Row depth={depth + 1} label={folder.name} icon={Icon} active={active} onClick={() => onSelect(folder.id)} total={folder.total} needsReview={folder.needsReview} muted={folder.name === UNLINKED_FOLDER} />
      {folder.children.map((c) => (
        <Branch key={c.id} folder={c} depth={depth + 1} selected={selected} onSelect={onSelect} grouping={grouping} />
      ))}
    </>
  );
}

function Row({
  depth,
  label,
  icon: Icon,
  active,
  onClick,
  total,
  needsReview,
  muted,
}: {
  depth: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  total: number;
  needsReview: number;
  muted?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        title={label}
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
          active ? 'bg-accent-subtle text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          muted && !active && 'italic',
        )}
        style={{ paddingLeft: 8 + Math.max(0, depth - 1) * 14 }}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {needsReview ? (
          <span className="rounded-full bg-warning-subtle px-1.5 text-label-xs text-warning-text tabular-nums" title={`${needsReview} of ${total} images need review`}>
            {needsReview}
          </span>
        ) : (
          <span className="text-label-xs tabular-nums" title={`${total} images, none to review`}>
            {total}
          </span>
        )}
      </button>
    </li>
  );
}
