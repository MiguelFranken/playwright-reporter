import './global.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Playwright Reporter docs', template: '%s · Playwright Reporter docs' },
  description: 'Set up, run and use Playwright Reporter: self-hosted Playwright test reports, history and flaky-test analytics.',
};

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
