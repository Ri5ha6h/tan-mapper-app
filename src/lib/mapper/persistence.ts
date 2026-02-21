import type { MapperState, MapperTreeNode } from "./types"
import { deserializeMapperState } from "./serialization"
import { migrateFromJtmap } from "./migration"
import { isLegacyJtmap, isMapperState } from "./serialization"

// ============================================================
// Helpers
// ============================================================

/**
 * Count total tree nodes (source + target helper).
 */
export function countNodes(node: MapperTreeNode | null | undefined): number {
    if (!node) return 0
    let count = 1
    if (node.children) {
        for (const child of node.children) {
            count += countNodes(child)
        }
    }
    return count
}

// ============================================================
// Client-side file I/O (download / upload)
// ============================================================

/**
 * Triggers a browser download of the state as a .jtmap JSON file.
 */
export function downloadAsJtmap(state: MapperState, filename?: string): void {
    const json = JSON.stringify(state, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = filename ?? `${state.name ?? "mapper"}.jtmap`
    a.click()

    URL.revokeObjectURL(url)
}

/**
 * Parses a .jtmap file (File object) into MapperState.
 * Returns null state with error message if parsing fails.
 */
export async function loadFromJtmapFile(
    file: File,
): Promise<{ state: MapperState | null; error: string | null }> {
    try {
        const text = await file.text()
        const state = parseJtmapJson(text)
        if (!state) return { state: null, error: "Invalid .jtmap format" }
        return { state, error: null }
    } catch (err) {
        return { state: null, error: err instanceof Error ? err.message : "Unknown error" }
    }
}

/**
 * Parses a .jtmap JSON string into MapperState.
 * Handles both new v1 format and old Vaadin format (via migration.ts).
 */
export function parseJtmapJson(json: string): MapperState | null {
    try {
        const raw = JSON.parse(json) as unknown

        // Check model version:
        if (isMapperState(raw)) {
            // New v1 format — deserialize directly
            return deserializeMapperState(json)
        }

        if (isLegacyJtmap(raw)) {
            // Old Vaadin format — migrate
            return migrateFromJtmap(raw as Record<string, unknown>)
        }

        return null
    } catch {
        return null
    }
}
