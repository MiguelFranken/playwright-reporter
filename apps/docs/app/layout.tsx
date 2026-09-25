import './global.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Playwright Reporter docs', template: '%s · Playwright Reporter docs' },
  description: 'Set up, run and use Playwright Reporter: self-hosted Playwright test reports, history and flaky-test analytics.',
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
