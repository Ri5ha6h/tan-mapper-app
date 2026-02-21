import { v4 as uuidv4 } from "uuid"
import type { MapperState, MapperTreeNode } from "./types"
import { deserializeMapperState } from "./serialization"
import { migrateFromJtmap } from "./migration"
import { isLegacyJtmap, isMapperState } from "./serialization"

// ============================================================
// Types
// ============================================================

export interface SavedMapEntry {
    id: string // UUID — localStorage key suffix
    name: string // Human-readable name
    savedAt: string // ISO timestamp
    sourceInputType: string | null
    targetInputType: string | null
    nodeCount: number // Quick stats for the open dialog
}

// localStorage key schema:
// "jtmapper:index"        → JSON array of SavedMapEntry[]
// "jtmapper:map:{id}"     → JSON string of full MapperState

// ============================================================
// Internal helpers
// ============================================================

function countNodes(node: MapperTreeNode | null | undefined): number {
    if (!node) return 0
    let count = 1
    if (node.children) {
        for (const child of node.children) {
            count += countNodes(child)
        }
    }
    return count
}

function saveWithQuotaCheck(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
            throw new Error("Storage quota exceeded. Please delete some saved maps to free space.")
        }
        throw err
    }
}

// ============================================================
// Public API
// ============================================================

/**
 * Lists all saved maps from localStorage, newest first.
 */
export function listSavedMaps(): SavedMapEntry[] {
    try {
        const raw = localStorage.getItem("jtmapper:index")
        if (!raw) return []
        const entries = JSON.parse(raw) as SavedMapEntry[]
        return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    } catch {
        return []
    }
}

/**
 * Saves the current state to localStorage under a given ID and name.
 * Creates or updates the entry in the index.
 * Returns the ID used.
 */
export function saveToLocal(state: MapperState, name: string, id?: string): string {
    const mapId = id ?? uuidv4()
    const json = JSON.stringify(state, null, 2)

    // Save the state:
    saveWithQuotaCheck(`jtmapper:map:${mapId}`, json)

    // Update index:
    const index = listSavedMaps().filter((e) => e.id !== mapId)
    const entry: SavedMapEntry = {
        id: mapId,
        name,
        savedAt: new Date().toISOString(),
        sourceInputType: state.sourceInputType ?? null,
        targetInputType: state.targetInputType ?? null,
        nodeCount: countNodes(state.sourceTreeNode) + countNodes(state.targetTreeNode),
    }
    index.unshift(entry) // Add to front (newest first)
    saveWithQuotaCheck("jtmapper:index", JSON.stringify(index))

    return mapId
}

/**
 * Loads a saved map from localStorage by ID.
 * Returns null if not found.
 */
export function loadFromLocal(id: string): MapperState | null {
    try {
        const raw = localStorage.getItem(`jtmapper:map:${id}`)
        if (!raw) return null
        return deserializeMapperState(raw)
    } catch {
        return null
    }
}

/**
 * Deletes a saved map from localStorage by ID.
 */
export function deleteFromLocal(id: string): void {
    try {
        localStorage.removeItem(`jtmapper:map:${id}`)
        const index = listSavedMaps().filter((e) => e.id !== id)
        localStorage.setItem("jtmapper:index", JSON.stringify(index))
    } catch {
        // Ignore errors on delete
    }
}

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
