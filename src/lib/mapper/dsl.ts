import { v4 as uuidv4 } from "uuid"
import { getFullPath, traverseDown } from "./node-utils"
import { syncFlatReferences } from "./reference-utils"
import type {
    LoopReference,
    Mapping,
    MappingCondition,
    MappingTransform,
    MapperState,
    MapperTreeNode,
    SourceReference,
} from "./types"

// ============================================================
// Public types
// ============================================================

export interface DSLError {
    line: number
    message: string
}

export interface ParseResult {
    mappings: Array<Mapping>
    errors: Array<DSLError>
}

// ============================================================
// Regex patterns
// ============================================================

/**
 * Main line regex — extended to capture all new clauses.
 * Order matters: LOOP before UNDER, UNDER before WHERE, WHERE before THEN, THEN before LOOKUP, LOOKUP before AS, AS before IF.
 *
 * Groups: source, target, LOOP name, UNDER name, WHERE clause, THEN clause, LOOKUP table, AS type, IF condition
 */
const LINE_REGEX =
    /^\s*(.+?)\s*->\s*(.+?)(?:\s+LOOP\s+(\w+))?(?:\s+UNDER\s+(\w+))?(?:\s+WHERE\s+(.+?))?(?:\s+THEN\s+(.+?))?(?:\s+LOOKUP\s+(\w+))?(?:\s+AS\s+(LITERAL|EXPR))?(?:\s+IF\s+(.+?))?\s*$/i

/** WHERE clause condition: field operator value */
const CONDITION_REGEX = /^(.+?)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*(.+)$/

/** THEN clause transform: +/-/* / num% */
const TRANSFORM_REGEX = /^([+\-*/])(\d+(?:\.\d+)?)(%)?\s*$/

/** Loop source detection: "orders[*]" → sourcePath = "orders", isLoop = true */
const LOOP_SOURCE_REGEX = /^(.+)\[\*\]$/

/** Standalone node condition: "target.path IF expression" (no "->" present) */
const NODE_CONDITION_REGEX = /^(.+?)\s+IF\s+(.+)$/

// ============================================================
// parseDSL
// ============================================================

export function parseDSL(dslString: string): ParseResult {
    const mappings: Array<Mapping> = []
    const errors: Array<DSLError> = []
    const lines = dslString.split("\n")

    lines.forEach((line, index) => {
        const lineNum = index + 1
        const trimmed = line.trim()

        // Skip blank lines and comments
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return

        // Standalone node condition: "target.path IF expression" (no "->" in line)
        if (!trimmed.includes("->")) {
            const ncMatch = trimmed.match(NODE_CONDITION_REGEX)
            if (ncMatch) {
                mappings.push({
                    id: `dsl-${lineNum}`,
                    sourceId: "",
                    targetId: normalizePath(ncMatch[1].trim()),
                    nodeCondition: ncMatch[2].trim(),
                })
                return
            }
            errors.push({ line: lineNum, message: `Invalid syntax: "${trimmed}"` })
            return
        }

        const match = trimmed.match(LINE_REGEX)
        if (!match) {
            errors.push({ line: lineNum, message: `Invalid syntax: "${trimmed}"` })
            return
        }

        const [
            ,
            rawSource,
            rawTarget,
            loopName,
            underLoop,
            whereClause,
            thenClause,
            lookupTable,
            asType,
            ifCondition,
        ] = match

        // Detect loop declaration: source ends with [*]
        const loopMatch = rawSource.trim().match(LOOP_SOURCE_REGEX)
        const isLoopDeclaration = !!(loopName && loopMatch)
        const sourcePath = loopMatch ? loopMatch[1].trim() : rawSource.trim()

        const mapping: Mapping = {
            id: `dsl-${lineNum}`,
            sourceId: normalizePath(sourcePath),
            targetId: normalizePath(rawTarget.trim()),
            ...(isLoopDeclaration && { isLoopDeclaration }),
            ...(loopName && { loopName: loopName.trim() }),
            ...(underLoop && { underLoop: underLoop.trim() }),
            ...(lookupTable && { lookupTable: lookupTable.trim() }),
            ...(asType && { valueType: asType.toLowerCase() as "expr" | "literal" }),
            ...(ifCondition && { nodeCondition: ifCondition.trim() }),
        }

        if (whereClause) {
            const condition = parseCondition(whereClause.trim())
            if (condition) {
                mapping.condition = condition
            } else {
                errors.push({
                    line: lineNum,
                    message: `Invalid WHERE clause: "${whereClause.trim()}"`,
                })
                return
            }
        }

        if (thenClause) {
            const transform = parseTransform(thenClause.trim())
            if (transform) {
                mapping.transform = transform
            } else {
                errors.push({
                    line: lineNum,
                    message: `Invalid THEN clause: "${thenClause.trim()}"`,
                })
                return
            }
        }

        mappings.push(mapping)
    })

    return { mappings, errors }
}

// ============================================================
// generateDSL
// ============================================================

export function generateDSL(mappings: Array<Mapping>): string {
    return mappings
        .map((m) => {
            // Standalone node condition (no source)
            if (!m.sourceId && m.nodeCondition) {
                return `${stripRoot(m.targetId)} IF ${m.nodeCondition}`
            }

            // Build source expression
            let src: string
            if (m.isLoopDeclaration) {
                src = `${stripRoot(m.sourceId)}[*]`
            } else if (m.underLoop) {
                // Inside a loop: show as "_loopVar.fieldName"
                const fieldName = stripRoot(m.sourceId).split(".").pop() ?? stripRoot(m.sourceId)
                src = `${m.underLoop}.${fieldName}`
            } else {
                src = stripRoot(m.sourceId)
            }

            let line = `${src} -> ${stripRoot(m.targetId)}`

            if (m.isLoopDeclaration && m.loopName) line += ` LOOP ${m.loopName}`
            if (m.underLoop) line += ` UNDER ${m.underLoop}`
            if (m.condition) line += ` WHERE ${formatConditionClause(m.condition)}`
            if (m.transform) line += ` THEN ${formatTransform(m.transform)}`
            if (m.lookupTable) line += ` LOOKUP ${m.lookupTable}`
            if (m.valueType) line += ` AS ${m.valueType.toUpperCase()}`
            // Note: IF / nodeCondition on mapping lines (attached to a target) is not emitted here —
            // standalone node conditions are handled at the top of the map function.

            return line
        })
        .join("\n")
}

// ============================================================
// Bridge: mapperStateToDSL
// ============================================================

/**
 * Convert a full MapperState to a DSL string.
 * Called whenever the visual editor state changes.
 */
export function mapperStateToDSL(state: MapperState): string {
    const lines: string[] = []

    // Header comment with map name
    if (state.name) lines.push(`# ${state.name}`)

    // Global variables as comments
    for (const v of state.localContext.globalVariables) {
        lines.push(`# var: ${v.name} = ${v.value}`)
    }

    // Traverse target tree and emit DSL lines
    if (state.targetTreeNode) {
        emitDSLForNode(state.targetTreeNode, state, lines)
    }

    return lines.join("\n")
}

function emitDSLForNode(node: MapperTreeNode, state: MapperState, lines: string[]): void {
    if (!state.targetTreeNode) return

    const targetPath = getFullPath(node.id, state.targetTreeNode)

    // Standalone node condition
    if (node.nodeCondition?.condition) {
        lines.push(`${stripRoot(targetPath)} IF ${node.nodeCondition.condition}`)
    }

    // Loop declaration
    if (node.loopReference) {
        const lr = node.loopReference
        const sourcePath = state.sourceTreeNode
            ? getSourcePathFromTree(lr.sourceNodeId, state.sourceTreeNode)
            : lr.sourceNodeId
        const iteratorName = node.loopIterator ?? lr.variableName
        lines.push(`${stripRoot(sourcePath)}[*] -> ${stripRoot(targetPath)} LOOP ${iteratorName}`)
    }

    // Source references → DSL mapping lines
    if (node.sourceReferences) {
        for (const ref of node.sourceReferences) {
            const sourcePath =
                ref.customPath ??
                (state.sourceTreeNode
                    ? getSourcePathFromTree(ref.sourceNodeId, state.sourceTreeNode)
                    : ref.sourceNodeId)

            let line = `${stripRoot(sourcePath)} -> ${stripRoot(targetPath)}`

            // Determine UNDER clause
            if (ref.loopOverId) {
                const loopRef = findLoopReferenceById(ref.loopOverId, state)
                if (loopRef) line += ` UNDER ${loopRef.variableName}`
            }

            // Lookup table (stored on the ref's target node — check for attached lookup)
            // (lookup is recorded on the Mapping level in DSL, not on SourceReference directly —
            //  we emit it here if the ref has it stored as a custom extension)

            // Expression vs literal
            if (node.value && node.plainTextValue === false) {
                line += ` AS EXPR`
            }

            lines.push(line)
        }
    }

    // Static value (no source references — pure literal or expression)
    if (!node.sourceReferences?.length && node.value) {
        const valExpr = node.plainTextValue
            ? `"${node.value}" -> ${stripRoot(targetPath)} AS LITERAL`
            : `${node.value} -> ${stripRoot(targetPath)} AS EXPR`
        lines.push(valExpr)
    }

    // Recurse into children
    if (node.children) {
        for (const child of node.children) {
            emitDSLForNode(child, state, lines)
        }
    }
}

// ============================================================
// Bridge: applyDSLToState
// ============================================================

/**
 * Apply parsed DSL to update an existing MapperState.
 * Used when the user edits the DSL text panel.
 *
 * Returns a new state (immutable) or the original + errors if parsing fails.
 */
export function applyDSLToState(
    dsl: string,
    state: MapperState,
): { state: MapperState; errors: DSLError[] } {
    const { mappings, errors } = parseDSL(dsl)
    if (errors.length > 0) return { state, errors }

    // Clear all existing source references on the target tree
    let newState = clearAllSourceReferences(state)

    // Apply each DSL mapping line to the state
    for (const mapping of mappings) {
        if (mapping.isLoopDeclaration) {
            newState = applyLoopDeclaration(mapping, newState)
        } else if (!mapping.sourceId && mapping.nodeCondition) {
            newState = applyNodeCondition(mapping, newState)
        } else {
            newState = applySimpleMapping(mapping, newState)
        }
    }

    // Rebuild flat references
    return {
        state: { ...newState, references: syncFlatReferences(newState) },
        errors: [],
    }
}

// ============================================================
// applyDSLToState helpers
// ============================================================

function clearAllSourceReferences(state: MapperState): MapperState {
    if (!state.targetTreeNode) return state
    return {
        ...state,
        targetTreeNode: clearRefsOnNode(state.targetTreeNode),
    }
}

function clearRefsOnNode(node: MapperTreeNode): MapperTreeNode {
    const cleared: MapperTreeNode = {
        ...node,
        sourceReferences: [],
        loopReference: undefined,
        loopIterator: undefined,
        nodeCondition: undefined,
    }
    if (node.children) {
        cleared.children = node.children.map(clearRefsOnNode)
    }
    return cleared
}

function applyLoopDeclaration(mapping: Mapping, state: MapperState): MapperState {
    if (!state.targetTreeNode || !state.sourceTreeNode) return state

    const targetNode = findNodeByPath(mapping.targetId, state.targetTreeNode)
    const sourceNode = findNodeByPath(mapping.sourceId, state.sourceTreeNode)
    if (!targetNode || !sourceNode) return state

    const loopRef: LoopReference = {
        id: uuidv4(),
        sourceNodeId: sourceNode.id,
        variableName: mapping.loopName ?? `_loop`,
        textReference: false,
        isLoop: true,
    }

    const updatedTarget = updateNodeInTree(state.targetTreeNode, targetNode.id, {
        loopReference: loopRef,
        loopIterator: mapping.loopName ?? loopRef.variableName,
    })

    return { ...state, targetTreeNode: updatedTarget }
}

function applyNodeCondition(mapping: Mapping, state: MapperState): MapperState {
    if (!state.targetTreeNode || !mapping.nodeCondition) return state

    const targetNode = findNodeByPath(mapping.targetId, state.targetTreeNode)
    if (!targetNode) return state

    const updatedTarget = updateNodeInTree(state.targetTreeNode, targetNode.id, {
        nodeCondition: { condition: mapping.nodeCondition },
    })

    return { ...state, targetTreeNode: updatedTarget }
}

function applySimpleMapping(mapping: Mapping, state: MapperState): MapperState {
    if (!state.targetTreeNode || !mapping.sourceId) return state

    const targetNode = findNodeByPath(mapping.targetId, state.targetTreeNode)
    if (!targetNode) return state

    // Resolve source node (may not exist in tree for expression-style mappings)
    const sourceNode = state.sourceTreeNode
        ? findNodeByPath(mapping.sourceId, state.sourceTreeNode)
        : null

    // Find the loop reference if UNDER is specified
    let loopOverId: string | undefined
    if (mapping.underLoop) {
        const loopRef = findLoopReferenceByName(mapping.underLoop, state)
        if (loopRef) loopOverId = loopRef.id
    }

    const newRef: SourceReference = {
        id: uuidv4(),
        sourceNodeId: sourceNode?.id ?? mapping.sourceId,
        variableName: mapping.underLoop ? `_${targetNode.name}` : `_${sourceNode?.name ?? "ref"}`,
        textReference: mapping.valueType !== "expr",
        ...(loopOverId && { loopOverId }),
        ...(mapping.lookupTable && { customPath: `${mapping.lookupTable}[${mapping.sourceId}]` }),
    }

    const existingRefs = targetNode.sourceReferences ?? []
    const updatedTarget = updateNodeInTree(state.targetTreeNode, targetNode.id, {
        sourceReferences: [...existingRefs, newRef],
        ...(mapping.valueType === "expr" && { plainTextValue: false }),
        ...(mapping.valueType === "literal" && { plainTextValue: true }),
    })

    return { ...state, targetTreeNode: updatedTarget }
}

// ============================================================
// Internal utilities
// ============================================================

/**
 * Find a loop reference by its variable name anywhere in the target tree.
 */
function findLoopReferenceByName(varName: string, state: MapperState): LoopReference | null {
    if (!state.targetTreeNode) return null
    let found: LoopReference | null = null
    traverseDown(state.targetTreeNode, (node) => {
        if (node.loopReference && node.loopReference.variableName === varName) {
            found = node.loopReference
        }
    })
    return found
}

/**
 * Find a loop reference by its ID anywhere in the target tree.
 */
export function findLoopReferenceById(loopRefId: string, state: MapperState): LoopReference | null {
    if (!state.targetTreeNode) return null
    let found: LoopReference | null = null
    traverseDown(state.targetTreeNode, (node) => {
        if (node.loopReference && node.loopReference.id === loopRefId) {
            found = node.loopReference
        }
    })
    return found
}

/**
 * Get the full dot-path of a source node by its ID in the source tree.
 * Falls back to the node ID if not found.
 */
function getSourcePathFromTree(sourceNodeId: string, sourceTree: MapperTreeNode): string {
    const path = getFullPath(sourceNodeId, sourceTree)
    return path || sourceNodeId
}

/**
 * Find a MapperTreeNode by a normalized dot path (e.g. "root.orders.id").
 * Matches by traversing the tree and comparing full paths.
 */
function findNodeByPath(normalizedPath: string, tree: MapperTreeNode): MapperTreeNode | null {
    let found: MapperTreeNode | null = null
    traverseDown(tree, (node) => {
        if (found) return
        const nodePath = getFullPath(node.id, tree)
        if (nodePath === normalizedPath || `root.${nodePath}` === normalizedPath) {
            found = node
        }
    })
    return found
}

/**
 * Return a new tree with the given node updated (immutable patch).
 */
function updateNodeInTree(
    tree: MapperTreeNode,
    nodeId: string,
    patch: Partial<MapperTreeNode>,
): MapperTreeNode {
    if (tree.id === nodeId) return { ...tree, ...patch }
    if (tree.children) {
        return {
            ...tree,
            children: tree.children.map((c) => updateNodeInTree(c, nodeId, patch)),
        }
    }
    return tree
}

// ============================================================
// Condition / transform parsing helpers (unchanged from original)
// ============================================================

function parseCondition(clause: string): MappingCondition | null {
    const match = clause.match(CONDITION_REGEX)
    if (!match) return null

    const [, field, operator, rawValue] = match
    let value = rawValue.trim()

    // Strip surrounding quotes from string values
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
    }

    return {
        field: normalizePath(field.trim()),
        operator: operator as MappingCondition["operator"],
        value,
    }
}

function parseTransform(clause: string): MappingTransform | null {
    const match = clause.match(TRANSFORM_REGEX)
    if (!match) return null

    const [, op, numStr, percent] = match
    const value = parseFloat(numStr)

    if (percent) {
        if (op === "+") return { type: "add_percent", value }
        if (op === "-") return { type: "subtract_percent", value }
        return null
    }

    switch (op) {
        case "+":
            return { type: "add", value }
        case "-":
            return { type: "subtract", value }
        case "*":
            return { type: "multiply", value }
        case "/":
            return { type: "divide", value }
        default:
            return null
    }
}

// ============================================================
// Formatting helpers
// ============================================================

function stripRoot(path: string): string {
    return path.replace(/^root\.?/, "")
}

function normalizePath(path: string): string {
    const trimmed = path.trim()
    if (!trimmed.startsWith("root")) {
        return `root.${trimmed}`
    }
    return trimmed
}

function formatConditionClause(condition: MappingCondition): string {
    return `${stripRoot(condition.field)} ${condition.operator} ${formatConditionValue(condition)}`
}

function formatConditionValue(condition: MappingCondition): string {
    const num = Number(condition.value)
    if (!isNaN(num) && condition.value.trim() !== "") {
        return condition.value
    }
    return `"${condition.value}"`
}

export function formatTransform(transform: MappingTransform): string {
    switch (transform.type) {
        case "add":
            return `+${transform.value}`
        case "subtract":
            return `-${transform.value}`
        case "multiply":
            return `*${transform.value}`
        case "divide":
            return `/${transform.value}`
        case "add_percent":
            return `+${transform.value}%`
        case "subtract_percent":
            return `-${transform.value}%`
    }
}
