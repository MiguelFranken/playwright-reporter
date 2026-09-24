/**
 * The push services browsers subscribe with. A subscription's endpoint comes
 * from the client, and the server POSTs to it on every run, so anything else
 * is refused: the app must not become a way to make requests to arbitrary
 * hosts.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Opera, Brave
  'updates.push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari: web.push.apple.com
  'notify.windows.com', // legacy Edge: *.notify.windows.com
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
