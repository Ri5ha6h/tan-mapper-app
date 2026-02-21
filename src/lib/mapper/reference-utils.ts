import { v4 as uuidv4 } from "uuid"
import type {
    FlatReference,
    LoopReference,
    MapperContext,
    MapperPreferences,
    MapperState,
    MapperTreeNode,
    SourceReference,
} from "./types"
import { findNodeById, getAncestors, traverseDown } from "./node-utils"

// ============================================================
// Variable naming
// ============================================================

/**
 * Generate the next generic variable name ("var0", "var1", ...).
 * Finds the next integer not already used.
 */
export function generateVariableName(existingNames: Set<string>): string {
    let i = 0
    while (existingNames.has(`var${i}`)) {
        i++
    }
    return `var${i}`
}

/**
 * Generate a smart variable name from a source node name.
 * "orderId" → "_orderId"
 * Collision: "_orderId" exists → "_orderId_1", then "_orderId_2", etc.
 * Replaces illegal JS identifier chars with "_".
 */
export function suggestVariableName(sourceName: string, existingNames: Set<string>): string {
    // Replace non-word characters with underscores, then prefix with _
    const sanitized = sourceName.replace(/[^\w]/g, "_")
    const base = `_${sanitized}`

    if (!existingNames.has(base)) return base

    let i = 1
    while (existingNames.has(`${base}_${i}`)) {
        i++
    }
    return `${base}_${i}`
}

// ============================================================
// Reference collection utilities
// ============================================================

/**
 * Collect all variable names currently in use across the entire target tree.
 */
export function collectUsedVariableNames(state: MapperState): Set<string> {
    const names = new Set<string>()
    if (!state.targetTreeNode) return names

    traverseDown(state.targetTreeNode, (node) => {
        if (node.loopReference) {
            names.add(node.loopReference.variableName)
        }
        if (node.sourceReferences) {
            for (const ref of node.sourceReferences) {
                names.add(ref.variableName)
            }
        }
    })

    return names
}

/**
 * Get all LoopReferences defined anywhere in the target tree.
 * Used to populate the loop reference selector in the node editor.
 */
export function getAllLoopReferences(state: MapperState): LoopReference[] {
    const loops: LoopReference[] = []
    if (!state.targetTreeNode) return loops

    traverseDown(state.targetTreeNode, (node) => {
        if (node.loopReference) {
            loops.push(node.loopReference)
        }
    })

    return loops
}

// ============================================================
// Loop ancestor detection
// ============================================================

/**
 * Find the nearest loop reference in target tree ancestors that is "related"
 * to the given sourceNodeId. Used to auto-assign loopOverId when a user
 * drops a source node onto a target node.
 *
 * A loop ref is "related" if its sourceNode is an ancestor of the dropped source node.
 */
export function findNearestLoopAncestor(
    targetNodeId: string,
    sourceNodeId: string,
    state: MapperState,
): LoopReference | null {
    if (!state.targetTreeNode || !state.sourceTreeNode) return null

    // Get all ancestors of the target node (root first)
    const ancestors = getAncestors(targetNodeId, state.targetTreeNode)

    // Also get ancestors of the source node to compare
    const sourceAncestorIds = new Set(
        getAncestors(sourceNodeId, state.sourceTreeNode).map((n) => n.id),
    )
    // Include the source node itself
    sourceAncestorIds.add(sourceNodeId)

    // Walk ancestors from closest (last) to furthest (first)
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i]
        if (ancestor.loopReference) {
            const loopSourceNodeId = ancestor.loopReference.sourceNodeId
            // The loop ref is related if its source node is an ancestor of the dropped source node
            if (sourceAncestorIds.has(loopSourceNodeId)) {
                return ancestor.loopReference
            }
        }
    }

    return null
}

// ============================================================
// Flat reference sync
// ============================================================

/**
 * Rebuild the flat state.references[] from all target nodes' sourceReferences.
 * Call after any mutation to keep denormalized list in sync.
 */
export function syncFlatReferences(state: MapperState): FlatReference[] {
    const refs: FlatReference[] = []
    if (!state.targetTreeNode) return refs

    function collectRefs(node: MapperTreeNode): void {
        if (node.loopReference) {
            const lr = node.loopReference
            refs.push({
                id: lr.id,
                sourceNodeId: lr.sourceNodeId,
                targetNodeId: node.id,
                variableName: lr.variableName,
                textReference: lr.textReference,
                customPath: lr.customPath,
                loopOverId: lr.loopOverId,
                isLoop: true,
            })
        }
        if (node.sourceReferences) {
            for (const ref of node.sourceReferences) {
                refs.push({
                    id: ref.id,
                    sourceNodeId: ref.sourceNodeId,
                    targetNodeId: node.id,
                    variableName: ref.variableName,
                    textReference: ref.textReference,
                    customPath: ref.customPath,
                    loopOverId: ref.loopOverId,
                    isLoop: false,
                })
            }
        }
        if (node.children) {
            for (const child of node.children) {
                collectRefs(child)
            }
        }
    }

    collectRefs(state.targetTreeNode)
    return refs
}

// ============================================================
// Reference validation
// ============================================================

/**
 * Check if a FlatReference is valid (both source and target nodes still exist).
 */
export function isReferenceValid(
    ref: FlatReference,
    sourceTree: MapperTreeNode,
    targetTree: MapperTreeNode,
): boolean {
    const sourceExists = findNodeById(ref.sourceNodeId, sourceTree) !== null
    const targetExists = findNodeById(ref.targetNodeId, targetTree) !== null
    return sourceExists && targetExists
}

/**
 * Remove all references pointing to a given source node ID.
 * Call when a source node is deleted.
 */
export function removeReferencesForSourceNode(
    nodeId: string,
    targetTree: MapperTreeNode,
): MapperTreeNode {
    function cleanNode(node: MapperTreeNode): MapperTreeNode {
        const updates: Partial<MapperTreeNode> = {}

        if (node.loopReference && node.loopReference.sourceNodeId === nodeId) {
            updates.loopReference = undefined
            updates.loopIterator = undefined
        }

        if (node.sourceReferences) {
            const filtered = node.sourceReferences.filter((r) => r.sourceNodeId !== nodeId)
            if (filtered.length !== node.sourceReferences.length) {
                updates.sourceReferences = filtered
            }
        }

        const cleaned: MapperTreeNode = { ...node, ...updates }
        if (node.children) {
            cleaned.children = node.children.map(cleanNode)
        }
        return cleaned
    }

    return cleanNode(targetTree)
}

// ============================================================
// Default factory functions
// ============================================================

/** Create a default MapperContext (empty). */
export function createDefaultContext(): MapperContext {
    return {
        globalVariables: [],
        lookupTables: [],
        functions: [],
        prologScript: null,
        epilogScript: null,
    }
}

/** Create default MapperPreferences. */
export function createDefaultPreferences(): MapperPreferences {
    return {
        debugComment: false,
        overrideTargetValue: true,
        autoMap: false,
        autoMapOneToMany: false,
        autoMapIncludeSubNodes: false,
    }
}

// ============================================================
// SourceReference factory
// ============================================================

/**
 * Create a new SourceReference with a generated UUID.
 */
export function createSourceReference(
    sourceNodeId: string,
    variableName: string,
    textReference = true,
    partial?: Partial<SourceReference>,
): SourceReference {
    return {
        id: uuidv4(),
        sourceNodeId,
        variableName,
        textReference,
        ...partial,
    }
}

/**
 * Create a new LoopReference with a generated UUID.
 */
export function createLoopReference(
    sourceNodeId: string,
    variableName: string,
    partial?: Partial<LoopReference>,
): LoopReference {
    return {
        id: uuidv4(),
        sourceNodeId,
        variableName,
        textReference: false,
        isLoop: true,
        ...partial,
    }
}
