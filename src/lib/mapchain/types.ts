// ============================================================
// Map Chain — Type Definitions
// Phase 11
// ============================================================

export type MapChainLinkType = "JT_MAP" | "JT_SCRIPT"

export interface MapChainLink {
    id: string // UUID
    type: MapChainLinkType
    name: string // Display name (auto-derived from reference)
    enabled: boolean // Whether this step is active in execution

    // For JT_MAP links:
    mapId?: string // localStorage ID of the saved map
    mapName?: string // Cached display name

    // For JT_SCRIPT links:
    scriptCode?: string // Inline JS code (must accept input string, return output string)
    scriptName?: string // User-given name for this script step
}

export interface MapChain {
    id: string // UUID
    name: string
    links: Array<MapChainLink>
    testInput?: string // Saved test payload for the execute dialog
}

export interface ChainStepResult {
    linkId: string
    status: "pending" | "running" | "done" | "error" | "skipped"
    output: string
    error: string | null
    durationMs: number
}
