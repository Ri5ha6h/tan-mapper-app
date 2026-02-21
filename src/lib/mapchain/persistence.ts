import type { MapChain } from "./types"

// ============================================================
// Client-side file I/O (download / upload)
// ============================================================

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
