import { v4 as uuidv4 } from "uuid"
import type { TreeNode } from "./types"
import {
    MAPPER_MODEL_VERSION,
    type ApplyMethod,
    type InputType,
    type MapperContext,
    type MapperNodeType,
    type MapperPreferences,
    type MapperState,
    type MapperTreeNode,
} from "./types"

// ============================================================
// Path utilities
// ============================================================

/**
 * Get the path fragment contributed by this node to the full path.
 * - 'attribute' nodes: "@name"
 * - 'arrayChild' nodes: null (does not contribute)
 * - all others: node.name
 */
export function getPathFragment(node: MapperTreeNode): string | null {
    if (node.type === "arrayChild") return null
    if (node.type === "attribute") return `@${node.name}`
    return node.name
}

/**
 * Get the full dot-separated path from root to the given node ID.
 * Returns empty string if not found.
 * arrayChild nodes are represented as "[]" in the path.
 */
export function getFullPath(nodeId: string, tree: MapperTreeNode): string {
    const segments: string[] = []

    function walk(node: MapperTreeNode): boolean {
        if (node.id === nodeId) {
            const frag = getPathFragment(node)
            if (frag !== null) segments.push(frag)
            return true
        }
        if (node.children) {
            for (const child of node.children) {
                if (walk(child)) {
                    const frag = getPathFragment(node)
                    if (frag !== null) segments.unshift(frag)
                    return true
                }
            }
        }
        return false
    }

    walk(tree)
    return segments.join(".")
}

// ============================================================
// Tree search
// ============================================================

/**
 * Find a node by ID anywhere in a tree (depth-first).
 * Returns null if not found.
 */
export function findNodeById(id: string, tree: MapperTreeNode): MapperTreeNode | null {
    if (tree.id === id) return tree
    if (tree.children) {
        for (const child of tree.children) {
            const found = findNodeById(id, child)
            if (found) return found
        }
    }
    return null
}

/**
 * Find the parent of a given node ID.
 * Returns null if the node is the root or not found.
 */
export function findParentNode(childId: string, tree: MapperTreeNode): MapperTreeNode | null {
    if (tree.children) {
        for (const child of tree.children) {
            if (child.id === childId) return tree
            const found = findParentNode(childId, child)
            if (found) return found
        }
    }
    return null
}

/**
 * Get all ancestors of a node (root first, node last).
 * Returns [] if node not found or is root.
 */
export function getAncestors(nodeId: string, tree: MapperTreeNode): MapperTreeNode[] {
    const path: MapperTreeNode[] = []

    function walk(node: MapperTreeNode): boolean {
        if (node.id === nodeId) {
            return true
        }
        if (node.children) {
            for (const child of node.children) {
                if (walk(child)) {
                    path.unshift(node)
                    return true
                }
            }
        }
        return false
    }

    walk(tree)
    return path
}

// ============================================================
// Tree traversal
// ============================================================

/**
 * Traverse down the tree, calling fn on each node (preorder).
 */
export function traverseDown(node: MapperTreeNode, fn: (n: MapperTreeNode) => void): void {
    fn(node)
    if (node.children) {
        for (const child of node.children) {
            traverseDown(child, fn)
        }
    }
}

/**
 * Traverse with pre/post/leaf variants (matches Vaadin traverseDown overload).
 */
export function traverseDownPPL(
    node: MapperTreeNode,
    preorder: (n: MapperTreeNode) => void,
    postorder: (n: MapperTreeNode) => void,
    leaf: (n: MapperTreeNode) => void,
): void {
    const hasChildren = node.children && node.children.length > 0
    if (hasChildren) {
        preorder(node)
        for (const child of node.children!) {
            traverseDownPPL(child, preorder, postorder, leaf)
        }
        postorder(node)
    } else {
        leaf(node)
    }
}

/**
 * Collect all node IDs in a tree (for validation / lookup).
 */
export function collectAllNodeIds(tree: MapperTreeNode): Set<string> {
    const ids = new Set<string>()
    traverseDown(tree, (n) => ids.add(n.id))
    return ids
}

// ============================================================
// Display helpers
// ============================================================

/** Get display name: label if set, otherwise name. */
export function getDisplayName(node: MapperTreeNode): string {
    return node.label ?? node.name
}

/** Check if a node is a leaf (no children, or empty children array). */
export function isLeaf(node: MapperTreeNode): boolean {
    return !node.children || node.children.length === 0
}

/** Check if a node is the root of the given tree. */
export function isRoot(node: MapperTreeNode, tree: MapperTreeNode): boolean {
    return node.id === tree.id
}

// ============================================================
// Node creation
// ============================================================

/**
 * Create a new MapperTreeNode with a generated UUID.
 */
export function createNode(
    name: string,
    type: MapperNodeType,
    partial?: Partial<MapperTreeNode>,
): MapperTreeNode {
    return {
        id: uuidv4(),
        name,
        type,
        ...partial,
    }
}

/**
 * Create a new empty MapperState with placeholder root nodes.
 */
export function createEmptyMapperState(
    sourceType: InputType = "JSON",
    targetType: InputType = "JSON",
): MapperState {
    const defaultContext: MapperContext = {
        globalVariables: [],
        lookupTables: [],
        functions: [],
        prologScript: null,
        epilogScript: null,
    }
    const defaultPrefs: MapperPreferences = {
        debugComment: false,
        overrideTargetValue: true,
        autoMap: false,
        autoMapOneToMany: false,
        autoMapIncludeSubNodes: false,
    }
    return {
        modelVersion: MAPPER_MODEL_VERSION,
        id: uuidv4(),
        sourceTreeNode: createNode("root", "element", { children: [] }),
        targetTreeNode: createNode("root", "element", { children: [] }),
        references: [],
        localContext: defaultContext,
        mapperPreferences: defaultPrefs,
        sourceInputType: sourceType,
        targetInputType: targetType,
    }
}

/**
 * Convert the existing simple TreeNode (from parsers.ts) to MapperTreeNode.
 * Maps: 'xml-element' → 'element', 'xml-attribute' → 'attribute',
 *       'object' → 'element', 'array' → 'array', 'primitive' → 'element'
 * New UUIDs are generated for all nodes.
 */
export function fromParserTreeNode(node: TreeNode): MapperTreeNode {
    const typeMap: Record<TreeNode["type"], MapperNodeType> = {
        "xml-element": "element",
        "xml-attribute": "attribute",
        object: "element",
        array: "array",
        primitive: "element",
    }
    const mapperNode: MapperTreeNode = {
        id: uuidv4(),
        name: node.key,
        type: typeMap[node.type] ?? "element",
    }
    if (node.children && node.children.length > 0) {
        mapperNode.children = node.children.map(fromParserTreeNode)
    }
    return mapperNode
}

// ============================================================
// Immutable tree operations
// ============================================================

/**
 * Deep-copy a node subtree with new UUIDs for all copied nodes.
 * Used for copy/paste operations.
 */
export function deepCopyNode(node: MapperTreeNode): MapperTreeNode {
    const copy: MapperTreeNode = { ...node, id: uuidv4() }
    if (node.children) {
        copy.children = node.children.map(deepCopyNode)
    }
    return copy
}

/**
 * Deep-copy preserving original UUIDs (for undo/redo serialization).
 */
export function cloneNode(node: MapperTreeNode): MapperTreeNode {
    const clone: MapperTreeNode = { ...node }
    if (node.children) {
        clone.children = node.children.map(cloneNode)
    }
    return clone
}

/**
 * Update a node's fields — returns new tree (immutable update).
 */
export function updateNode(
    tree: MapperTreeNode,
    nodeId: string,
    patch: Partial<MapperTreeNode>,
): MapperTreeNode {
    if (tree.id === nodeId) {
        return { ...tree, ...patch }
    }
    if (tree.children) {
        const newChildren = tree.children.map((child) => updateNode(child, nodeId, patch))
        return { ...tree, children: newChildren }
    }
    return tree
}

/**
 * Remove a node (and all descendants) from a tree — returns new tree.
 */
export function removeNode(tree: MapperTreeNode, nodeId: string): MapperTreeNode {
    if (!tree.children) return tree
    const newChildren = tree.children
        .filter((c) => c.id !== nodeId)
        .map((c) => removeNode(c, nodeId))
    return { ...tree, children: newChildren }
}

/**
 * Insert a child node under a parent — returns new tree (immutable).
 */
export function insertChild(
    tree: MapperTreeNode,
    parentId: string,
    child: MapperTreeNode,
): MapperTreeNode {
    if (tree.id === parentId) {
        return { ...tree, children: [...(tree.children ?? []), child] }
    }
    if (tree.children) {
        return {
            ...tree,
            children: tree.children.map((c) => insertChild(c, parentId, child)),
        }
    }
    return tree
}

/**
 * Move a node up among siblings — returns updated siblings array.
 */
export function moveNodeUp(siblings: MapperTreeNode[], nodeId: string): MapperTreeNode[] {
    const idx = siblings.findIndex((s) => s.id === nodeId)
    if (idx <= 0) return siblings
    const next = [...siblings]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    return next
}

/**
 * Move a node down among siblings — returns updated siblings array.
 */
export function moveNodeDown(siblings: MapperTreeNode[], nodeId: string): MapperTreeNode[] {
    const idx = siblings.findIndex((s) => s.id === nodeId)
    if (idx < 0 || idx >= siblings.length - 1) return siblings
    const next = [...siblings]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    return next
}

/**
 * Group selected nodes under a new parent node.
 * Finds the common parent, creates a new group node, moves selected nodes inside.
 * Returns the new tree with nodes grouped.
 */
export function groupNodes(
    tree: MapperTreeNode,
    nodeIds: string[],
    groupName: string,
    groupType: MapperNodeType,
): MapperTreeNode {
    function groupInParent(node: MapperTreeNode): MapperTreeNode {
        if (!node.children) return node
        const selectedChildren = node.children.filter((c) => nodeIds.includes(c.id))
        if (selectedChildren.length > 0) {
            const remaining = node.children.filter((c) => !nodeIds.includes(c.id))
            const groupNode: MapperTreeNode = {
                id: uuidv4(),
                name: groupName,
                type: groupType,
                children: selectedChildren,
            }
            return { ...node, children: [...remaining, groupNode] }
        }
        return { ...node, children: node.children.map(groupInParent) }
    }
    return groupInParent(tree)
}

// ============================================================
// Tree merging
// ============================================================

/**
 * Merge two trees with a given apply method.
 */
export function mergeTrees(
    existing: MapperTreeNode,
    incoming: MapperTreeNode,
    method: ApplyMethod,
): MapperTreeNode {
    switch (method) {
        case "REPLACE":
            return cloneNode(incoming)

        case "RESET":
            return cloneNode(incoming)

        case "ADD_ONLY": {
            // Add nodes from incoming that do not exist in existing (by name+type match at same level)
            return mergeAddOnly(existing, incoming)
        }

        case "DELETE_ONLY": {
            // Remove nodes from existing that are not in incoming
            return mergeDeleteOnly(existing, incoming)
        }

        case "MERGE": {
            // Add new nodes AND remove deleted nodes, keep unchanged
            const afterAdd = mergeAddOnly(existing, incoming)
            return mergeDeleteOnly(afterAdd, incoming)
        }
    }
    return cloneNode(existing)
}

function mergeAddOnly(existing: MapperTreeNode, incoming: MapperTreeNode): MapperTreeNode {
    if (!incoming.children || incoming.children.length === 0) return existing

    const existingNames = new Set((existing.children ?? []).map((c) => c.name))
    const toAdd = incoming.children.filter((c) => !existingNames.has(c.name))
    const toMerge = incoming.children.filter((c) => existingNames.has(c.name))

    let newChildren = [...(existing.children ?? [])]

    // Recursively merge matching children
    newChildren = newChildren.map((existChild) => {
        const matchIncoming = toMerge.find((c) => c.name === existChild.name)
        if (matchIncoming) return mergeAddOnly(existChild, matchIncoming)
        return existChild
    })

    // Append new nodes (cloned with new UUIDs)
    for (const node of toAdd) {
        newChildren.push(deepCopyNode(node))
    }

    return { ...existing, children: newChildren }
}

function mergeDeleteOnly(existing: MapperTreeNode, incoming: MapperTreeNode): MapperTreeNode {
    if (!existing.children || existing.children.length === 0) return existing

    const incomingNames = new Set((incoming.children ?? []).map((c) => c.name))
    const kept = existing.children.filter((c) => incomingNames.has(c.name))

    const merged = kept.map((existChild) => {
        const matchIncoming = (incoming.children ?? []).find((c) => c.name === existChild.name)
        if (matchIncoming) return mergeDeleteOnly(existChild, matchIncoming)
        return existChild
    })

    return { ...existing, children: merged }
}
