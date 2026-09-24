'use client';

import { BellOff, BellRing, Send } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import {
  deletePushSubscription,
  getPushPreferences,
  savePushSubscription,
  sendTestPush,
  type PushPreferences,
} from '@/app/(app)/account/push-actions';

const WORKER_URL = '/push-sw.js';
const DEFAULTS: PushPreferences = { notifyStarted: true, notifyFinished: true };

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'blocked' }
  | { kind: 'off' }
  | { kind: 'on'; endpoint: string; prefs: PushPreferences };

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The VAPID public key in the form `PushManager.subscribe` takes. */
function applicationServerKey(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Turns run notifications on or off for this browser. Each browser subscribes
 * on its own; the settings below apply to this one only.
 */
export function PushSettings({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!supported()) return setState({ kind: 'unsupported' });
    if (Notification.permission === 'denied') return setState({ kind: 'blocked' });
    let cancelled = false;
    void (async () => {
      const subscription = await currentSubscription().catch(() => null);
      const prefs = subscription && (await getPushPreferences(subscription.endpoint).catch(() => null));
      if (cancelled) return;
      setState(subscription && prefs && Notification.permission === 'granted' ? { kind: 'on', endpoint: subscription.endpoint, prefs } : { kind: 'off' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? { kind: 'blocked' } : { kind: 'off' });
        return;
      }
      try {
        await navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
        const registration = await navigator.serviceWorker.ready;
        const key = applicationServerKey(publicKey);
        let subscription = await registration.pushManager.getSubscription();
        // A subscription made with another key (the server's keys were rotated) cannot receive.
        if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const json = subscription.toJSON();
        const result = await savePushSubscription({
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
          ...DEFAULTS,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setState({ kind: 'on', endpoint: subscription.endpoint, prefs: DEFAULTS });
        toast.success('Notifications are on in this browser.');
      } catch (err) {
        console.error(err);
        toast.error('This browser could not subscribe to notifications.');
      }
    });

  const disable = (endpoint: string) =>
    startTransition(async () => {
      await deletePushSubscription(endpoint);
      await (await currentSubscription().catch(() => null))?.unsubscribe().catch(() => false);
      setState({ kind: 'off' });
    });

  const update = (endpoint: string, prefs: PushPreferences) =>
    startTransition(async () => {
      const subscription = await currentSubscription();
      const json = subscription?.toJSON();
      if (!subscription || !json?.keys?.p256dh || !json.keys.auth) {
        setState({ kind: 'off' });
        return;
      }
      const result = await savePushSubscription({ endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, ...prefs });
      if (!result.ok) toast.error(result.message);
      else setState({ kind: 'on', endpoint, prefs });
    });

  const test = (endpoint: string) =>
    startTransition(async () => {
      const result = await sendTestPush(endpoint);
      if (!result.ok) toast.error(result.message);
    });

  switch (state.kind) {
    case 'loading':
      return <p className="text-sm text-muted-foreground">Checking this browser…</p>;
    case 'unsupported':
      return (
        <p className="text-sm text-muted-foreground">
          This browser cannot show push notifications. On iPhone and iPad, add the app to your Home Screen first.
        </p>
      );
    case 'blocked':
      return (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser’s site settings, then reload the page.
        </p>
      );
    case 'off':
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Get a notification when a run starts or finishes in any of your teams’ projects.</p>
          <Button size="sm" onClick={enable} disabled={pending}>
            <BellRing data-icon="inline-start" />
            {pending ? 'Turning on…' : 'Turn on notifications'}
          </Button>
        </div>
      );
    case 'on': {
      const { endpoint, prefs } = state;
      return (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="mb-1 text-sm font-medium">Notify me when a run</legend>
            <Checkbox
              label="Starts"
              checked={prefs.notifyStarted}
              onChange={(v) => update(endpoint, { ...prefs, notifyStarted: v })}
            />
            <Checkbox
              label="Finishes, with its result"
              checked={prefs.notifyFinished}
              onChange={(v) => update(endpoint, { ...prefs, notifyFinished: v })}
            />
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => test(endpoint)} disabled={pending}>
              <Send data-icon="inline-start" />
              Send a test
            </Button>
            <Button size="sm" variant="ghost" onClick={() => disable(endpoint)} disabled={pending}>
              <BellOff data-icon="inline-start" />
              Turn off in this browser
            </Button>
          </div>
        </div>
      );
    }
  }
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex w-fit items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array) {
  if (!a || a.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
}
