import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { eq, and, desc } from "drizzle-orm"
import { authMiddleware } from "@/lib/auth-middleware"
import { db } from "@/db"
import { mapChains } from "@/db/schema"

// ============================================================
// listChains — List all chains for the current user
// ============================================================

export const listChains = createServerFn()
    .middleware([authMiddleware])
    .handler(async ({ context }) => {
        return db
            .select({
                id: mapChains.id,
                name: mapChains.name,
                linkCount: mapChains.linkCount,
                createdAt: mapChains.createdAt,
                updatedAt: mapChains.updatedAt,
            })
            .from(mapChains)
            .where(eq(mapChains.userId, context.userId))
            .orderBy(desc(mapChains.updatedAt))
    })

// ============================================================
// saveChain — Create or update a chain (upsert)
// ============================================================

export const saveChain = createServerFn({ method: "POST" })
    .middleware([authMiddleware])
    .inputValidator(
        z.object({
            id: z.string().uuid().optional(),
            name: z.string().min(1),
            chain: z.record(z.string(), z.any()),
            linkCount: z.number().int().optional(),
        }),
    )
    .handler(async ({ data, context }) => {
        const id = data.id ?? crypto.randomUUID()
        const now = new Date()

        await db
            .insert(mapChains)
            .values({
                id,
                userId: context.userId,
                name: data.name,
                chain: data.chain,
                linkCount: data.linkCount ?? 0,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: mapChains.id,
                set: {
                    name: data.name,
                    chain: data.chain,
                    linkCount: data.linkCount,
                    updatedAt: now,
                },
                where: eq(mapChains.userId, context.userId),
            })

        return { id, name: data.name, savedAt: now.toISOString() }
    })

// ============================================================
// loadChain — Load a single chain's full state
// ============================================================

export const loadChain = createServerFn()
    .middleware([authMiddleware])
    .inputValidator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const [chain] = await db
            .select()
            .from(mapChains)
            .where(and(eq(mapChains.id, data.id), eq(mapChains.userId, context.userId)))
            .limit(1)

        if (!chain) throw new Error("Chain not found")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return chain.chain as Record<string, any>
    })

// ============================================================
// deleteChain — Delete a chain
// ============================================================

export const deleteChain = createServerFn({ method: "POST" })
    .middleware([authMiddleware])
    .inputValidator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const result = await db
            .delete(mapChains)
            .where(and(eq(mapChains.id, data.id), eq(mapChains.userId, context.userId)))
            .returning({ id: mapChains.id })

        if (result.length === 0) throw new Error("Chain not found")

        return { deleted: true }
    })
