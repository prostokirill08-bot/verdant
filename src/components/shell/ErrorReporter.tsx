"use client";
import { useEffect } from "react";

/** Отправляет необработанные ошибки браузера в журнал ошибок (раздел «Ошибки» в админке). Не чаще 5 за загрузку. */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0; const seen = new Set<string>();
    const report = (message: string, stack?: string) => {
      if (sent >= 5 || !message || seen.has(message) || /ResizeObserver|Script error|extension:\/\//.test(message)) return;
      seen.add(message); sent++;
      fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: message.slice(0, 500), path: location.pathname.slice(0, 300), stack: stack?.slice(0, 4000) }), keepalive: true }).catch(() => {});
    };
    const onErr = (e: ErrorEvent) => report(e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => { const r = e.reason; if (r?.name === "ApiError" || r?.status) return; report(String(r?.message ?? r), r?.stack); };
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
