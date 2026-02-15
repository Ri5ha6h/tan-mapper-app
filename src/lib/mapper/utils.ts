import type { TreeNode } from "./types"

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
