/* global self, URL */
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  // Access のセッションが失効していても、受信した内容だけで通知を表示する。
  const message = event.data.json();
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body, tag: message.tag, icon: "/icons/app-192.png", badge: "/icons/app-192.png",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 通知 payload に遷移先を委ねず、本人認証のある画面へ戻す。
  event.waitUntil(self.clients.openWindow(new URL("/operations", self.location.origin).href));
});
