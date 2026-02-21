import { MAPPER_MODEL_VERSION, type MapperState } from "./types"

export const CURRENT_MODEL_VERSION = MAPPER_MODEL_VERSION

// ============================================================
// Error type
// ============================================================

export class SerializationError extends Error {
    constructor(
        message: string,
        public override cause?: unknown,
    ) {
        super(message)
        this.name = "SerializationError"
    }
}

// ============================================================
// Type guards
// ============================================================

/**
 * Type guard — check if an unknown value is a valid MapperState shape.
 */
export function isMapperState(value: unknown): value is MapperState {
    if (typeof value !== "object" || value === null) return false
    const v = value as Record<string, unknown>
    return (
        typeof v["modelVersion"] === "number" &&
        v["modelVersion"] === CURRENT_MODEL_VERSION &&
        typeof v["id"] === "string" &&
        (v["sourceTreeNode"] === null || typeof v["sourceTreeNode"] === "object") &&
        (v["targetTreeNode"] === null || typeof v["targetTreeNode"] === "object") &&
        Array.isArray(v["references"]) &&
        typeof v["localContext"] === "object" &&
        typeof v["mapperPreferences"] === "object" &&
        typeof v["sourceInputType"] === "string" &&
        typeof v["targetInputType"] === "string"
    )
}

/**
 * Type guard for old Vaadin .jtmap format.
 * Old format has modelVersion 2-8, or is missing modelVersion entirely,
 * or has a sourceTreeNode with jsonId integer fields.
 */
export function isLegacyJtmap(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false
    const v = value as Record<string, unknown>

    // No modelVersion at all — likely old format
    if (!("modelVersion" in v)) return true

    const ver = v["modelVersion"]
    // Old Vaadin format used modelVersion 2–8 (Java side)
    // New TS format uses modelVersion = 1
    if (typeof ver === "number" && ver >= 2 && ver <= 8) return true

    // Has sourceTreeNode with a jsonId field (old format artifact)
    if (typeof v["sourceTreeNode"] === "object" && v["sourceTreeNode"] !== null) {
        const src = v["sourceTreeNode"] as Record<string, unknown>
        if ("jsonId" in src) return true
    }

    return false
}

// ============================================================
// Serialize / Deserialize
// ============================================================

/**
 * Serialize MapperState to a JSON string (pretty-printed).
 */
export function serializeMapperState(state: MapperState): string {
    try {
        return JSON.stringify(state, null, 2)
    } catch (err) {
        throw new SerializationError("Failed to serialize MapperState", err)
    }
}

/**
 * Deserialize a MapperState JSON string.
 * Handles modelVersion < CURRENT_MODEL_VERSION by delegating to migration.ts.
 * Throws SerializationError with a clear message if JSON is malformed.
 */
export function deserializeMapperState(json: string): MapperState {
    let parsed: unknown
    try {
        parsed = JSON.parse(json)
    } catch (err) {
        throw new SerializationError("Failed to parse MapperState JSON — invalid JSON syntax", err)
    }

    if (isMapperState(parsed)) {
        return parsed
    }

    if (isLegacyJtmap(parsed)) {
        // Lazy import to avoid circular dependency issues
        const { migrateFromJtmap } = require("./migration") as {
            migrateFromJtmap: (json: Record<string, unknown>) => MapperState
        }
        return migrateFromJtmap(parsed as Record<string, unknown>)
    }

    throw new SerializationError(
        "Unrecognized file format — not a valid MapperState or legacy .jtmap file",
    )
}
