/**
 * One-time migration utility: reads all jtmapper:* and jtchain:* entries
 * from localStorage and uploads them to the server via persistence.server functions.
 *
 * This file can be removed in a future cleanup pass once all users have migrated.
 */

import { saveMap } from "@/lib/mapper/persistence.server"
import { saveChain } from "@/lib/mapchain/persistence.server"
import { deserializeMapperState } from "@/lib/mapper/serialization"
import { countNodes } from "@/lib/mapper/persistence"
import type { MapperState } from "@/lib/mapper/types"
import type { MapChain } from "@/lib/mapchain/types"

// ============================================================
// Types
// ============================================================

interface LocalStorageMapIndex {
    id: string
    name: string
    savedAt: string
    sourceInputType: string | null
    targetInputType: string | null
    nodeCount: number
}

interface LocalStorageChainIndex {
    id: string
    name: string
    savedAt: string
    linkCount: number
}

export interface MigrationResult {
    mapsImported: number
    chainsImported: number
    errors: string[]
}

// ============================================================
// Detection
// ============================================================

/**
 * Check if there are any jtmapper:* or jtchain:* keys in localStorage.
 * Returns counts for display in a migration banner.
 */
export function detectLocalStorageData(): { mapCount: number; chainCount: number } {
    if (typeof window === "undefined" || !window.localStorage) {
        return { mapCount: 0, chainCount: 0 }
    }

    try {
        const mapIndex = localStorage.getItem("jtmapper:index")
        const chainIndex = localStorage.getItem("jtchain:index")

        const mapCount = mapIndex ? (JSON.parse(mapIndex) as unknown[]).length : 0
        const chainCount = chainIndex ? (JSON.parse(chainIndex) as unknown[]).length : 0

        return { mapCount, chainCount }
    } catch {
        return { mapCount: 0, chainCount: 0 }
    }
}

// ============================================================
// Migration
// ============================================================

/**
 * Migrate all localStorage maps and chains to the server.
 * On success for each item, removes the localStorage entry.
 * Returns a summary of what was migrated and any errors.
 */
export async function migrateLocalStorageToServer(): Promise<MigrationResult> {
    const result: MigrationResult = { mapsImported: 0, chainsImported: 0, errors: [] }

    if (typeof window === "undefined" || !window.localStorage) {
        return result
    }

    // ── Migrate maps ────────────────────────────────────────────────────────

    try {
        const mapIndexRaw = localStorage.getItem("jtmapper:index")
        if (mapIndexRaw) {
            const mapEntries = JSON.parse(mapIndexRaw) as LocalStorageMapIndex[]

            for (const entry of mapEntries) {
                try {
                    const stateRaw = localStorage.getItem(`jtmapper:map:${entry.id}`)
                    if (!stateRaw) {
                        result.errors.push(`Map "${entry.name}": data not found in localStorage`)
                        continue
                    }

                    let state: MapperState
                    try {
                        state = deserializeMapperState(stateRaw)
                    } catch {
                        result.errors.push(`Map "${entry.name}": failed to parse state`)
                        continue
                    }

                    const nodeCount =
                        countNodes(state.sourceTreeNode) + countNodes(state.targetTreeNode)

                    await saveMap({
                        data: {
                            name: entry.name,
                            state: state as unknown as Record<string, unknown>,
                            sourceInputType: state.sourceInputType ?? undefined,
                            targetInputType: state.targetInputType ?? undefined,
                            nodeCount,
                        },
                    })

                    // Remove from localStorage on success
                    localStorage.removeItem(`jtmapper:map:${entry.id}`)
                    result.mapsImported++
                } catch (err) {
                    result.errors.push(
                        `Map "${entry.name}": ${err instanceof Error ? err.message : "unknown error"}`,
                    )
                }
            }

            // Clear the index if all maps migrated successfully
            if (result.mapsImported === mapEntries.length) {
                localStorage.removeItem("jtmapper:index")
            }
        }
    } catch (err) {
        result.errors.push(
            `Map index: ${err instanceof Error ? err.message : "failed to read index"}`,
        )
    }

    // ── Migrate chains ──────────────────────────────────────────────────────

    try {
        const chainIndexRaw = localStorage.getItem("jtchain:index")
        if (chainIndexRaw) {
            const chainEntries = JSON.parse(chainIndexRaw) as LocalStorageChainIndex[]

            for (const entry of chainEntries) {
                try {
                    const chainRaw = localStorage.getItem(`jtchain:chain:${entry.id}`)
                    if (!chainRaw) {
                        result.errors.push(`Chain "${entry.name}": data not found in localStorage`)
                        continue
                    }

                    const parsed = JSON.parse(chainRaw) as MapChain & { version?: number }
                    const { version: _version, ...chain } = parsed

                    await saveChain({
                        data: {
                            name: entry.name,
                            chain: chain as unknown as Record<string, unknown>,
                            linkCount: chain.links?.length ?? 0,
                        },
                    })

                    // Remove from localStorage on success
                    localStorage.removeItem(`jtchain:chain:${entry.id}`)
                    result.chainsImported++
                } catch (err) {
                    result.errors.push(
                        `Chain "${entry.name}": ${err instanceof Error ? err.message : "unknown error"}`,
                    )
                }
            }

            // Clear the index if all chains migrated successfully
            if (result.chainsImported === chainEntries.length) {
                localStorage.removeItem("jtchain:index")
            }
        }
    } catch (err) {
        result.errors.push(
            `Chain index: ${err instanceof Error ? err.message : "failed to read index"}`,
        )
    }

    return result
}

/**
 * Force-clear all jtmapper:* and jtchain:* keys from localStorage.
 * Useful after a successful migration or if the user wants to discard local data.
 */
export function clearLocalStorageData(): void {
    if (typeof window === "undefined" || !window.localStorage) return

    // Clear map data
    try {
        const mapIndexRaw = localStorage.getItem("jtmapper:index")
        if (mapIndexRaw) {
            const entries = JSON.parse(mapIndexRaw) as Array<{ id: string }>
            for (const entry of entries) {
                localStorage.removeItem(`jtmapper:map:${entry.id}`)
            }
            localStorage.removeItem("jtmapper:index")
        }
    } catch {
        // best-effort cleanup
    }

    // Clear chain data
    try {
        const chainIndexRaw = localStorage.getItem("jtchain:index")
        if (chainIndexRaw) {
            const entries = JSON.parse(chainIndexRaw) as Array<{ id: string }>
            for (const entry of entries) {
                localStorage.removeItem(`jtchain:chain:${entry.id}`)
            }
            localStorage.removeItem("jtchain:index")
        }
    } catch {
        // best-effort cleanup
    }
}
