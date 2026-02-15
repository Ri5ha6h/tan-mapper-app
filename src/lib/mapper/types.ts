export interface TreeNode {
    id: string // path-based: "root.user.name"
    key: string // display: "name"
    value?: string // leaf value (primitives only)
    type: "object" | "array" | "primitive" | "xml-element" | "xml-attribute"
    children?: Array<TreeNode>
    depth: number
}

export interface Mapping {
    id: string
    sourceId: string // TreeNode.id from source
    targetId: string // TreeNode.id from target
}

export interface FileData {
    name: string
    type: "json" | "xml"
    tree: TreeNode | null
}

export type DragData = {
    nodeId: string
    side: "source" | "target"
}

// Utility types
export type NodeType = TreeNode["type"]
export type FileType = FileData["type"]
