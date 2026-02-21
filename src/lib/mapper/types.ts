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
    sourceId: string // TreeNode.id from source (empty string for node-condition-only lines)
    targetId: string // TreeNode.id from target

    // Original clauses
    condition?: MappingCondition
    transform?: MappingTransform

    // Phase 2 — DSL Extension fields
    valueType?: "expr" | "literal" // AS EXPR / AS LITERAL
    loopName?: string // LOOP _orders — iterator var (loop declarations only)
    underLoop?: string // UNDER _orders — which loop this mapping is nested in
    lookupTable?: string // LOOKUP tableName
    nodeCondition?: string // IF condition expression (standalone node guard)
    isLoopDeclaration?: boolean // true when line is "arr[*] -> target LOOP name"
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

// ============================================================
// Phase 1 — MapperState Type System
// ============================================================

// Mapper-specific node type (maps 1:1 to Java class hierarchy)
// Distinct from the existing TreeNode.type used by parsers
export type MapperNodeType =
    | "element" // TreeNode — default XML element / JSON property
    | "code" // CodeNode — raw JS expression block (injected verbatim)
    | "attribute" // AttributeNode — XML @attribute (path: "@name")
    | "array" // ArrayNode — JSON array [ ]
    | "arrayChild" // ArrayChildNode — item inside an array (path fragment: null)

export interface SourceReference {
    id: string // UUID for this reference object
    sourceNodeId: string // UUID of the MapperTreeNode in the source tree
    variableName: string // e.g. "var0", "_orderId", "_orders"
    textReference: boolean // true = treat as text; false = treat as expression
    customPath?: string // Override the auto-generated source path expression
    loopOverId?: string // ID of the LoopReference this ref is nested under
}

// LoopReference extends SourceReference — marks this ref as an array iterator
export interface LoopReference extends SourceReference {
    isLoop: true
}

export interface LoopCondition {
    id: string
    sourceNodePath: string // Path to the source field to check
    condition: string // JS expression (e.g. "== 'ACTIVE'", "> 100")
    textReference: boolean
}

export interface NodeCondition {
    condition: string // JS boolean expression; node skipped if false
}

export interface MapperTreeNode {
    id: string // UUID — stable across serialize/deserialize
    name: string // Node name (e.g. "order", "id", "[]")
    type: MapperNodeType

    // Display / documentation fields
    label?: string // Human-readable label (overrides name in display)
    comment?: string // Mapping rule description / notes
    format?: string // Format pattern (e.g. "yyyy-MM-dd", "###.##")
    errorMessage?: string // Custom validation error message

    // Behavior flags
    nonEmpty?: boolean // Required / non-empty validation
    debugComment?: boolean // Include debug comments in generated code
    quote?: boolean // Auto-quote value in expression output
    logBid?: boolean // Log business ID flag (legacy)

    // Value
    value?: string // Static value or expression string
    plainTextValue?: boolean // true = value is a literal string; false = expression
    customCode?: string // Custom JS code block shown in the collapsible code editor in Value tab
    sampleValue?: string // Display-only: leaf value from the parsed source file (not used in script generation)

    // Source references (TARGET TREE ONLY — empty/absent on source nodes)
    sourceReferences?: SourceReference[]

    // Loop configuration (TARGET TREE ONLY)
    loopReference?: LoopReference // Which source array to iterate over
    loopIterator?: string // Iterator variable name (e.g. "_orders")
    loopConditions?: LoopCondition[] // Filter conditions inside the loop
    loopConditionsConnective?: "AND" | "OR" // How conditions combine
    loopStatement?: string // Custom loop expression (advanced override)

    // Node-level condition (TARGET TREE ONLY)
    nodeCondition?: NodeCondition

    // Tree structure
    children?: MapperTreeNode[]
}

export interface GlobalVariable {
    id: string
    name: string // Valid JS identifier
    value: string // Value or expression
    plainTextValue: boolean
    isFinal?: boolean // Declare as const
}

export interface LookupEntry {
    id: string
    key: string
    value: string
    plainTextValue: boolean
}

export interface LookupTable {
    id: string
    name: string // Valid JS identifier (used as variable name)
    entries: LookupEntry[]
}

export interface TransformFunction {
    id: string
    name: string // Function name (auto-extracted from body if blank)
    body: string // Full JS function definition
}

// The execution context — equivalent of GroovyContext
export interface MapperContext {
    globalVariables: GlobalVariable[]
    lookupTables: LookupTable[]
    functions: TransformFunction[]
    prologScript?: string | null // JS code run before main mapping
    epilogScript?: string | null // JS code run after main mapping
}

export interface MapperPreferences {
    debugComment: boolean // default: false
    overrideTargetValue: boolean // default: true
    autoMap: boolean // default: false
    autoMapOneToMany: boolean // default: false
    autoMapIncludeSubNodes: boolean // default: false
}

export type InputType = "JSON" | "XML" | "CSV" | "UNKNOWN"

// Denormalized view of a SourceReference with both node IDs resolved
// state.references[] is always rebuilt from the target tree (syncFlatReferences)
export interface FlatReference {
    id: string // = SourceReference.id
    sourceNodeId: string // UUID of source node
    targetNodeId: string // UUID of target node
    variableName: string
    textReference: boolean
    customPath?: string
    loopOverId?: string
    isLoop?: boolean // true if this is a LoopReference
}

export type ApplyMethod = "REPLACE" | "MERGE" | "ADD_ONLY" | "DELETE_ONLY" | "RESET"

export const MAPPER_MODEL_VERSION = 1

export interface MapperState {
    modelVersion: number // Always = MAPPER_MODEL_VERSION when created new
    id: string // UUID

    name?: string // User-given name (e.g. "Order XML to JSON")

    sourceTreeNode: MapperTreeNode | null
    targetTreeNode: MapperTreeNode | null

    // Flat list of all references — denormalized from target tree
    references: FlatReference[]

    localContext: MapperContext
    mapperPreferences: MapperPreferences

    sourceInputType: InputType
    targetInputType: InputType

    // Raw text of the uploaded source file — used to pre-populate the Execute dialog input
    sourceOriginalContent?: string | null
}
