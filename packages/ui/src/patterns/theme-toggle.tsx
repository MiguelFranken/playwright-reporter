'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '../components/button';
import { DropdownMenuItem } from '../components/dropdown-menu';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

/**
 * The same toggle as an item of a dropdown menu. A `role="menu"` may only hold
 * menu items, so a `ThemeToggle` button inside one is an accessibility defect;
 * this item flips the theme and leaves the menu open to show the result.
 */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <DropdownMenuItem closeOnClick={false} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <Sun className="opacity-60 dark:hidden" />
      <Moon className="hidden opacity-60 dark:block" />
      Theme
      <span className="ms-auto text-xs text-muted-foreground">{dark ? 'Dark' : 'Light'}</span>
    </DropdownMenuItem>
  );
}
