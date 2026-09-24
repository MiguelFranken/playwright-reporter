import { SiteFooter } from '@repo/ui/marketing/site-footer';
import { resolveLinks } from '@/lib/links';
import { queryFooter, querySiteSettings } from '@/lib/queries';

export async function Footer() {
  const [footer, settings] = await Promise.all([queryFooter(), querySiteSettings()]);

  return (
    <SiteFooter
      siteName={settings.siteName}
      columns={(footer.columns ?? []).map((column) => ({
        title: column.title,
        links: resolveLinks(column.links),
      }))}
      legal={resolveLinks(footer.legal)}
      copyright={footer.copyright}
      social={(footer.social ?? []).map((item) => ({ platform: item.platform, url: item.url }))}
    />
  );
}
