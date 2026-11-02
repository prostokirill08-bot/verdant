import { PrismaClient } from "@prisma/client";

// Один клиент на процесс (в dev Next перезагружает модули — храним в globalThis).
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;
