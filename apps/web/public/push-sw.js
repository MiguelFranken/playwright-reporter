// Shows the run notifications `lib/push/notify.ts` sends, and opens the run
// when one is clicked. Registered by the account page's notification switch.

self.addEventListener('push', (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  if (!message || !message.title) return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      // A run's result replaces its start; say so again rather than silently.
      renotify: Boolean(message.tag),
      icon: '/favicon.ico',
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open tab of the app instead of piling up new ones.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          // Only a tab this worker controls can be navigated.
          await open.navigate(url);
          return open.focus();
        } catch {
          /* uncontrolled: open a new one */
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
