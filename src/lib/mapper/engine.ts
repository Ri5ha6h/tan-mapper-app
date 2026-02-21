import { XMLBuilder, XMLParser } from "fast-xml-parser"
import { getGroovyShimParamNames, getGroovyShimParamValues } from "./groovy-shims"
import { findNodeById, getFullPath, traverseDown } from "./node-utils"
import type {
    LoopCondition,
    LoopReference,
    MapperContext,
    MapperState,
    MapperTreeNode,
    Mapping,
    MappingCondition,
    MappingTransform,
    SourceReference,
    TreeNode,
} from "./types"

export interface EngineError {
    line?: number
    message: string
}

// ============================================================
// Phase 6 — New types
// ============================================================

export interface ScriptExecutionResult {
    output: string // Transformed output string
    error: string | null // Error message if execution failed
    scriptBody: string // The generated script (for debug display)
    durationMs: number // Execution time
    logs: string[] // Captured console.log/warn/error messages
}

export type TemplateType = "json_to_json" | "json_to_xml" | "xml_to_json" | "xml_to_xml"

// ============================================================
// Legacy engine helpers (unchanged)
// ============================================================

function getValueAtPath(data: unknown, path: string): unknown {
    if (path === "root") return data

    const parts = path
        .replace(/^root\.?/, "")
        .split(/\.|\[|\]/)
        .filter(Boolean)
    let current: unknown = data

    for (const part of parts) {
        if (current === null || current === undefined) return undefined
        if (typeof current !== "object") return undefined

        const key = part.replace(/\]$/, "")
        current = (current as Record<string, unknown>)[key]
    }

    return current
}

function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path
        .replace(/^root\.?/, "")
        .split(/\.|\[|\]/)
        .filter(Boolean)
    let current: Record<string, unknown> = obj

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].replace(/\]$/, "")
        const nextPart = parts[i + 1].replace(/\]$/, "")

        if (!(part in current)) {
            const isNextArrayIndex = /^\d+$/.test(nextPart)
            current[part] = isNextArrayIndex ? [] : {}
        }
        current = current[part] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1].replace(/\]$/, "")
    current[lastPart] = value
}

function buildTargetTemplate(node: TreeNode | null): unknown {
    if (!node) return {}

    if (node.type === "primitive" || node.type === "xml-attribute") {
        return node.rawValue ?? node.value ?? ""
    }

    if (node.type === "array") {
        return node.children?.map((child) => buildTargetTemplate(child)) ?? []
    }

    const result: Record<string, unknown> = {}

    if (node.value !== undefined && node.type === "xml-element") {
        result["#text"] = node.value
    }

    node.children?.forEach((child) => {
        const childResult = buildTargetTemplate(child) as Record<string, unknown>
        if (child.type === "xml-attribute") {
            Object.assign(result, childResult)
        } else if (child.type === "array") {
            result[child.key] = childResult
        } else {
            result[child.key] = childResult
        }
    })

    return result
}

export function evaluateCondition(sourceData: unknown, condition: MappingCondition): boolean {
    const fieldValue = getValueAtPath(sourceData, condition.field)
    if (fieldValue === undefined || fieldValue === null) return false

    const condValue = condition.value
    const fieldStr = String(fieldValue)

    switch (condition.operator) {
        case "==":
            return fieldStr === condValue
        case "!=":
            return fieldStr !== condValue
        case ">":
            return Number(fieldValue) > Number(condValue)
        case "<":
            return Number(fieldValue) < Number(condValue)
        case ">=":
            return Number(fieldValue) >= Number(condValue)
        case "<=":
            return Number(fieldValue) <= Number(condValue)
        case "contains":
            return fieldStr.includes(condValue)
        case "startsWith":
            return fieldStr.startsWith(condValue)
        case "endsWith":
            return fieldStr.endsWith(condValue)
        default:
            return false
    }
}

export function applyTransform(value: unknown, transform: MappingTransform): unknown {
    const num = Number(value)
    if (isNaN(num)) return value

    switch (transform.type) {
        case "add":
            return num + transform.value
        case "subtract":
            return num - transform.value
        case "multiply":
            return num * transform.value
        case "divide":
            return transform.value !== 0 ? num / transform.value : num
        case "add_percent":
            return num * (1 + transform.value / 100)
        case "subtract_percent":
            return num * (1 - transform.value / 100)
    }
}

export function applyMappings(
    sourceData: unknown,
    mappings: Array<Mapping>,
    targetTemplate: Record<string, unknown>,
): { result: unknown; errors: Array<EngineError> } {
    const errors: Array<EngineError> = []
    const result = JSON.parse(JSON.stringify(targetTemplate))

    for (const mapping of mappings) {
        const sourcePath = mapping.sourceId.replace(/^root\.?/, "root.")
        const targetPath = mapping.targetId.replace(/^root\.?/, "root.")

        if (mapping.condition) {
            if (!evaluateCondition(sourceData, mapping.condition)) continue
        }

        const sourceValue = getValueAtPath(sourceData, sourcePath)

        if (sourceValue === undefined) {
            errors.push({
                message: `Source path "${sourcePath}" not found`,
            })
            continue
        }

        const finalValue = mapping.transform
            ? applyTransform(sourceValue, mapping.transform)
            : sourceValue

        setValueAtPath(result, targetPath, finalValue)
    }

    return { result, errors }
}

export function generateJSONOutput(data: unknown): string {
    return JSON.stringify(data, null, 2)
}

export function generateXMLOutput(data: unknown): string {
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
        format: true,
        indentBy: "  ",
    })

    return builder.build(data)
}

export function treeToData(tree: TreeNode | null): unknown {
    if (!tree) return null
    return buildTargetTemplate(tree)
}

export function parseInput(content: string, type: "json" | "xml"): unknown {
    if (type === "json") {
        return JSON.parse(content)
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
    })

    return parser.parse(content)
}

// ============================================================
// Phase 6 — XML input parsing (internal helper for executeScript)
// ============================================================

function parseXMLInput(xmlString: string): unknown {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
        isArray: () => false,
    })
    return parser.parse(xmlString)
}

// ============================================================
// Phase 6 — Path encoding helpers
// ============================================================

/**
 * Returns true for path segments that represent an array-child placeholder.
 * Covers the canonical "[]" marker as well as the concrete indexed forms
 * "[0]", "[1]", … that the JSON parser may have preserved when the tree
 * was not yet normalised through fromParserTreeNode.
 */
function isArrayChildSegment(segment: string): boolean {
    return segment === "[]" || /^\[\d+\]$/.test(segment)
}

/**
 * Convert a node path fragment (from getFullPath) to a valid JS accessor.
 * - Strips the leading "root" segment (the tree root node name)
 * - "[]" and "[N]" parts are stripped (arrayChild does not add a property key)
 * - Attribute nodes produce "@name" — encoded as ["@name"]
 * - Regular names become .name
 */
function encodePath(rawPath: string): string {
    if (!rawPath) return ""
    const parts = rawPath.split(".").filter((p) => p !== "" && !isArrayChildSegment(p))

    // Strip the leading "root" segment — it is the synthetic root node name,
    // not a real property in the data.
    if (parts[0] === "root") parts.shift()

    return parts
        .map((p) => {
            if (p.startsWith("@")) return `["${p}"]`
            if (/[^a-zA-Z0-9_$]/.test(p)) return `["${p}"]`
            return `.${p}`
        })
        .join("")
        .replace(/^\./, "") // strip leading dot
}

/**
 * Build a JS data access path from sourceData or a loop iterator variable.
 *
 * Rules:
 * - If ref has a customPath: use it verbatim
 * - If activeLoopRef is provided AND ref.loopOverId === activeLoopRef.id:
 *     strip the loop source prefix → use iterVar.field
 * - Otherwise: sourceData.path.to.field
 */
function buildSourceAccessPath(
    ref: SourceReference | LoopReference,
    sourceTree: MapperTreeNode,
    activeLoopRef: LoopReference | null,
    iterVar?: string,
): string {
    if (ref.customPath) return ref.customPath

    const sourceNode = findNodeById(ref.sourceNodeId, sourceTree)
    if (!sourceNode) return "undefined"

    const fullPath = getFullPath(ref.sourceNodeId, sourceTree) // e.g. "orders.[].id"

    if (activeLoopRef && ref.loopOverId === activeLoopRef.id && iterVar) {
        // Path of the loop source node (e.g. "orders.[]")
        const loopSourcePath = getFullPath(activeLoopRef.sourceNodeId, sourceTree)

        // Strip the loop prefix (and any trailing ".") to get the relative sub-path
        let relativePath = fullPath
        if (fullPath.startsWith(loopSourcePath)) {
            relativePath = fullPath.slice(loopSourcePath.length).replace(/^\./, "")
        }

        // Remove the arrayChild marker at the start if present.
        // Covers the canonical "[]" form as well as concrete "[0]", "[1]" etc.
        relativePath = relativePath.replace(/^\[\d*\]\.?/, "")

        if (!relativePath) return iterVar
        const encoded = encodePath(relativePath)
        return encoded.startsWith("[") ? `${iterVar}${encoded}` : `${iterVar}.${encoded}`
    }

    // Absolute path from sourceData
    const encoded = encodePath(fullPath)
    if (!encoded) return "sourceData"
    return encoded.startsWith("[") ? `sourceData${encoded}` : `sourceData.${encoded}`
}

/**
 * Build a JS path for a loop source expression (the iterable array).
 * For loop declarations the sourceNodeId points to an arrayChild node —
 * we want its PARENT (the actual array), not the child.
 */
function buildLoopSourcePath(loopRef: LoopReference, sourceTree: MapperTreeNode): string {
    if (loopRef.customPath) return loopRef.customPath

    const node = findNodeById(loopRef.sourceNodeId, sourceTree)
    if (!node) return "undefined"

    const fullPath = getFullPath(loopRef.sourceNodeId, sourceTree)

    // If the loopRef points to an arrayChild ("[]"), use the parent array path
    if (node.type === "arrayChild") {
        // Remove the trailing ".[]" to get the parent array path
        const parentPath = fullPath.replace(/\.\[\]$/, "").replace(/\[\]$/, "")
        if (!parentPath) return "sourceData"
        const encoded = encodePath(parentPath)
        return encoded.startsWith("[") ? `sourceData${encoded}` : `sourceData.${encoded}`
    }

    const encoded = encodePath(fullPath)
    if (!encoded) return "sourceData"
    return encoded.startsWith("[") ? `sourceData${encoded}` : `sourceData.${encoded}`
}

/**
 * Build a loop condition path expression.
 * Path relative to loop iterator — like buildSourceAccessPath but always relative.
 */
function buildLoopConditionPath(
    lc: LoopCondition,
    iterVar: string,
    sourceTree: MapperTreeNode,
    loopRef: LoopReference,
): string {
    const loopSourcePath = getFullPath(loopRef.sourceNodeId, sourceTree)

    // lc.sourceNodePath is the full path string (dot-separated)
    let relativePath = lc.sourceNodePath
    if (relativePath.startsWith(loopSourcePath)) {
        relativePath = relativePath.slice(loopSourcePath.length).replace(/^\./, "")
    }
    relativePath = relativePath.replace(/^\[\]\.?/, "")

    if (!relativePath) return iterVar
    const encoded = encodePath(relativePath)
    return encoded.startsWith("[") ? `${iterVar}${encoded}` : `${iterVar}.${encoded}`
}

// ============================================================
// Phase 6 — Value expression builder
// ============================================================

/**
 * Construct the JS right-hand side expression for a target node assignment.
 *
 * Priority:
 *  1. node.value string present
 *     - plainTextValue=true  → JSON.stringify-quoted literal
 *     - plainTextValue=false → raw JS expression (variable name or expression)
 *  2. node.sourceReferences present
 *     - single ref → ref.variableName
 *     - multiple refs → template literal `${var1}${var2}...`
 *  3. None → null (skip output line)
 */
function buildValueExpression(node: MapperTreeNode): string | null {
    if (node.value) {
        return node.plainTextValue
            ? JSON.stringify(node.value) // wrap in quotes
            : node.value // raw JS expression
    }

    const refs = node.sourceReferences ?? []
    if (refs.length === 0) return null
    if (refs.length === 1) {
        return refs[0].variableName
    }

    // Multiple refs → template literal
    const parts = refs.map((r) => `\${${r.variableName}}`).join("")
    return `\`${parts}\``
}

// ============================================================
// Phase 6 — Output path builder
// ============================================================

/**
 * Collect the ancestor chain from tree root to the target node (inclusive),
 * excluding the root itself. Used by buildOutputPath.
 */
function getAncestorChain(nodeId: string, tree: MapperTreeNode): Array<MapperTreeNode> {
    const chain: Array<MapperTreeNode> = []

    function walk(current: MapperTreeNode): boolean {
        if (current.id === nodeId) {
            chain.push(current)
            return true
        }
        if (current.children) {
            for (const child of current.children) {
                if (walk(child)) {
                    if (current.id !== tree.id) chain.unshift(current)
                    return true
                }
            }
        }
        return false
    }

    walk(tree)
    return chain
}

/**
 * Build the JS left-hand-side output path for a target node.
 *
 * For array nodes that have a loopReference, items are pushed to the array —
 * so children inside the loop use: output.arr[output.arr.length - 1].field
 *
 * Strategy: walk the ancestor chain; when we encounter an array node with a
 * loopReference, the next accessor after the array name uses [arr.length - 1].
 */
function buildOutputPath(
    node: MapperTreeNode,
    outputVar: string,
    targetTree: MapperTreeNode,
    arrayTempVars?: Map<string, string>,
): string {
    // Get the ancestor chain from root's children down to (and including) this node.
    // The root node itself is excluded — we start from its children.
    const chain = getAncestorChain(node.id, targetTree)

    if (chain.length === 0) return outputVar

    let accessor = outputVar
    let prevWasLoopArray = false
    let prevLoopArrayId: string | null = null

    for (const ancestor of chain) {
        // arrayChild nodes are transparent — they don't add a named property.
        // Also treat nodes with names like "[0]", "[1]" as arrayChild equivalents
        // (safety net for trees that were not normalised through fromParserTreeNode).
        const isArrayChildLike = ancestor.type === "arrayChild" || /^\[\d*\]$/.test(ancestor.name)
        if (isArrayChildLike) {
            if (prevWasLoopArray) {
                // If a temp variable exists for this array (build-then-push mode),
                // use the temp var instead of arr[arr.length - 1]
                const tempVar = prevLoopArrayId ? arrayTempVars?.get(prevLoopArrayId) : undefined
                if (tempVar) {
                    accessor = tempVar
                } else {
                    // Fallback: original arr[arr.length - 1] pattern
                    accessor = `${accessor}[${accessor}.length - 1]`
                }
                prevWasLoopArray = false
                prevLoopArrayId = null
            }
            continue
        }

        // Regular named node — append name
        if (ancestor.name.startsWith("@")) {
            accessor = `${accessor}["${ancestor.name}"]`
        } else {
            accessor = `${accessor}.${ancestor.name}`
        }

        // If this is an array with a loop reference, mark so the next arrayChild
        // (or direct child for items without an explicit arrayChild) gets indexed
        prevWasLoopArray = ancestor.type === "array" && !!ancestor.loopReference
        if (prevWasLoopArray) {
            prevLoopArrayId = ancestor.id
        }
    }

    return accessor
}

// ============================================================
// Phase 6 — Section generators
// ============================================================

function generateGlobalVariables(context: MapperContext): string {
    if (!context.globalVariables.length) return ""

    const lines = context.globalVariables.map((v) => {
        const val = v.plainTextValue ? JSON.stringify(v.value) : v.value
        return `const ${v.name} = ${val}`
    })
    return lines.join("\n")
}

function generateLookupTables(context: MapperContext): string {
    if (!context.lookupTables.length) return ""

    const lines = context.lookupTables.map((table) => {
        const entries = table.entries
            .map((e) => {
                const val = e.plainTextValue ? JSON.stringify(e.value) : e.value
                return `  ${JSON.stringify(e.key)}: ${val}`
            })
            .join(",\n")
        return `const ${table.name} = {\n${entries}\n}`
    })
    return lines.join("\n\n")
}

function generateFunctions(context: MapperContext): string {
    if (!context.functions.length) return ""
    return context.functions.map((f) => f.body.trim()).join("\n\n")
}

/**
 * Collect all source references that are NOT inside any loop scope
 * (i.e., loopOverId is falsy) and declare them at top level.
 */
function generateSourceRefVariables(state: MapperState): string {
    if (!state.sourceTreeNode || !state.targetTreeNode) return ""

    const seen = new Set<string>()
    const lines: Array<string> = []

    traverseDown(state.targetTreeNode, (node) => {
        for (const ref of node.sourceReferences ?? []) {
            if (!ref.loopOverId && !seen.has(ref.id)) {
                seen.add(ref.id)
                const path = buildSourceAccessPath(ref, state.sourceTreeNode!, null)
                lines.push(`const ${ref.variableName} = ${path}`)
            }
        }
    })

    return lines.join("\n")
}

// ============================================================
// Phase 6 — Core recursive output generator
// ============================================================

/**
 * Recursively collect all refs in the subtree whose loopOverId matches the given loop id.
 * Used to declare all loop-scoped variables at the top of a for-loop body.
 */
function collectLoopScopedRefs(node: MapperTreeNode, loopId: string): Array<SourceReference> {
    const refs: Array<SourceReference> = []
    const seen = new Set<string>()

    function collect(n: MapperTreeNode): void {
        for (const ref of n.sourceReferences ?? []) {
            if (ref.loopOverId === loopId && !seen.has(ref.id)) {
                seen.add(ref.id)
                refs.push(ref)
            }
        }
        for (const child of n.children ?? []) {
            collect(child)
        }
    }

    collect(node)
    return refs
}

/**
 * Recursively generate JS code for a target node and all its children.
 * This is the TypeScript equivalent of MapperWriter.writeTargetNode().
 */
function generateTargetNode(
    node: MapperTreeNode,
    state: MapperState,
    outputVar: string,
    indentLevel: number,
    activeLoopRef: LoopReference | null,
    activeIterVar: string | null,
    arrayTempVars?: Map<string, string>,
): string {
    const lines: Array<string> = []
    let indent = "  ".repeat(indentLevel)

    // 1. Code nodes — inject verbatim
    if (node.type === "code") {
        if (node.value) lines.push(indent + node.value)
        return lines.filter(Boolean).join("\n")
    }

    // 2. Node condition (outer if)
    const condition = node.nodeCondition
    const hasNodeCondition = condition && condition.condition && condition.condition.trim() !== ""
    if (hasNodeCondition) {
        lines.push(`${indent}if (${condition.condition}) {`)
        indentLevel++
        indent = "  ".repeat(indentLevel)
    }

    // 3. Loop reference
    const loopRef = node.loopReference
    // Hoisted so section 5b can access them after the if(loopRef) block closes
    let arrayTempVar: string | null = null
    let arrayArrPath: string | null = null
    if (loopRef) {
        // loopStatement lets callers override the iterable expression entirely —
        // e.g. "myCodeVar" when the loop source is a variable built by a code node.
        const loopSource = node.loopStatement
            ? node.loopStatement
            : buildLoopSourcePath(loopRef, state.sourceTreeNode!)
        const iterVar = node.loopIterator || `_${loopRef.variableName}`
        lines.push(`${indent}for (const ${iterVar} of ${loopSource}) {`)
        indentLevel++
        indent = "  ".repeat(indentLevel)

        // 3a. Loop conditions (filter)
        if (node.loopConditions && node.loopConditions.length > 0) {
            const connective = node.loopConditionsConnective === "OR" ? " || " : " && "
            const condParts = node.loopConditions.map((lc) => {
                const path = buildLoopConditionPath(lc, iterVar, state.sourceTreeNode!, loopRef)
                return `${path} ${lc.condition}`
            })
            lines.push(`${indent}if (${condParts.join(connective)}) {`)
            indentLevel++
            indent = "  ".repeat(indentLevel)
        }

        // 3b. Initialize array target if this is an array node (build-then-push pattern)
        // Instead of pushing {} immediately and assigning via arr[arr.length - 1],
        // we create a temp object and only push it if it ends up with properties.
        // This prevents empty {} entries when child node conditions filter out all fields.
        if (node.type === "array") {
            const arrPath = buildOutputPath(node, outputVar, state.targetTreeNode!, arrayTempVars)
            arrayArrPath = arrPath
            lines.push(`${indent}${arrPath} = ${arrPath} || []`)
            arrayTempVar = `_item_${indentLevel}`
            lines.push(`${indent}const ${arrayTempVar} = {}`)
            // Register temp var so child buildOutputPath calls resolve to it
            if (!arrayTempVars) arrayTempVars = new Map()
            arrayTempVars.set(node.id, arrayTempVar)
        }

        // 3c. Declare refs scoped to this loop
        const scopeRefs = collectLoopScopedRefs(node, loopRef.id)
        for (const ref of scopeRefs) {
            const path = buildSourceAccessPath(ref, state.sourceTreeNode!, loopRef, iterVar)
            lines.push(`${indent}const ${ref.variableName} = ${path}`)
        }
    }

    // 3d. Custom code block (injected verbatim before value assignment)
    if (node.customCode?.trim()) {
        for (const codeLine of node.customCode.trim().split("\n")) {
            lines.push(indent + codeLine)
        }
    }

    // 4. Set value on this node (leaf assignment)
    const valueExpr = buildValueExpression(node)
    if (valueExpr !== null && node.type !== "array" && node.type !== "arrayChild") {
        const outputPath = buildOutputPath(node, outputVar, state.targetTreeNode!, arrayTempVars)
        let line = `${indent}${outputPath} = ${valueExpr}`

        // Debug comment
        if (state.mapperPreferences.debugComment && node.sourceReferences?.length) {
            line += ` // ${node.sourceReferences.map((r) => r.variableName).join(", ")}`
        }
        lines.push(line)
    }

    // 5. Children recursion
    const childLoopRef = loopRef ?? activeLoopRef
    const childIterVar = loopRef ? node.loopIterator || `_${loopRef.variableName}` : activeIterVar
    for (const child of node.children ?? []) {
        const childCode = generateTargetNode(
            child,
            state,
            outputVar,
            indentLevel,
            childLoopRef,
            childIterVar,
            arrayTempVars,
        )
        if (childCode) lines.push(childCode)
    }

    // 5b. Conditional push — only add the temp item to the array if it has properties.
    // This is the completion of the build-then-push pattern started in section 3b.
    if (loopRef && arrayTempVar && arrayArrPath) {
        lines.push(`${indent}if (Object.keys(${arrayTempVar}).length > 0) {`)
        lines.push(`${indent}  ${arrayArrPath}.push(${arrayTempVar})`)
        lines.push(`${indent}}`)
    }

    // 6. Close loop conditions if block
    if (loopRef && node.loopConditions && node.loopConditions.length > 0) {
        indentLevel--
        indent = "  ".repeat(indentLevel)
        lines.push(`${indent}}`)
    }

    // 7. Close loop for block
    if (loopRef) {
        indentLevel--
        indent = "  ".repeat(indentLevel)
        lines.push(`${indent}}`)
    }

    // 8. Close node condition if block
    if (hasNodeCondition) {
        indentLevel--
        indent = "  ".repeat(indentLevel)
        lines.push(`${indent}}`)
    }

    return lines.filter((l) => l !== "").join("\n")
}

/**
 * Generate the output construction section from the target tree root's children.
 */
function generateOutputSection(state: MapperState): string {
    if (!state.targetTreeNode) return ""

    const lines: Array<string> = []

    // Initialize root output object
    lines.push("const output = {}")

    for (const child of state.targetTreeNode.children ?? []) {
        const code = generateTargetNode(child, state, "output", 0, null, null)
        if (code) lines.push(code)
    }

    return lines.join("\n")
}

// ============================================================
// Phase 6 — detectTemplateType
// ============================================================

/**
 * Detects the template type from state source/target input types.
 */
export function detectTemplateType(state: MapperState): TemplateType {
    const src = state.sourceInputType === "XML" ? "xml" : "json"
    const tgt = state.targetInputType === "XML" ? "xml" : "json"
    return `${src}_to_${tgt}` as TemplateType
}

// ============================================================
// Phase 6 — generateScript
// ============================================================

/**
 * Generates a JavaScript function body string from a MapperState.
 * TypeScript equivalent of MapperWriter.createScript() in Groovy.
 */
export function generateScript(
    state: MapperState,
    inputType: "json" | "xml",
    outputType: "json" | "xml",
): string {
    const sections: Array<string> = []

    // 1. Parse input
    if (inputType === "xml") {
        sections.push("const sourceData = parseXML(input)")
    } else {
        sections.push("const sourceData = JSON.parse(input)")
    }

    // 2. Global variables
    const globalVarsCode = generateGlobalVariables(state.localContext)
    if (globalVarsCode) sections.push(globalVarsCode)

    // 3. Lookup tables
    const lookupCode = generateLookupTables(state.localContext)
    if (lookupCode) sections.push(lookupCode)

    // 4. User-defined functions
    const functionsCode = generateFunctions(state.localContext)
    if (functionsCode) sections.push(functionsCode)

    // 5. Prolog script (verbatim)
    if (state.localContext.prologScript?.trim()) {
        sections.push(state.localContext.prologScript.trim())
    }

    // 6. Top-level source reference variable declarations
    const sourceRefVars = generateSourceRefVariables(state)
    if (sourceRefVars) sections.push(sourceRefVars)

    // 7. Output construction
    const outputSection = generateOutputSection(state)
    if (outputSection) sections.push(outputSection)

    // 8. Epilog script (verbatim)
    if (state.localContext.epilogScript?.trim()) {
        sections.push(state.localContext.epilogScript.trim())
    }

    // 9. Return output
    if (outputType === "xml") {
        sections.push("return toXML(output)")
    } else {
        sections.push("return JSON.stringify(output, null, 2)")
    }

    return sections.join("\n\n")
}

// ============================================================
// Phase 6 — executeScript
// ============================================================

export interface ExecuteScriptOptions {
    /** When true, inject Groovy shim functions into the script scope */
    injectGroovyShims?: boolean
}

/**
 * Executes a generated script string against input data.
 * Returns {output, error} — never throws.
 * Declared async to allow future async execution (e.g. web workers, sandboxing).
 *
 * When `options.injectGroovyShims` is true, all Groovy shim functions
 * (createDateFormatter, roundTo, chunkArray, getText, etc.) are injected
 * as additional parameters into the script's scope.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function executeScript(
    scriptBody: string,
    input: string,
    _context: MapperContext,
    options?: ExecuteScriptOptions,
): Promise<ScriptExecutionResult> {
    const start = performance.now()
    const capturedLogs: string[] = []

    // Intercept console methods to capture output
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error

    const formatArgs = (prefix: string, args: unknown[]): string => {
        const msg = args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ")
        return prefix ? `[${prefix}] ${msg}` : msg
    }

    console.log = (...args: unknown[]) => {
        capturedLogs.push(formatArgs("", args))
        origLog.apply(console, args)
    }
    console.warn = (...args: unknown[]) => {
        capturedLogs.push(formatArgs("warn", args))
        origWarn.apply(console, args)
    }
    console.error = (...args: unknown[]) => {
        capturedLogs.push(formatArgs("error", args))
        origError.apply(console, args)
    }

    try {
        const fullScript = `"use strict";\n${scriptBody}`

        // new Function creates a function in global scope (not module scope)
        // We pass 'input', 'parseXML', and 'toXML' as base parameters
        const baseParamNames = ["input", "parseXML", "toXML"]
        const baseParamValues: unknown[] = [input, parseXMLInput, generateXMLOutput]

        // When running transpiled Groovy code, inject shim functions as
        // additional named parameters so they're available in scope
        if (options?.injectGroovyShims) {
            const shimNames = getGroovyShimParamNames()
            const shimValues = getGroovyShimParamValues()
            const allParamNames = [...baseParamNames, ...shimNames]
            const allParamValues = [...baseParamValues, ...shimValues]

            const fn = new Function(...allParamNames, fullScript)
            const result = fn(...allParamValues)
            const output = result != null ? String(result) : ""

            return {
                output,
                error: null,
                scriptBody,
                durationMs: performance.now() - start,
                logs: capturedLogs,
            }
        }

        const fn = new Function(...baseParamNames, fullScript)
        const result = fn(...baseParamValues)

        const output = result != null ? String(result) : ""

        return {
            output,
            error: null,
            scriptBody,
            durationMs: performance.now() - start,
            logs: capturedLogs,
        }
    } catch (err) {
        return {
            output: "",
            error: err instanceof Error ? err.message : String(err),
            scriptBody,
            durationMs: performance.now() - start,
            logs: capturedLogs,
        }
    } finally {
        // Always restore console methods
        console.log = origLog
        console.warn = origWarn
        console.error = origError
    }
}
