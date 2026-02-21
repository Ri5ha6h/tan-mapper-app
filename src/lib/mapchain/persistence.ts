import { v4 as uuidv4 } from "uuid"
import type { MapChain } from "./types"

// ============================================================
// Types
// ============================================================

export interface SavedChainEntry {
    id: string
    name: string
    savedAt: string
    linkCount: number
}

// localStorage key schema:
// "jtchain:index"         → JSON array of SavedChainEntry[]
// "jtchain:chain:{id}"    → JSON string of full MapChain

// ============================================================
// Internal helpers
// ============================================================

function saveWithQuotaCheck(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
            throw new Error(
                "Storage quota exceeded. Please delete some saved chains to free space.",
            )
        }
        throw err
    }
}

// ============================================================
// Public API
// ============================================================

/**
 * Lists all saved chains from localStorage, newest first.
 */
export function listSavedChains(): Array<SavedChainEntry> {
    try {
        const raw = localStorage.getItem("jtchain:index")
        if (!raw) return []
        const entries = JSON.parse(raw) as Array<SavedChainEntry>
        return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    } catch {
        return []
    }
}

/**
 * Saves a chain to localStorage under a given name/ID.
 * Creates or updates the entry in the index.
 * Returns the ID used.
 */
export function saveChainToLocal(chain: MapChain, name: string, id?: string): string {
    const chainId = id ?? uuidv4()
    const json = JSON.stringify({ version: 1, ...chain }, null, 2)

    saveWithQuotaCheck(`jtchain:chain:${chainId}`, json)

    const index = listSavedChains().filter((e) => e.id !== chainId)
    const entry: SavedChainEntry = {
        id: chainId,
        name,
        savedAt: new Date().toISOString(),
        linkCount: chain.links.length,
    }
    index.unshift(entry)
    saveWithQuotaCheck("jtchain:index", JSON.stringify(index))

    return chainId
}

/**
 * Loads a saved chain from localStorage by ID.
 * Returns null if not found or invalid.
 */
export function loadChainFromLocal(id: string): MapChain | null {
    try {
        const raw = localStorage.getItem(`jtchain:chain:${id}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as MapChain & { version?: number }
        // Strip internal version field before returning
        const { version: _version, ...chain } = parsed
        return chain as MapChain
    } catch {
        return null
    }
}

/**
 * Deletes a saved chain from localStorage by ID.
 */
export function deleteChainFromLocal(id: string): void {
    try {
        localStorage.removeItem(`jtchain:chain:${id}`)
        const index = listSavedChains().filter((e) => e.id !== id)
        localStorage.setItem("jtchain:index", JSON.stringify(index))
    } catch {
        // Ignore errors on delete
    }
}

/**
 * Triggers a browser download of the chain as a .jtchain JSON file.
 */
export function downloadAsJtchain(chain: MapChain, filename?: string): void {
    const json = JSON.stringify({ version: 1, ...chain }, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = filename ?? `${chain.name}.jtchain`
    a.click()

    URL.revokeObjectURL(url)
}

/**
 * Parses a .jtchain file (File object) into a MapChain.
 * Returns null chain with error string if parsing fails.
 */
export async function loadFromJtchainFile(
    file: File,
): Promise<{ chain: MapChain | null; error: string | null }> {
    try {
        const text = await file.text()
        const parsed = JSON.parse(text) as MapChain & { version?: number }
        if (!parsed.id || !parsed.name || !Array.isArray(parsed.links)) {
            return { chain: null, error: "Invalid .jtchain format" }
        }
        const { version: _version, ...chain } = parsed
        return { chain: chain as MapChain, error: null }
    } catch (err) {
        return { chain: null, error: err instanceof Error ? err.message : "Unknown error" }
    }
}
