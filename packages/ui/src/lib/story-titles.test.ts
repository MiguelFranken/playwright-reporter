import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));

function storyFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return storyFiles(full);
    return entry.endsWith('.stories.tsx') ? [full] : [];
  });
}

/**
 * The Storybook sidebar is `Layer/Group/Component`, and inside a large Views
 * domain `Views/Domain/Area/Thing`. These checks keep it that way: a new story
 * that skips the group, or a group with only one thing in it, fails here rather
 * than slowly flattening the catalogue again. Group order lives in `storySort`
 * in apps/storybook/.storybook/preview.tsx.
 */
const DEPTH: Record<string, [min: number, max: number]> = {
  Foundations: [2, 2],
  Primitives: [3, 3],
  Patterns: [3, 3],
  Marketing: [3, 3],
  Views: [2, 4],
  Pages: [2, 2],
};

const titles = storyFiles(SRC).map((file) => {
  // The meta object is the first `title:` in every story file.
  const title = readFileSync(file, 'utf8').match(/title: '([^']+)'/)?.[1];
  return { file: file.slice(SRC.length), title: title ?? '' };
});

describe('story titles', () => {
  it('finds stories to check', () => {
    expect(titles.length).toBeGreaterThan(100);
  });

  it('every story file has a title', () => {
    expect(titles.filter((t) => !t.title).map((t) => t.file)).toEqual([]);
  });

  it('is unique', () => {
    const seen = titles.map((t) => t.title);
    expect(seen.filter((t, i) => seen.indexOf(t) !== i)).toEqual([]);
  });

  it('sits in a known layer at that layer’s depth', () => {
    const offenders = titles.filter(({ title }) => {
      const parts = title.split('/');
      const depth = DEPTH[parts[0]!];
      return !depth || parts.length < depth[0] || parts.length > depth[1];
    });
    expect(offenders.map((t) => `${t.file}: ${t.title}`)).toEqual([]);
  });

  it('is never also a folder', () => {
    const all = titles.map((t) => t.title);
    expect(all.filter((t) => all.some((other) => other.startsWith(`${t}/`)))).toEqual([]);
  });

  it('has no group holding a single story', () => {
    const children = new Map<string, number>();
    for (const { title } of titles) {
      const parts = title.split('/');
      // Groups are the folders below the layer (Primitives/Forms) and below a
      // Views domain (Views/Run/Header); layers and domains may hold one item.
      if (parts.length < 3 || (parts[0] === 'Views' && parts.length < 4)) continue;
      const group = parts.slice(0, -1).join('/');
      children.set(group, (children.get(group) ?? 0) + 1);
    }
    expect([...children].filter(([, n]) => n < 2).map(([group]) => group)).toEqual([]);
  });
});
