export const TEMPLATE_DB = 'pwr_template';

/** Swaps the database name in a connection URL, keeping credentials and options. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
