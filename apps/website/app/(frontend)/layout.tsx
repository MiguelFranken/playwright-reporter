import '../globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { draftMode } from 'next/headers';
import { ThemeProvider } from 'next-themes';
import { AnnouncementBar } from '@repo/ui/marketing/announcement-bar';
import { Footer } from '@/components/site-footer';
import { Header } from '@/components/site-header';
import { LivePreviewListener } from '@/components/live-preview-listener';
import { SiteUiProvider } from '@/components/ui-provider';
import { resolveLink } from '@/lib/links';
import { resolveMedia } from '@/lib/media';
import { querySiteSettings } from '@/lib/queries';

const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

// The same pair the app uses, for the same reason: the product's surface is
// full of stack traces, SHAs and file paths, and the site shows that surface.
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await querySiteSettings();
  const og = resolveMedia(settings.defaultOgImage);

  return {
    metadataBase: new URL(serverURL),
    title: { default: settings.siteName, template: `%s · ${settings.siteName}` },
    description: settings.description ?? settings.tagline ?? undefined,
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      title: settings.siteName,
      description: settings.description ?? undefined,
      images: og ? [{ url: og.src, width: og.width, height: og.height, alt: og.alt }] : undefined,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const [settings, { isEnabled: draft }] = await Promise.all([querySiteSettings(), draftMode()]);
  const announcement = settings.announcement;
  const announcementLink = resolveLink(announcement?.link);

  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteUiProvider>
            {announcement?.enabled && announcement.text ? (
              <AnnouncementBar
                text={announcement.text}
                href={announcementLink?.href}
                linkLabel={announcementLink?.label}
              />
            ) : null}
            <Header />
            <main>{children}</main>
            <Footer />
            {draft ? <LivePreviewListener serverURL={serverURL} /> : null}
          </SiteUiProvider>
        </ThemeProvider>
        {/* Outside the providers: React hoists <script> elements on the
            client, which breaks hydration for whatever they sat inside. */}
        <SiteJsonLd name={settings.siteName} description={settings.description} />
      </body>
    </html>
  );
}

/** Organization + WebSite, so search engines have a name and a URL to attach. */
function SiteJsonLd({ name, description }: { name: string; description?: string | null }) {
  const json = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name, url: serverURL },
      { '@type': 'WebSite', name, url: serverURL, description: description ?? undefined },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // Values come from the CMS, not from a visitor — but `<` is escaped all
      // the same, because JSON.stringify does not close a </script> tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
    />
  );
}
