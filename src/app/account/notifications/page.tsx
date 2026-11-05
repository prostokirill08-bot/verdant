"use client";
import { NotificationList } from "@/components/shell/Notifications";

export default function NotificationsPage() {
  return (
    <section className="rounded-3xl border border-line bg-panel p-4 sm:p-6">
      <NotificationList full />
    </section>
  );
}
