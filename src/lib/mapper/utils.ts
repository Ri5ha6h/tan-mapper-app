import type { NodeType, TreeNode } from "./types"

export function collectNodeIds(node: TreeNode | null): Array<string> {
    if (!node) return []
    const ids = [node.id]
    if (node.children) {
        for (const child of node.children) {
            ids.push(...collectNodeIds(child))
        }
    }
    return ids
}

export function createNewTreeNode(
    parentId: string,
    key: string,
    type: "primitive" | "array" | "object",
    depth: number,
): TreeNode {
    const id = parentId ? `${parentId}.${key}` : key
    const node: TreeNode = { id, key, type, depth }

    if (type === "object" || type === "array") {
        node.children = []
    } else {
        node.value = ""
        node.rawValue = ""
    }

    return node
}

export function findParentNode(tree: TreeNode, targetId: string): TreeNode | null {
    if (tree.children) {
        for (const child of tree.children) {
            if (child.id === targetId) return tree
            const found = findParentNode(child, targetId)
            if (found) return found
        }
    }
    return null
}

export function insertNodeInTree(
    tree: TreeNode,
    siblingId: string,
    position: "above" | "below" | "inside",
    newNode: TreeNode,
): TreeNode | null {
    if (position === "inside") {
        if (tree.id === siblingId) {
            return {
                ...tree,
                children: [...(tree.children ?? []), newNode],
            }
        }
        if (!tree.children) return null
        for (let i = 0; i < tree.children.length; i++) {
            const result = insertNodeInTree(tree.children[i], siblingId, position, newNode)
            if (result) {
                const newChildren = [...tree.children]
                newChildren[i] = result
                return { ...tree, children: newChildren }
            }
        }
        return null
    }

    // above / below — find parent that contains siblingId
    if (!tree.children) return null

    const idx = tree.children.findIndex((c) => c.id === siblingId)
    if (idx !== -1) {
        const newChildren = [...tree.children]
        const insertIdx = position === "above" ? idx : idx + 1
        newChildren.splice(insertIdx, 0, newNode)
        return { ...tree, children: newChildren }
    }

    for (let i = 0; i < tree.children.length; i++) {
        const result = insertNodeInTree(tree.children[i], siblingId, position, newNode)
        if (result) {
            const newChildren = [...tree.children]
            newChildren[i] = result
            return { ...tree, children: newChildren }
        }
    }

    return null
}

export function getNodeTypes(): Array<{ label: string; value: NodeType; icon: string }> {
    return [
        { label: "Normal", value: "primitive", icon: "FileText" },
        { label: "Array", value: "array", icon: "List" },
        { label: "Object", value: "object", icon: "Folder" },
    ]
}
