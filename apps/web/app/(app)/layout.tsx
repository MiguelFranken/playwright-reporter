import { AppShell } from '@/components/app-shell';

/**
 * Every signed-in section — teams, administration, account — shares this one
 * layout, so the sidebar and header render once and are preserved across
 * navigations between them. Moving the shell any deeper (a layout per section)
 * puts the chrome inside what re-renders when you cross sections, which is what
 * used to flash the nav skeleton on the way into `/admin`.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
