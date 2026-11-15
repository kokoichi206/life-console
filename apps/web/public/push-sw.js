/* global self, URL */
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  // Access のセッションが失効していても、受信した内容だけで通知を表示する。
  const message = event.data.json();
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body, tag: message.tag, icon: "/icons/app-192.png", badge: "/icons/app-192.png",
    data: { workConfirmationId: message.workConfirmationId, calendarEventId: message.calendarEventId },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 遷移先は本人認証のある画面に固定し、payload から外部 URL を受け取らない。
  const id = event.notification.data?.workConfirmationId;
  const calendarId = event.notification.data?.calendarEventId;
  const destination = new URL(typeof calendarId === "string" ? "/todos" : typeof id === "string" ? "/tasks" : "/operations", self.location.origin);
  if (typeof calendarId === "string") {
    destination.searchParams.set("view", "calendar");
    destination.searchParams.set("eventId", calendarId);
  }
  if (typeof calendarId !== "string" && typeof id === "string") {
    destination.searchParams.set("view", "confirmations");
    destination.searchParams.set("confirmationId", id);
  }
  event.waitUntil(self.clients.openWindow(destination.href));
});
