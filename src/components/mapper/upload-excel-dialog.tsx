/**
 * Phase 9 — Upload Excel Dialog
 *
 * 3-step wizard for importing a MapperState from an xlsx file.
 * Corresponds to UploadExcelDialogBuilder.java from the original Vaadin system.
 *
 * Steps:
 *   1. Upload — Drag-and-drop / click to browse for an .xlsx file
 *   2. Options — Checkboxes to select which sections to import
 *   3. Preview — Summary of parsed data with any warnings; [Import] button
 */

import * as React from "react"
import { Check, FileSpreadsheet, Upload } from "lucide-react"
import type { ExcelImportResult } from "@/lib/mapper/excel-import"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useMapperStore } from "@/lib/mapper/store"
import { readExcelFile } from "@/lib/mapper/excel-import"
import { cn } from "@/lib/utils"

// ─── Props ──────────────────────────────────────────────────────────────────────

interface UploadExcelDialogProps {
    open: boolean
    onClose: () => void
}

// ─── Import Options ─────────────────────────────────────────────────────────────

interface ImportOptions {
    overrideModel: boolean
    importSourceModel: boolean
    importTargetModel: boolean
    importRefs: boolean
    importGlobalVars: boolean
    importLookupTables: boolean
    importFunctions: boolean
}

const DEFAULT_OPTIONS: ImportOptions = {
    overrideModel: true,
    importSourceModel: true,
    importTargetModel: true,
    importRefs: true,
    importGlobalVars: true,
    importLookupTables: true,
    importFunctions: true,
}

// ─── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-2 mt-2">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <React.Fragment key={n}>
                    <div
                        className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold",
                            n === current
                                ? "bg-primary text-primary-foreground"
                                : n < current
                                  ? "bg-primary/30 text-primary"
                                  : "bg-secondary/20 text-muted-foreground",
                        )}
                    >
                        {n < current ? <Check className="h-3 w-3" /> : n}
                    </div>
                    {n < total && (
                        <div
                            className={cn(
                                "h-px flex-1",
                                n < current ? "bg-primary/50" : "bg-glass-border",
                            )}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    )
}

// ─── Checkbox Row ────────────────────────────────────────────────────────────────

function CheckboxRow({
    checked,
    onChange,
    label,
    description,
    disabled,
}: {
    checked: boolean
    onChange: (v: boolean) => void
    label: string
    description?: string
    disabled?: boolean
}) {
    return (
        <label
            className={cn(
                "flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                "border border-glass-border bg-glass-bg/30",
                disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-glass-bg/60",
            )}
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 accent-primary"
            />
            <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
            </div>
        </label>
    )
}

// ─── Count Badge ────────────────────────────────────────────────────────────────

function CountBadge({ count, label }: { count: number; label: string }) {
    return (
        <div className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-glass-bg/40">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span
                className={cn(
                    "text-xs font-semibold rounded-full px-2 py-0.5",
                    count > 0
                        ? "bg-accent/20 text-accent-foreground"
                        : "bg-secondary/20 text-muted-foreground",
                )}
            >
                {count}
            </span>
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function UploadExcelDialog({ open, onClose }: UploadExcelDialogProps) {
    const store = useMapperStore()
    const [step, setStep] = React.useState(1)
    const [dragOver, setDragOver] = React.useState(false)
    const [file, setFile] = React.useState<File | null>(null)
    const [parseError, setParseError] = React.useState<string | null>(null)
    const [isParsing, setIsParsing] = React.useState(false)
    const [importResult, setImportResult] = React.useState<ExcelImportResult | null>(null)
    const [options, setOptions] = React.useState<ImportOptions>(DEFAULT_OPTIONS)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    // Reset state whenever dialog opens
    React.useEffect(() => {
        if (open) {
            setStep(1)
            setFile(null)
            setParseError(null)
            setImportResult(null)
            setOptions(DEFAULT_OPTIONS)
            setDragOver(false)
        }
    }, [open])

    // ── File handling ─────────────────────────────────────────────────────────────

    async function handleFileSelected(selectedFile: File) {
        if (!selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
            setParseError("Only .xlsx or .xls files are supported.")
            return
        }
        if (selectedFile.size === 0) {
            setParseError("The selected file is empty.")
            return
        }

        setFile(selectedFile)
        setParseError(null)
        setIsParsing(true)

        try {
            const result = await readExcelFile(selectedFile)
            setImportResult(result)
        } catch (e) {
            setParseError(`Failed to parse file: ${String(e)}`)
            setImportResult(null)
        } finally {
            setIsParsing(false)
        }
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault()
        setDragOver(false)
        const dropped = e.dataTransfer.files.item(0)
        if (dropped !== null) handleFileSelected(dropped)
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files?.[0]
        if (selected) handleFileSelected(selected)
        // Reset input so same file can be re-selected
        e.target.value = ""
    }

    // ── Option helpers ─────────────────────────────────────────────────────────────

    function setOption<TKey extends keyof ImportOptions>(key: TKey, value: ImportOptions[TKey]) {
        setOptions((prev) => ({ ...prev, [key]: value }))
    }

    // ── Import action ──────────────────────────────────────────────────────────────

    function handleImport() {
        if (!importResult) return

        store.snapshot()

        const { state } = importResult

        if (options.importSourceModel && state.sourceTreeNode) {
            store.applySourceModel(
                state.sourceTreeNode,
                state.sourceInputType ?? "JSON",
                options.overrideModel ? "REPLACE" : "MERGE",
            )
        }

        if (options.importTargetModel && state.targetTreeNode) {
            store.applyTargetModel(
                state.targetTreeNode,
                state.targetInputType ?? "JSON",
                options.overrideModel ? "REPLACE" : "MERGE",
            )
        }

        if (options.importRefs && state.references) {
            store.setReferences(state.references)
        }

        if (state.localContext !== undefined) {
            const contextPatch: Parameters<typeof store.updateContext>[0] = {}

            if (options.importGlobalVars) {
                contextPatch.globalVariables = state.localContext.globalVariables
            }
            if (options.importLookupTables) {
                contextPatch.lookupTables = state.localContext.lookupTables
            }
            if (options.importFunctions) {
                contextPatch.functions = state.localContext.functions
            }

            if (Object.keys(contextPatch).length > 0) {
                store.updateContext(contextPatch)
            }
        }

        onClose()
    }

    // ── Can proceed checks ─────────────────────────────────────────────────────────

    const canProceedToStep2 = !isParsing && importResult !== null && !parseError
    const canImport =
        importResult !== null &&
        (importResult.counts.sourceNodes > 0 ||
            importResult.counts.targetNodes > 0 ||
            importResult.counts.references > 0 ||
            importResult.counts.globalVariables > 0 ||
            importResult.counts.lookupTables > 0 ||
            importResult.counts.functions > 0)

    // ── Render ────────────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                className="max-w-lg w-full bg-glass-bg border-glass-border backdrop-blur-2xl animate-modal-enter"
                showClose
            >
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-accent" />
                        Import from Excel
                    </DialogTitle>
                    <StepIndicator current={step} total={3} />
                </DialogHeader>

                {/* ── Step 1: Upload ──────────────────────────────────────────────────── */}
                {step === 1 && (
                    <div className="py-2 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Upload an Excel file (.xlsx) previously exported from the mapper.
                        </p>

                        {/* Drop zone */}
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="Upload Excel file"
                            className={cn(
                                "relative flex flex-col items-center justify-center gap-3 rounded-xl",
                                "border-2 border-dashed min-h-[160px] cursor-pointer transition-all",
                                "text-muted-foreground text-sm",
                                dragOver
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-glass-border bg-glass-bg/30 hover:border-primary/50 hover:bg-primary/5",
                            )}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setDragOver(true)
                            }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="sr-only"
                                onChange={handleInputChange}
                            />

                            {isParsing ? (
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                    <p className="text-xs">Parsing file…</p>
                                </div>
                            ) : file && importResult ? (
                                <div className="flex flex-col items-center gap-2 text-center px-4">
                                    <FileSpreadsheet className="h-8 w-8 text-accent" />
                                    <p className="font-medium text-foreground text-sm">
                                        {file.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Sheets found: {importResult.sheetNames.join(", ")}
                                    </p>
                                    <p className="text-xs text-accent">
                                        Click to choose a different file
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <Upload className="h-8 w-8 opacity-40" />
                                    <div className="text-center">
                                        <p className="font-medium">Drop your .xlsx file here</p>
                                        <p className="text-xs mt-1 opacity-70">
                                            or click to browse
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Parse error */}
                        {parseError && (
                            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                {parseError}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Step 2: Options ─────────────────────────────────────────────────── */}
                {step === 2 && (
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Choose which sections to import and how to apply them.
                        </p>

                        {/* Override vs merge */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setOption("overrideModel", true)}
                                className={cn(
                                    "rounded-xl border p-3 text-sm font-medium text-left transition-all",
                                    options.overrideModel
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-glass-border bg-glass-bg/30 text-muted-foreground hover:border-primary/40",
                                )}
                            >
                                <p className="font-semibold">Override</p>
                                <p className="text-xs opacity-70 mt-0.5">Replace existing data</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setOption("overrideModel", false)}
                                className={cn(
                                    "rounded-xl border p-3 text-sm font-medium text-left transition-all",
                                    !options.overrideModel
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-glass-border bg-glass-bg/30 text-muted-foreground hover:border-primary/40",
                                )}
                            >
                                <p className="font-semibold">Merge</p>
                                <p className="text-xs opacity-70 mt-0.5">Add to existing data</p>
                            </button>
                        </div>

                        {/* Section checkboxes */}
                        <div className="space-y-2">
                            <CheckboxRow
                                checked={options.importSourceModel}
                                onChange={(v) => setOption("importSourceModel", v)}
                                label='Import source model from "Source Nodes" sheet'
                                disabled={!importResult?.counts.sourceNodes}
                                description={
                                    importResult?.counts.sourceNodes
                                        ? `${importResult.counts.sourceNodes} nodes found`
                                        : "Not found in file"
                                }
                            />
                            <CheckboxRow
                                checked={options.importTargetModel}
                                onChange={(v) => setOption("importTargetModel", v)}
                                label='Import target model from "Target Nodes" sheet'
                                disabled={!importResult?.counts.targetNodes}
                                description={
                                    importResult?.counts.targetNodes
                                        ? `${importResult.counts.targetNodes} nodes found`
                                        : "Not found in file"
                                }
                            />
                            <CheckboxRow
                                checked={options.importRefs}
                                onChange={(v) => setOption("importRefs", v)}
                                label='Import references from "References" sheet'
                                disabled={!importResult?.counts.references}
                                description={
                                    importResult?.counts.references
                                        ? `${importResult.counts.references} mappings found`
                                        : "Not found in file"
                                }
                            />
                            <CheckboxRow
                                checked={options.importGlobalVars}
                                onChange={(v) => setOption("importGlobalVars", v)}
                                label="Import global variables"
                                disabled={!importResult?.counts.globalVariables}
                                description={
                                    importResult?.counts.globalVariables
                                        ? `${importResult.counts.globalVariables} variables found`
                                        : "Not found in file"
                                }
                            />
                            <CheckboxRow
                                checked={options.importLookupTables}
                                onChange={(v) => setOption("importLookupTables", v)}
                                label="Import lookup tables"
                                disabled={!importResult?.counts.lookupTables}
                                description={
                                    importResult?.counts.lookupTables
                                        ? `${importResult.counts.lookupTables} tables found`
                                        : "Not found in file"
                                }
                            />
                            <CheckboxRow
                                checked={options.importFunctions}
                                onChange={(v) => setOption("importFunctions", v)}
                                label="Import functions"
                                disabled={!importResult?.counts.functions}
                                description={
                                    importResult?.counts.functions
                                        ? `${importResult.counts.functions} functions found`
                                        : "Not found in file"
                                }
                            />
                        </div>
                    </div>
                )}

                {/* ── Step 3: Preview ─────────────────────────────────────────────────── */}
                {step === 3 && importResult && (
                    <div className="py-2 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Review the data found in the file before importing.
                        </p>

                        {/* Summary counts */}
                        <div className="rounded-xl border border-glass-border bg-glass-bg/30 p-3 space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                Data Summary
                            </p>
                            <CountBadge
                                count={importResult.counts.sourceNodes}
                                label="Source nodes"
                            />
                            <CountBadge
                                count={importResult.counts.targetNodes}
                                label="Target nodes"
                            />
                            <CountBadge count={importResult.counts.references} label="References" />
                            <CountBadge
                                count={importResult.counts.globalVariables}
                                label="Global variables"
                            />
                            <CountBadge
                                count={importResult.counts.lookupTables}
                                label="Lookup tables"
                            />
                            <CountBadge count={importResult.counts.functions} label="Functions" />
                        </div>

                        {/* Warnings */}
                        {importResult.errors.length > 0 && (
                            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 max-h-32 overflow-y-auto">
                                <p className="text-xs font-medium text-destructive mb-1">
                                    Import warnings ({importResult.errors.length})
                                </p>
                                {importResult.errors.map((err, i) => (
                                    <p key={i} className="text-xs text-destructive/80">
                                        {err.sheet}
                                        {err.row ? ` row ${err.row}` : ""}: {err.message}
                                    </p>
                                ))}
                            </div>
                        )}

                        {!canImport && (
                            <p className="text-xs text-muted-foreground bg-secondary/10 border border-glass-border rounded-lg px-3 py-2">
                                No data found to import. The file may not be a valid mapper export.
                            </p>
                        )}
                    </div>
                )}

                {/* ── Footer ───────────────────────────────────────────────────────────── */}
                <DialogFooter>
                    {/* Back */}
                    {step > 1 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full"
                            onClick={() => setStep((s) => s - 1)}
                        >
                            Back
                        </Button>
                    )}

                    {/* Cancel */}
                    <Button variant="ghost" size="sm" className="rounded-full" onClick={onClose}>
                        Cancel
                    </Button>

                    {/* Next / Import */}
                    {step < 3 ? (
                        <Button
                            size="sm"
                            className="rounded-full"
                            onClick={() => setStep((s) => s + 1)}
                            disabled={step === 1 ? !canProceedToStep2 : false}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            className="rounded-full bg-accent hover:bg-accent/90 text-accent-foreground"
                            onClick={handleImport}
                            disabled={!canImport}
                        >
                            Import
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
