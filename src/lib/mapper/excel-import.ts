/**
 * Phase 9 — Excel Import
 *
 * Reads an xlsx workbook and parses it into a partial MapperState.
 * Equivalent of ExcelStateReader.java + ExcelNodeStateReader.java from the original Vaadin system.
 *
 * The caller (UploadExcelDialog) decides which sections to apply via store actions.
 * This module is purely a parser — it never mutates store state directly.
 */

import * as XLSX from "xlsx"
import { v4 as uuid } from "uuid"
import type {
    FlatReference,
    GlobalVariable,
    LookupEntry,
    LookupTable,
    MapperContext,
    MapperState,
    MapperTreeNode,
    SourceReference,
    TransformFunction,
} from "./types"

// ============================================================
// Public types
// ============================================================

export interface ExcelImportResult {
    state: Partial<MapperState>
    errors: Array<ExcelImportError>
    sheetNames: Array<string>
    /** Counts of parsed items per section — shown in the preview step */
    counts: {
        sourceNodes: number
        targetNodes: number
        references: number
        globalVariables: number
        lookupTables: number
        functions: number
    }
}

export interface ExcelImportError {
    sheet: string
    row?: number
    col?: number
    message: string
}

// ============================================================
// Public API
// ============================================================

/**
 * Reads an Excel file (File) and returns parsed data as a partial MapperState.
 * Does NOT apply to the mapper state — caller applies via store actions.
 * Never throws; all errors are collected in result.errors.
 */
export async function readExcelFile(file: File): Promise<ExcelImportResult> {
    const errors: Array<ExcelImportError> = []
    const result: Partial<MapperState> = {}
    const counts = {
        sourceNodes: 0,
        targetNodes: 0,
        references: 0,
        globalVariables: 0,
        lookupTables: 0,
        functions: 0,
    }

    let wb: XLSX.WorkBook
    try {
        const arrayBuffer = await file.arrayBuffer()
        wb = XLSX.read(arrayBuffer, { type: "array" })
    } catch (e) {
        errors.push({ sheet: "File", message: `Failed to read Excel file: ${String(e)}` })
        return { state: result, errors, sheetNames: [], counts }
    }

    const sheetNames = wb.SheetNames

    // ── Source Nodes ────────────────────────────────────────────────────────────
    let sourceNodeMap: Map<string, MapperTreeNode> | null = null
    if (sheetNames.includes("Source Nodes")) {
        const {
            root,
            nodeMap,
            errors: sheetErrors,
        } = parseNodeSheet(wb.Sheets["Source Nodes"], "Source Nodes")
        errors.push(...sheetErrors)
        if (root) {
            result.sourceTreeNode = root
            sourceNodeMap = nodeMap
            counts.sourceNodes = nodeMap.size
        }
    }

    // ── Target Nodes ────────────────────────────────────────────────────────────
    let targetNodeMap: Map<string, MapperTreeNode> | null = null
    if (sheetNames.includes("Target Nodes")) {
        const {
            root,
            nodeMap,
            errors: sheetErrors,
        } = parseNodeSheet(wb.Sheets["Target Nodes"], "Target Nodes")
        errors.push(...sheetErrors)
        if (root) {
            result.targetTreeNode = root
            targetNodeMap = nodeMap
            counts.targetNodes = nodeMap.size
        }
    }

    // ── References ──────────────────────────────────────────────────────────────
    if (sheetNames.includes("References") && sourceNodeMap && targetNodeMap) {
        const { references, errors: refErrors } = parseReferencesSheet(
            wb.Sheets["References"],
            sourceNodeMap,
            targetNodeMap,
        )
        errors.push(...refErrors)
        result.references = references
        counts.references = references.length
    }

    // ── Global Variables ────────────────────────────────────────────────────────
    if (sheetNames.includes("Global Variables")) {
        const { variables, errors: varErrors } = parseGlobalVariablesSheet(
            wb.Sheets["Global Variables"],
        )
        errors.push(...varErrors)
        if (!result.localContext) result.localContext = createEmptyContext()
        result.localContext.globalVariables = variables
        counts.globalVariables = variables.length
    }

    // ── Lookup Tables ────────────────────────────────────────────────────────────
    if (sheetNames.includes("Lookup Tables")) {
        const { tables, errors: tableErrors } = parseLookupTablesSheet(wb.Sheets["Lookup Tables"])
        errors.push(...tableErrors)
        if (!result.localContext) result.localContext = createEmptyContext()
        result.localContext.lookupTables = tables
        counts.lookupTables = tables.length
    }

    // ── Functions ────────────────────────────────────────────────────────────────
    if (sheetNames.includes("Functions")) {
        const { functions, errors: fnErrors } = parseFunctionsSheet(wb.Sheets["Functions"])
        errors.push(...fnErrors)
        if (!result.localContext) result.localContext = createEmptyContext()
        result.localContext.functions = functions
        counts.functions = functions.length
    }

    return { state: result, errors, sheetNames, counts }
}

// ============================================================
// Sheet parsers
// ============================================================

/**
 * Parses the Source Nodes or Target Nodes sheet.
 * Reconstructs tree from UUID + parent UUID columns.
 *
 * Column order (0-indexed):
 *   0: UUID | 1: Name | 2: Value | 3: Parent UUID | 4: Input Type (root only)
 *   5: reserved | 6: Is Code | 7: Comment | 8: Label | 9: Format
 *   10: Non-Empty | 11: Log BID | 12: Error Message | 13: Condition
 */
function parseNodeSheet(
    sheet: XLSX.WorkSheet,
    sheetName: string,
): {
    root: MapperTreeNode | null
    nodeMap: Map<string, MapperTreeNode>
    errors: Array<ExcelImportError>
} {
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1 })
    const errors: Array<ExcelImportError> = []
    const nodeMap = new Map<string, MapperTreeNode>()
    const parentMap = new Map<string, string | null>()

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row.length === 0) continue

        const id = String(row[0] ?? "").trim()
        const name = String(row[1] ?? "").trim()
        if (!id || !name) continue

        const value = String(row[2] ?? "") || undefined
        const parentId = String(row[3] ?? "").trim() || null
        const isCode = parseBoolean(row[6])
        const comment = String(row[7] ?? "") || undefined
        const label = String(row[8] ?? "") || undefined
        const format = String(row[9] ?? "") || undefined
        const nonEmpty = parseBoolean(row[10])
        const errorMessage = String(row[12] ?? "") || undefined
        const nodeConditionStr = String(row[13] ?? "") || undefined

        const node: MapperTreeNode = {
            id,
            name,
            type: isCode ? "code" : "element",
            value,
            comment,
            label,
            format,
            nonEmpty: nonEmpty || undefined,
            errorMessage,
            nodeCondition: nodeConditionStr ? { condition: nodeConditionStr } : undefined,
            children: [],
            sourceReferences: [],
        }

        nodeMap.set(id, node)
        parentMap.set(id, parentId)
    }

    // Reconstruct tree from parent/child relationships
    let root: MapperTreeNode | null = null

    nodeMap.forEach((node, id) => {
        const parentId = parentMap.get(id)
        if (!parentId) {
            root = node
        } else {
            const parent = nodeMap.get(parentId)
            if (parent) {
                parent.children = parent.children ?? []
                parent.children.push(node)
            } else {
                errors.push({
                    sheet: sheetName,
                    message: `Parent node not found: ${parentId} for node ${id} (${node.name})`,
                })
            }
        }
    })

    return { root, nodeMap, errors }
}

/**
 * Parses the References sheet and wires up SourceReferences / LoopReferences on target nodes.
 *
 * Column order (0-indexed):
 *   0: Source Path | 1: Target Path | 2: Variable Name | 3: Is Text Ref
 *   4: Source UUID | 5: Target UUID | 6: Is Loop | 7: Loop Iterator
 */
function parseReferencesSheet(
    sheet: XLSX.WorkSheet,
    sourceNodeMap: Map<string, MapperTreeNode>,
    targetNodeMap: Map<string, MapperTreeNode>,
): { references: Array<FlatReference>; errors: Array<ExcelImportError> } {
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1 })
    const references: Array<FlatReference> = []
    const errors: Array<ExcelImportError> = []

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row.length < 6) continue

        const variableName = String(row[2] ?? "").trim()
        const textReference = parseBoolean(row[3])
        const sourceNodeId = String(row[4] ?? "").trim()
        const targetNodeId = String(row[5] ?? "").trim()
        const isLoop = parseBoolean(row[6])
        const loopIterator = String(row[7] ?? "").trim() || undefined

        if (!sourceNodeId || !targetNodeId) continue

        // Validate both nodes exist
        const sourceNode = sourceNodeMap.get(sourceNodeId)
        if (!sourceNode) {
            errors.push({
                sheet: "References",
                row: i + 1,
                message: `Source node not found: ${sourceNodeId}`,
            })
            continue
        }

        const targetNode = targetNodeMap.get(targetNodeId)
        if (!targetNode) {
            errors.push({
                sheet: "References",
                row: i + 1,
                message: `Target node not found: ${targetNodeId}`,
            })
            continue
        }

        const refId = uuid()

        // Wire up on the target node
        if (isLoop) {
            targetNode.loopReference = {
                id: refId,
                sourceNodeId,
                variableName,
                textReference,
                isLoop: true,
            }
            if (loopIterator) targetNode.loopIterator = loopIterator
        } else {
            const sourceRef: SourceReference = {
                id: refId,
                sourceNodeId,
                variableName,
                textReference,
            }
            targetNode.sourceReferences = targetNode.sourceReferences ?? []
            targetNode.sourceReferences.push(sourceRef)
        }

        const flatRef: FlatReference = {
            id: refId,
            sourceNodeId,
            targetNodeId,
            variableName,
            textReference,
            isLoop,
        }

        references.push(flatRef)
    }

    return { references, errors }
}

/**
 * Parses the Global Variables sheet.
 * Columns: Name | Value | Is Plain Text
 */
function parseGlobalVariablesSheet(sheet: XLSX.WorkSheet): {
    variables: Array<GlobalVariable>
    errors: Array<ExcelImportError>
} {
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1 })
    const variables: Array<GlobalVariable> = []
    const errors: Array<ExcelImportError> = []

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row.length < 2) continue

        const name = String(row[0] ?? "").trim()
        if (!name) continue

        variables.push({
            id: uuid(),
            name,
            value: String(row[1] ?? ""),
            plainTextValue: parseBoolean(row[2]),
        })
    }

    return { variables, errors }
}

/**
 * Parses the Lookup Tables sheet.
 * Format: table name row (col A only), then entry rows (cols B-D), then blank separator row.
 * Columns: Table | Key | Value | Is Plain Text
 */
function parseLookupTablesSheet(sheet: XLSX.WorkSheet): {
    tables: Array<LookupTable>
    errors: Array<ExcelImportError>
} {
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1 })
    const tables: Array<LookupTable> = []
    const errors: Array<ExcelImportError> = []

    let currentTable: LookupTable | null = null

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row)) continue

        const colA = String(row[0] ?? "").trim()
        const colB = String(row[1] ?? "").trim()
        const colC = String(row[2] ?? "")
        const colD = parseBoolean(row[3])

        if (colA && !colB) {
            // Table name row — start a new table
            currentTable = {
                id: uuid(),
                name: colA,
                entries: [],
            }
            tables.push(currentTable)
        } else if (!colA && colB && currentTable) {
            // Entry row — belongs to current table
            const entry: LookupEntry = {
                id: uuid(),
                key: colB,
                value: colC,
                plainTextValue: colD,
            }
            currentTable.entries.push(entry)
        }
        // blank rows (separators) are simply skipped
    }

    return { tables, errors }
}

/**
 * Parses the Functions sheet.
 * Columns: Function Name | Body
 */
function parseFunctionsSheet(sheet: XLSX.WorkSheet): {
    functions: Array<TransformFunction>
    errors: Array<ExcelImportError>
} {
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1 })
    const functions: Array<TransformFunction> = []
    const errors: Array<ExcelImportError> = []

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row.length < 1) continue

        const name = String(row[0] ?? "").trim()
        if (!name) continue

        functions.push({
            id: uuid(),
            name,
            body: String(row[1] ?? ""),
        })
    }

    return { functions, errors }
}

// ============================================================
// Utilities
// ============================================================

/**
 * Parses a cell value into a boolean.
 * Handles: true/false booleans, "TRUE"/"FALSE" strings, 1/0 numbers.
 */
function parseBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0
    if (typeof value === "string") {
        const lower = value.toLowerCase().trim()
        return lower === "true" || lower === "1" || lower === "yes"
    }
    return false
}

function createEmptyContext(): MapperContext {
    return {
        globalVariables: [],
        lookupTables: [],
        functions: [],
        prologScript: null,
        epilogScript: null,
    }
}
