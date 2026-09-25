'use client';

import { BellOff, BellRing, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { Label } from '../../components/label';

export interface PushPreferences {
  notifyStarted: boolean;
  notifyFinished: boolean;
}

/**
 * Where this browser stands. The app works it out from the service worker and
 * the Notification permission; this view only renders it.
 */
export type PushNotificationsState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'blocked' }
  | { kind: 'off' }
  | { kind: 'on'; prefs: PushPreferences };

export interface PushNotificationsProps {
  state: PushNotificationsState;
  pending?: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onPreferencesChange: (prefs: PushPreferences) => void;
  onTest: () => void;
}

/** Run notifications for this browser: each browser subscribes on its own. */
export function PushNotifications({ state, pending = false, onEnable, onDisable, onPreferencesChange, onTest }: PushNotificationsProps) {
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
          <Button size="sm" onClick={onEnable} disabled={pending}>
            <BellRing data-icon="inline-start" />
            {pending ? 'Turning on…' : 'Turn on notifications'}
          </Button>
        </div>
      );
    case 'on': {
      const { prefs } = state;
      return (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="mb-1 text-sm font-medium">Notify me when a run</legend>
            <Label className="w-fit font-normal">
              <Checkbox
                checked={prefs.notifyStarted}
                disabled={pending}
                onCheckedChange={(v) => onPreferencesChange({ ...prefs, notifyStarted: v })}
              />
              Starts
            </Label>
            <Label className="w-fit font-normal">
              <Checkbox
                checked={prefs.notifyFinished}
                disabled={pending}
                onCheckedChange={(v) => onPreferencesChange({ ...prefs, notifyFinished: v })}
              />
              Finishes, with its result
            </Label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onTest} disabled={pending}>
              <Send data-icon="inline-start" />
              Send a test
            </Button>
            <Button size="sm" variant="ghost" onClick={onDisable} disabled={pending}>
              <BellOff data-icon="inline-start" />
              Turn off in this browser
            </Button>
          </div>
        </div>
      );
    }
  }
}
