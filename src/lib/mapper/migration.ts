import { v4 as uuidv4 } from "uuid"
import { MAPPER_MODEL_VERSION } from "./types"
import type {
    FlatReference,
    GlobalVariable,
    InputType,
    LoopReference,
    LookupEntry,
    LookupTable,
    MapperContext,
    MapperPreferences,
    MapperState,
    MapperTreeNode,
    SourceReference,
    TransformFunction,
} from "./types"

// ============================================================
// Internal helpers for parsing old Vaadin .jtmap JSON
// ============================================================

type AnyObj = Record<string, unknown>

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback
}

function bool(v: unknown, fallback = false): boolean {
    return typeof v === "boolean" ? v : fallback
}

function arr(v: unknown): unknown[] {
    return Array.isArray(v) ? v : []
}

function obj(v: unknown): AnyObj {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as AnyObj) : {}
}

// ============================================================
// Source-node ID mapping: old path/jsonId → new UUID
// ============================================================

/**
 * Recursively parse a source tree from the old Vaadin format.
 * Builds a map from old node ID strings to new UUIDs.
 * Old nodes may use `id` (UUID string), `jsonId` (integer), or a path string.
 */
function parseSourceNode(raw: AnyObj, idMap: Map<string, string>): MapperTreeNode {
    const newId = uuidv4()

    // Old format may have `jsonId` (integer) or `id` (UUID string)
    const oldId = raw["id"] !== undefined ? String(raw["id"]) : undefined
    const oldJsonId = raw["jsonId"] !== undefined ? String(raw["jsonId"]) : undefined

    if (oldId) idMap.set(oldId, newId)
    if (oldJsonId) idMap.set(oldJsonId, newId)

    const rawType = str(raw["type"] ?? raw["nodeType"], "element")
    const type = normalizeNodeType(rawType)
    const name = str(raw["name"] ?? raw["key"], "unknown")

    const node: MapperTreeNode = { id: newId, name, type }

    const rawChildren = arr(raw["children"])
    if (rawChildren.length > 0) {
        node.children = rawChildren.map((c) => parseSourceNode(obj(c), idMap))
    }

    return node
}

/**
 * Recursively parse a target tree from the old Vaadin format.
 * Wires sourceNodeIds via idMap, collecting loop refs for later wiring.
 */
function parseTargetNode(
    raw: AnyObj,
    idMap: Map<string, string>,
    loopRefMap: Map<string, LoopReference>,
): MapperTreeNode {
    const newId = uuidv4()

    const rawType = str(raw["type"] ?? raw["nodeType"], "element")
    const type = normalizeNodeType(rawType)
    const name = str(raw["name"] ?? raw["key"], "unknown")

    const node: MapperTreeNode = {
        id: newId,
        name,
        type,
    }

    // Optional display/doc fields
    if (raw["label"]) node.label = str(raw["label"])
    if (raw["comment"]) node.comment = str(raw["comment"])
    if (raw["format"]) node.format = str(raw["format"])
    if (raw["errorMessage"]) node.errorMessage = str(raw["errorMessage"])
    if (raw["value"] !== undefined) node.value = str(raw["value"])
    if (raw["plainTextValue"] !== undefined) node.plainTextValue = bool(raw["plainTextValue"])
    if (raw["nonEmpty"] !== undefined) node.nonEmpty = bool(raw["nonEmpty"])
    if (raw["debugComment"] !== undefined) node.debugComment = bool(raw["debugComment"])
    if (raw["quote"] !== undefined) node.quote = bool(raw["quote"])
    if (raw["logBid"] !== undefined) node.logBid = bool(raw["logBid"])

    // Loop reference (old format: loopReference object or loopSourceNodeId field)
    const rawLoopRef = raw["loopReference"] ? obj(raw["loopReference"]) : null

    if (rawLoopRef && rawLoopRef["sourceNodeId"]) {
        const oldSourceId = str(rawLoopRef["sourceNodeId"])
        const oldJsonId =
            rawLoopRef["jsonId"] !== undefined ? String(rawLoopRef["jsonId"]) : undefined
        const mappedSourceId = idMap.get(oldSourceId) ?? idMap.get(oldJsonId ?? "") ?? oldSourceId
        const lr: LoopReference = {
            id: str(rawLoopRef["id"] ?? uuidv4()),
            sourceNodeId: mappedSourceId,
            variableName: str(rawLoopRef["variableName"] ?? `_loop${uuidv4().slice(0, 4)}`),
            textReference: bool(rawLoopRef["textReference"]),
            isLoop: true,
        }
        node.loopReference = lr
        node.loopIterator = str(raw["loopIterator"] ?? lr.variableName)
        loopRefMap.set(lr.id, lr)
    }

    // Source references
    const rawSourceRefs = arr(raw["sourceReferences"] ?? raw["sourceRefs"])
    if (rawSourceRefs.length > 0) {
        node.sourceReferences = rawSourceRefs.map((r) => {
            const rawRef = obj(r)
            const oldSourceId = str(rawRef["sourceNodeId"])
            const oldJsonId = rawRef["jsonId"] !== undefined ? String(rawRef["jsonId"]) : undefined
            const mappedSourceId =
                idMap.get(oldSourceId) ?? idMap.get(oldJsonId ?? "") ?? oldSourceId

            // loopOverId may be stored as a jsonId integer referencing a loop ref
            const loopOverJsonId =
                rawRef["loopOverId"] !== undefined ? String(rawRef["loopOverId"]) : undefined
            const loopOverId = loopOverJsonId
                ? (idMap.get(loopOverJsonId) ?? loopOverJsonId)
                : undefined

            const ref: SourceReference = {
                id: str(rawRef["id"] ?? uuidv4()),
                sourceNodeId: mappedSourceId,
                variableName: str(rawRef["variableName"] ?? "var0"),
                textReference: bool(rawRef["textReference"], true),
            }
            if (loopOverId) ref.loopOverId = loopOverId
            if (rawRef["customPath"]) ref.customPath = str(rawRef["customPath"])

            return ref
        })
    }

    // Node condition
    if (raw["nodeCondition"]) {
        const nc = obj(raw["nodeCondition"])
        if (nc["condition"]) {
            node.nodeCondition = { condition: str(nc["condition"]) }
        }
    }

    // Children
    const rawChildren = arr(raw["children"])
    if (rawChildren.length > 0) {
        node.children = rawChildren.map((c) => parseTargetNode(obj(c), idMap, loopRefMap))
    }

    return node
}

function normalizeNodeType(raw: string): MapperTreeNode["type"] {
    const map: Record<string, MapperTreeNode["type"]> = {
        element: "element",
        "xml-element": "element",
        object: "element",
        primitive: "element",
        attribute: "attribute",
        "xml-attribute": "attribute",
        array: "array",
        arraychild: "arrayChild",
        arrayChild: "arrayChild",
        "array-child": "arrayChild",
        code: "code",
    }
    return map[raw] ?? "element"
}

function parseContext(raw: AnyObj): MapperContext {
    const globalVariables: GlobalVariable[] = arr(raw["globalVariables"]).map((v) => {
        const gv = obj(v)
        return {
            id: str(gv["id"] ?? uuidv4()),
            name: str(gv["name"]),
            value: str(gv["value"]),
            plainTextValue: bool(gv["plainTextValue"], true),
            isFinal: bool(gv["isFinal"]),
        }
    })

    const lookupTables: LookupTable[] = arr(raw["lookupTables"]).map((t) => {
        const lt = obj(t)
        const entries: LookupEntry[] = arr(lt["entries"]).map((e) => {
            const le = obj(e)
            return {
                id: str(le["id"] ?? uuidv4()),
                key: str(le["key"]),
                value: str(le["value"]),
                plainTextValue: bool(le["plainTextValue"], true),
            }
        })
        return {
            id: str(lt["id"] ?? uuidv4()),
            name: str(lt["name"]),
            entries,
        }
    })

    const functions: TransformFunction[] = arr(raw["functions"]).map((f) => {
        const fn = obj(f)
        return {
            id: str(fn["id"] ?? uuidv4()),
            name: str(fn["name"]),
            body: str(fn["body"]),
        }
    })

    return {
        globalVariables,
        lookupTables,
        functions,
        prologScript:
            raw["prologScript"] !== undefined ? (raw["prologScript"] as string | null) : null,
        epilogScript:
            raw["epilogScript"] !== undefined ? (raw["epilogScript"] as string | null) : null,
    }
}

function parsePreferences(raw: AnyObj): MapperPreferences {
    return {
        debugComment: bool(raw["debugComment"]),
        overrideTargetValue: bool(raw["overrideTargetValue"], true),
        autoMap: bool(raw["autoMap"]),
        autoMapOneToMany: bool(raw["autoMapOneToMany"]),
        autoMapIncludeSubNodes: bool(raw["autoMapIncludeSubNodes"]),
    }
}

function parseInputType(raw: unknown): InputType {
    const valid: InputType[] = ["JSON", "XML", "CSV", "UNKNOWN"]
    if (typeof raw === "string" && valid.includes(raw as InputType)) {
        return raw as InputType
    }
    return "UNKNOWN"
}

// ============================================================
// Build flat references from target tree
// ============================================================

function buildFlatRefs(targetNode: MapperTreeNode): FlatReference[] {
    const refs: FlatReference[] = []

    function walk(node: MapperTreeNode): void {
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
                walk(child)
            }
        }
    }

    walk(targetNode)
    return refs
}

// ============================================================
// Main migration entry point
// ============================================================

/**
 * Convert a parsed Vaadin .jtmap JSON object to new MapperState.
 * Handles the jsonId cross-reference wiring for loop references.
 * Called automatically by deserializeMapperState() when isLegacyJtmap() = true.
 */
export function migrateFromJtmap(jtmapJson: Record<string, unknown>): MapperState {
    // Step 1: Parse source tree — build old-ID → new-UUID map
    const idMap = new Map<string, string>()
    const rawSource = jtmapJson["sourceTreeNode"]
    const sourceTreeNode = rawSource ? parseSourceNode(obj(rawSource), idMap) : null

    // Step 2 & 3: Parse target tree — wire source node IDs via idMap
    const loopRefMap = new Map<string, LoopReference>()
    const rawTarget = jtmapJson["targetTreeNode"]
    const targetTreeNode = rawTarget ? parseTargetNode(obj(rawTarget), idMap, loopRefMap) : null

    // Step 4: Build flat references from the now-parsed target tree
    const references = targetTreeNode ? buildFlatRefs(targetTreeNode) : []

    // Step 5: Parse context
    const rawContext = obj(jtmapJson["localContext"] ?? jtmapJson["groovyContext"] ?? {})
    const localContext = parseContext(rawContext)

    // Step 6: Parse preferences
    const rawPrefs = obj(jtmapJson["mapperPreferences"] ?? {})
    const mapperPreferences = parsePreferences(rawPrefs)

    // Input types
    const sourceInputType = parseInputType(jtmapJson["sourceInputType"])
    const targetInputType = parseInputType(jtmapJson["targetInputType"])

    return {
        modelVersion: MAPPER_MODEL_VERSION,
        id: typeof jtmapJson["id"] === "string" ? jtmapJson["id"] : uuidv4(),
        name: typeof jtmapJson["name"] === "string" ? jtmapJson["name"] : undefined,
        sourceTreeNode,
        targetTreeNode,
        references,
        localContext,
        mapperPreferences,
        sourceInputType,
        targetInputType,
    }
}
