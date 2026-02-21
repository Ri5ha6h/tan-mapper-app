/**
 * Phase 9 — Excel Export
 *
 * Generates an xlsx workbook from MapperState using the xlsx npm library.
 * Equivalent of JTSheetStateWriter.java (GrapeCity) from the original Vaadin system.
 *
 * Sheet layout:
 *   1. Source Nodes   — flattened source tree with UUID + parent UUID for tree reconstruction
 *   2. Target Nodes   — flattened target tree with mapping metadata (human-readable audit view)
 *   3. References     — flat reference list keyed by UUIDs (machine-import sheet)
 *   4. Global Variables
 *   5. Lookup Tables
 *   6. Functions
 */

import * as XLSX from "xlsx"
import { findNodeById, getFullPath } from "./node-utils"
import type { FlatReference, MapperContext, MapperState, MapperTreeNode } from "./types"

// ============================================================
// Public API
// ============================================================

/**
 * Generates an xlsx workbook from MapperState and triggers browser download.
 */
export function downloadAsExcel(state: MapperState, filename?: string): void {
    const wb = buildWorkbook(state)
    const name = filename ?? (state.name ? `${state.name}.xlsx` : "mapper-export.xlsx")
    XLSX.writeFile(wb, name)
}

/**
 * Generates xlsx as a Blob (for testing or custom handling).
 */
export function stateToExcelBlob(state: MapperState): Blob {
    const wb = buildWorkbook(state)
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
    return new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
}

// ============================================================
// Workbook builder
// ============================================================

function buildWorkbook(state: MapperState): XLSX.WorkBook {
    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(wb, buildSourceNodesSheet(state.sourceTreeNode), "Source Nodes")
    XLSX.utils.book_append_sheet(
        wb,
        buildTargetNodesSheet(state.targetTreeNode, state),
        "Target Nodes",
    )
    XLSX.utils.book_append_sheet(wb, buildReferencesSheet(state), "References")
    XLSX.utils.book_append_sheet(
        wb,
        buildGlobalVariablesSheet(state.localContext),
        "Global Variables",
    )
    XLSX.utils.book_append_sheet(wb, buildLookupTablesSheet(state.localContext), "Lookup Tables")
    XLSX.utils.book_append_sheet(wb, buildFunctionsSheet(state.localContext), "Functions")

    return wb
}

// ============================================================
// Sheet builders
// ============================================================

/**
 * Sheet 1 — Source Nodes
 *
 * Columns:
 *   A: UUID | B: Name | C: Value | D: Parent UUID | E: Input Type (root only)
 *   F: (reserved) | G: Is Code | H: Comment | I: Label | J: Format
 *   K: Non-Empty | L: Log BID | M: Error Message | N: Condition
 */
function buildSourceNodesSheet(root: MapperTreeNode | null): XLSX.WorkSheet {
    if (!root) return XLSX.utils.aoa_to_sheet([["No source model loaded"]])

    const rows: Array<Array<unknown>> = [
        [
            "UUID",
            "Name",
            "Value",
            "Parent UUID",
            "Input Type",
            "",
            "Is Code",
            "Comment",
            "Label",
            "Format",
            "Non-Empty",
            "Log BID",
            "Error Message",
            "Condition",
        ],
    ]

    function addNode(node: MapperTreeNode, parentId: string | null) {
        rows.push([
            node.id,
            node.name,
            node.value ?? "",
            parentId ?? "",
            parentId === null ? root!.name : "", // input type marker on root row (root's name)
            "",
            node.type === "code",
            node.comment ?? "",
            node.label ?? "",
            node.format ?? "",
            node.nonEmpty ?? false,
            false, // logBid — legacy field, not in new model
            node.errorMessage ?? "",
            node.nodeCondition?.condition ?? "",
        ])
        node.children?.forEach((child) => addNode(child, node.id))
    }

    addNode(root, null)
    return XLSX.utils.aoa_to_sheet(rows)
}

/**
 * Sheet 2 — Target Nodes
 *
 * Human-readable audit view — includes mapping metadata per node.
 * Columns:
 *   A: UUID | B: Full Path | C: Comment | D: Value | E: Is Plain Text
 *   F: Loop Ref Path | G: Loop Iterator | H: Loop Conditions | I: Loop Connective
 *   J: Source References | K: Node Condition | L: Enabled
 */
function buildTargetNodesSheet(root: MapperTreeNode | null, state: MapperState): XLSX.WorkSheet {
    if (!root) return XLSX.utils.aoa_to_sheet([["No target model loaded"]])

    const rows: Array<Array<unknown>> = [
        [
            "UUID",
            "Full Path",
            "Comment",
            "Value",
            "Is Plain Text",
            "Loop Ref Path",
            "Loop Iterator",
            "Loop Conditions",
            "Loop Connective",
            "Source References",
            "Node Condition",
            "Enabled",
        ],
    ]

    function addNode(node: MapperTreeNode) {
        // Build loop reference path if present
        let loopRefPath = ""
        if (node.loopReference && state.sourceTreeNode) {
            const loopSourceNode = findNodeById(
                node.loopReference.sourceNodeId,
                state.sourceTreeNode,
            )
            if (loopSourceNode) {
                loopRefPath = getFullPath(loopSourceNode.id, state.sourceTreeNode)
            }
        }

        // Encode loop conditions as semicolon-separated triples
        const loopConditionsStr =
            node.loopConditions
                ?.map((lc) => `${lc.sourceNodePath},${lc.condition},${lc.textReference}`)
                .join(";") ?? ""

        // Encode source references as semicolon-separated quads
        const sourceRefsStr =
            node.sourceReferences
                ?.map(
                    (ref) =>
                        `${ref.variableName},${ref.textReference},${ref.loopOverId ?? ""},${ref.sourceNodeId}`,
                )
                .join(";") ?? ""

        rows.push([
            node.id,
            getFullPath(node.id, root!),
            node.comment ?? "",
            node.value ?? "",
            node.plainTextValue ?? false,
            loopRefPath,
            node.loopIterator ?? "",
            loopConditionsStr,
            node.loopConditionsConnective ?? "AND",
            sourceRefsStr,
            node.nodeCondition?.condition ?? "",
            true, // Enabled — always true in new model
        ])
        node.children?.forEach(addNode)
    }

    addNode(root)
    return XLSX.utils.aoa_to_sheet(rows)
}

/**
 * Sheet 3 — References (machine-import sheet)
 *
 * Uses UUIDs for node lookup to avoid XPath collision issues.
 * Columns:
 *   A: Source Path | B: Target Path | C: Variable Name | D: Is Text Ref
 *   E: Source UUID | F: Target UUID | G: Is Loop | H: Loop Iterator
 */
function buildReferencesSheet(state: MapperState): XLSX.WorkSheet {
    const rows: Array<Array<unknown>> = [
        [
            "Source Path",
            "Target Path",
            "Variable Name",
            "Is Text Ref",
            "Source UUID",
            "Target UUID",
            "Is Loop",
            "Loop Iterator",
        ],
    ]

    for (const ref of state.references) {
        let sourcePath = ""
        let targetPath = ""

        if (state.sourceTreeNode) {
            const sourceNode = findNodeById(ref.sourceNodeId, state.sourceTreeNode)
            if (sourceNode) sourcePath = getFullPath(sourceNode.id, state.sourceTreeNode)
        }
        if (state.targetTreeNode) {
            const targetNode = findNodeById(ref.targetNodeId, state.targetTreeNode)
            if (targetNode) targetPath = getFullPath(targetNode.id, state.targetTreeNode)
        }

        // For loop references, resolve the loop iterator from the target node
        let loopIterator = ""
        if (ref.isLoop && state.targetTreeNode) {
            const targetNode = findNodeById(ref.targetNodeId, state.targetTreeNode)
            if (targetNode) loopIterator = targetNode.loopIterator ?? ""
        }

        rows.push([
            sourcePath,
            targetPath,
            ref.variableName,
            ref.textReference,
            ref.sourceNodeId,
            ref.targetNodeId,
            ref.isLoop ?? false,
            loopIterator,
        ])
    }

    return XLSX.utils.aoa_to_sheet(rows)
}

/**
 * Sheet 4 — Global Variables
 * Columns: Name | Value | Is Plain Text
 */
function buildGlobalVariablesSheet(ctx: MapperContext): XLSX.WorkSheet {
    const rows: Array<Array<unknown>> = [["Name", "Value", "Is Plain Text"]]
    ctx.globalVariables.forEach((v) => rows.push([v.name, v.value, v.plainTextValue]))
    return XLSX.utils.aoa_to_sheet(rows)
}

/**
 * Sheet 5 — Lookup Tables
 * Columns: Table | Key | Value | Is Plain Text
 * Format: table name row (col A), then entry rows (cols B-D), then blank separator row.
 */
function buildLookupTablesSheet(ctx: MapperContext): XLSX.WorkSheet {
    const rows: Array<Array<unknown>> = [["Table", "Key", "Value", "Is Plain Text"]]
    ctx.lookupTables.forEach((table) => {
        rows.push([table.name, "", "", ""]) // table name row
        table.entries.forEach((entry) =>
            rows.push(["", entry.key, entry.value, entry.plainTextValue]),
        )
        rows.push(["", "", "", ""]) // blank separator row between tables
    })
    return XLSX.utils.aoa_to_sheet(rows)
}

/**
 * Sheet 6 — Functions
 * Columns: Function Name | Body
 */
function buildFunctionsSheet(ctx: MapperContext): XLSX.WorkSheet {
    const rows: Array<Array<unknown>> = [["Function Name", "Body"]]
    ctx.functions.forEach((fn) => rows.push([fn.name, fn.body]))
    return XLSX.utils.aoa_to_sheet(rows)
}

// ============================================================
// Internal helpers (re-exported for testing)
// ============================================================

/** Exposed for unit tests */
export const _internals = {
    buildWorkbook,
    buildSourceNodesSheet,
    buildTargetNodesSheet,
    buildReferencesSheet,
    buildGlobalVariablesSheet,
    buildLookupTablesSheet,
    buildFunctionsSheet,
}

// Re-export FlatReference type alias so callers don't need a separate import
export type { FlatReference }
