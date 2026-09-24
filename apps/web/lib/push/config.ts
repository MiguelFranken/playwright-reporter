import { baseUrl } from '@/lib/auth/config';

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** Who push services contact about this sender: a `mailto:` or `https:` URL. */
  subject: string;
}

/**
 * The VAPID key pair that signs every push. Without both keys browser
 * notifications are off: the account page hides the switch and nothing is
 * sent. Generate a pair with `npx web-push generate-vapid-keys`.
 */
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || defaultSubject() };
}

/** The app's own origin, when it is one push services accept. */
function defaultSubject() {
  const url = baseUrl();
  return url.startsWith('https://') ? url : 'mailto:noreply@example.com';
}
