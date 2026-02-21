import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { eq, and, desc } from "drizzle-orm"
import { authMiddleware } from "@/lib/auth-middleware"
import { db } from "@/db"
import { mapperMaps } from "@/db/schema"

// ============================================================
// listMaps — List all maps for the current user
// ============================================================

export const listMaps = createServerFn()
    .middleware([authMiddleware])
    .handler(async ({ context }) => {
        const maps = await db
            .select({
                id: mapperMaps.id,
                name: mapperMaps.name,
                sourceInputType: mapperMaps.sourceInputType,
                targetInputType: mapperMaps.targetInputType,
                nodeCount: mapperMaps.nodeCount,
                createdAt: mapperMaps.createdAt,
                updatedAt: mapperMaps.updatedAt,
            })
            .from(mapperMaps)
            .where(eq(mapperMaps.userId, context.userId))
            .orderBy(desc(mapperMaps.updatedAt))

        return maps
    })

// ============================================================
// saveMap — Create or update a map (upsert)
// ============================================================

export const saveMap = createServerFn({ method: "POST" })
    .middleware([authMiddleware])
    .inputValidator(
        z.object({
            id: z.string().uuid().optional(),
            name: z.string().min(1),
            state: z.record(z.string(), z.any()),
            sourceInputType: z.string().optional(),
            targetInputType: z.string().optional(),
            nodeCount: z.number().int().optional(),
        }),
    )
    .handler(async ({ data, context }) => {
        const id = data.id ?? crypto.randomUUID()
        const now = new Date()

        await db
            .insert(mapperMaps)
            .values({
                id,
                userId: context.userId,
                name: data.name,
                state: data.state,
                sourceInputType: data.sourceInputType ?? "UNKNOWN",
                targetInputType: data.targetInputType ?? "UNKNOWN",
                nodeCount: data.nodeCount ?? 0,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: mapperMaps.id,
                set: {
                    name: data.name,
                    state: data.state,
                    sourceInputType: data.sourceInputType,
                    targetInputType: data.targetInputType,
                    nodeCount: data.nodeCount,
                    updatedAt: now,
                },
                where: eq(mapperMaps.userId, context.userId),
            })

        return { id, name: data.name, savedAt: now.toISOString() }
    })

// ============================================================
// loadMap — Load a single map's full state
// ============================================================

export const loadMap = createServerFn()
    .middleware([authMiddleware])
    .inputValidator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const [map] = await db
            .select()
            .from(mapperMaps)
            .where(and(eq(mapperMaps.id, data.id), eq(mapperMaps.userId, context.userId)))
            .limit(1)

        if (!map) throw new Error("Map not found")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return map.state as Record<string, any>
    })

// ============================================================
// deleteMap — Delete a map
// ============================================================

export const deleteMap = createServerFn({ method: "POST" })
    .middleware([authMiddleware])
    .inputValidator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const result = await db
            .delete(mapperMaps)
            .where(and(eq(mapperMaps.id, data.id), eq(mapperMaps.userId, context.userId)))
            .returning({ id: mapperMaps.id })

        if (result.length === 0) throw new Error("Map not found or not owned by user")

        return { deleted: true }
    })

// ============================================================
// loadMapForChainExecution — Load a map's state for chain link
// ============================================================

export const loadMapForChainExecution = createServerFn()
    .middleware([authMiddleware])
    .inputValidator(z.object({ mapId: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const [map] = await db
            .select()
            .from(mapperMaps)
            .where(and(eq(mapperMaps.id, data.mapId), eq(mapperMaps.userId, context.userId)))
            .limit(1)

        if (!map) throw new Error("Linked map not found")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return map.state as Record<string, any>
    })
