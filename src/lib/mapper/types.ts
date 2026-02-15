export interface TreeNode {
    id: string // path-based: "root.user.name"
    key: string // display: "name"
    value?: string // leaf value (primitives only)
    rawValue?: unknown // original typed value (preserves number/boolean/null)
    type: "object" | "array" | "primitive" | "xml-element" | "xml-attribute"
    children?: Array<TreeNode>
    depth: number
}

export type ConditionOperator =
    | "=="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "contains"
    | "startsWith"
    | "endsWith"

export interface MappingCondition {
    field: string
    operator: ConditionOperator
    value: string
}

export type TransformType =
    | "add"
    | "subtract"
    | "multiply"
    | "divide"
    | "add_percent"
    | "subtract_percent"

export interface MappingTransform {
    type: TransformType
    value: number
}

export interface Mapping {
    id: string
    sourceId: string // TreeNode.id from source
    targetId: string // TreeNode.id from target
    condition?: MappingCondition
    transform?: MappingTransform
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
