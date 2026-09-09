import { PrismaClient } from "@prisma/client"

export * from "@prisma/client"

const g = globalThis as unknown as { __srpPrisma?: PrismaClient }

export const prisma: PrismaClient =
	g.__srpPrisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	})

if (process.env.NODE_ENV !== "production") g.__srpPrisma = prisma
