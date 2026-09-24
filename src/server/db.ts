import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __stPrisma?: PrismaClient };

/** Single Prisma client per process (shared by the custom server and route handlers). */
export const prisma: PrismaClient =
  g.__stPrisma ??
  (g.__stPrisma = new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  }));
