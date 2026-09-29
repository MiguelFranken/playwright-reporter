import { redirect } from 'next/navigation';

type Props = { params: Promise<{ team: string; project: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The approved screens moved to the library; old links land there with their filters. */
export default async function ScreensPage({ params, searchParams }: Props) {
  const [{ team, project }, sp] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const value of Array.isArray(v) ? v : v ? [v] : []) if (k !== 'status') search.set(k, value);
  const qs = search.toString();
  redirect(`/teams/${team}/projects/${project}/library${qs ? `?${qs}` : ''}`);
}
