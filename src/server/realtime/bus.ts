import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import { getRedis } from "../redis";

/**
 * Шина событий реального времени. Основной путь — Redis pub/sub (несколько экземпляров сервера видят одни события).
 * Если Redis недоступен, события идут через EventEmitter внутри процесса (одиночный сервер продолжает работать).
 */
const CHANNEL = "verdant:crash";
const g = globalThis as unknown as { vdBus?: EventEmitter; vdSub?: Redis | null };
const local = (g.vdBus ??= new EventEmitter().setMaxListeners(1000));

export type CrashEvent =
  | { t: "state"; state: unknown }
  | { t: "bet"; bet: { id: string; user: string; avatar: string; amount: string; auto: number | null } }
  | { t: "cashout"; cashout: { id: string; user: string; multiplier: number; payout: string } };

export async function publish(ev: CrashEvent) {
  const redis = getRedis();
  if (redis && redis.status === "ready") {
    try { await redis.publish(CHANNEL, JSON.stringify(ev)); return; } catch { /* упадём в локальную шину */ }
  }
  local.emit(CHANNEL, ev);
}

export function subscribe(fn: (ev: CrashEvent) => void): () => void {
  local.on(CHANNEL, fn);
  const redis = getRedis();
  if (redis && g.vdSub === undefined) {
    g.vdSub = redis.duplicate();
    void g.vdSub.subscribe(CHANNEL).catch((e) => console.error("[bus] subscribe", e.message));
    g.vdSub.on("message", (_ch, msg) => { try { local.emit(CHANNEL + ":remote", JSON.parse(msg)); } catch { /* мусор игнорируем */ } });
  }
  local.on(CHANNEL + ":remote", fn);
  return () => { local.off(CHANNEL, fn); local.off(CHANNEL + ":remote", fn); };
}
