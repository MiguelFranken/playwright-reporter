import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@miguelfranken/ui/components/sonner';
import { QueryProvider } from '@/components/query-provider';
import { AppUiProvider } from '@/components/ui-provider';

export const metadata: Metadata = {
  title: { default: 'Playwright Reporter', template: '%s · Playwright Reporter' },
  description: 'Self-hosted Playwright test run reports, history and flaky-test analytics.',
};

export const viewport: Viewport = { maximumScale: 1 };

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

// Stack traces, SHAs and file paths are a large part of this product's surface,
// so the mono face is a real one rather than whatever the OS supplies.
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AppUiProvider>
              {children}
              <Toaster />
            </AppUiProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
