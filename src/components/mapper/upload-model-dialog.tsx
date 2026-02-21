import * as React from "react"
import { Check, Database, FileCode, FileJson, Globe, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useMapperStore } from "@/lib/mapper/store"
import { parseJSON, parseXML } from "@/lib/mapper/parsers"
import { fromParserTreeNode } from "@/lib/mapper/node-utils"
import type { ApplyMethod, InputType, MapperNodeType, MapperTreeNode } from "@/lib/mapper/types"
import { cn } from "@/lib/utils"

// ─── Props ─────────────────────────────────────────────────────────────────────

interface UploadModelDialogProps {
    open: boolean
    onClose: () => void
    side: "source" | "target"
}

// ─── Step indicator ────────────────────────────────────────────────────────────

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

// ─── Method card ───────────────────────────────────────────────────────────────

interface MethodCardProps {
    active?: boolean
    disabled?: boolean
    icon: React.ReactNode
    label: string
    comingSoon?: boolean
    onClick?: () => void
}

function MethodCard({ active, disabled, icon, label, comingSoon, onClick }: MethodCardProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={comingSoon ? "Available in a future release" : undefined}
            className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-xl p-4",
                "border transition-all text-sm font-medium",
                "bg-glass-bg/50 backdrop-blur-sm",
                active
                    ? "border-primary bg-primary/10 text-foreground"
                    : disabled
                      ? "border-glass-border text-muted-foreground/40 cursor-not-allowed opacity-50"
                      : "border-glass-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5 cursor-pointer",
            )}
        >
            {icon}
            <span>{label}</span>
            {comingSoon && (
                <span className="absolute top-1.5 right-2 text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    Soon
                </span>
            )}
        </button>
    )
}

// ─── Apply method descriptions ─────────────────────────────────────────────────

const APPLY_METHOD_DESCRIPTIONS: Record<ApplyMethod, string> = {
    REPLACE: "Replace the entire model. All existing references will be cleared.",
    ADD_ONLY:
        "Only add new nodes from the uploaded model. Existing nodes and references are preserved.",
    DELETE_ONLY: "Only remove nodes no longer in the new model. No new nodes are added.",
    MERGE: "Add new nodes and remove deleted ones. Unchanged nodes and their references are preserved.",
    RESET: "Full reset: replaces model and clears all references, context variables, and functions.",
}

// ─── NodeTypeIcon (local, same as tree-node) ───────────────────────────────────

function NodeTypeIcon({ type }: { type: MapperNodeType }) {
    const config: Record<MapperNodeType, { label: string; className: string }> = {
        element: { label: "{}", className: "bg-secondary/20 text-secondary" },
        array: { label: "[]", className: "bg-accent/20 text-accent" },
        arrayChild: { label: "·", className: "bg-accent/15 text-accent/70" },
        attribute: { label: "@", className: "bg-amber-500/20 text-amber-400" },
        code: { label: "</>", className: "bg-primary/20 text-primary" },
    }
    const { label, className } = config[type] ?? config.element
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center w-4 h-4 rounded-full",
                "text-[9px] font-mono font-semibold shrink-0",
                className,
            )}
        >
            {label}
        </span>
    )
}

// ─── Model preview (mini tree, first 2 levels) ─────────────────────────────────

function PreviewNode({
    node,
    level,
    maxLevel,
}: {
    node: MapperTreeNode
    level: number
    maxLevel: number
}) {
    if (level > maxLevel) return null
    return (
        <div style={{ paddingLeft: level * 12 }}>
            <div className="flex items-center gap-1.5 py-0.5">
                <NodeTypeIcon type={node.type} />
                <span className="text-xs text-foreground">{node.name}</span>
                {node.children?.length ? (
                    <span className="text-xs text-muted-foreground ml-0.5">
                        ({node.children.length})
                    </span>
                ) : null}
            </div>
            {level < maxLevel &&
                node.children?.map((child) => (
                    <PreviewNode
                        key={child.id}
                        node={child}
                        level={level + 1}
                        maxLevel={maxLevel}
                    />
                ))}
        </div>
    )
}

function ModelPreview({ root }: { root: MapperTreeNode }) {
    // Count total nodes
    let nodeCount = 0
    function countNodes(n: MapperTreeNode) {
        nodeCount++
        n.children?.forEach(countNodes)
    }
    countNodes(root)

    return (
        <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-foreground">
                    Root: <span className="text-primary">{root.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">· {nodeCount} nodes total</span>
            </div>
            <div className="rounded-xl bg-glass-bg/40 border border-glass-border p-3 max-h-36 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                    Preview (first 2 levels)
                </p>
                <PreviewNode node={root} level={0} maxLevel={2} />
            </div>
        </div>
    )
}

// ─── Step 1: Select method ─────────────────────────────────────────────────────

function MethodSelectStep({ onNext }: { onNext: () => void }) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Choose how you want to import your data model.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <MethodCard
                    active
                    icon={<Upload className="h-5 w-5" />}
                    label="File Upload"
                    onClick={onNext}
                />
                <MethodCard
                    disabled
                    comingSoon
                    icon={<Globe className="h-5 w-5" />}
                    label="REST API"
                />
                <MethodCard
                    disabled
                    comingSoon
                    icon={<Database className="h-5 w-5" />}
                    label="Database"
                />
                <MethodCard
                    disabled
                    comingSoon
                    icon={<FileCode className="h-5 w-5" />}
                    label="EDI Standard"
                />
            </div>
        </div>
    )
}

// ─── Step 2: File upload ───────────────────────────────────────────────────────

interface FileUploadStepProps {
    side: "source" | "target"
    resultRoot: MapperTreeNode | null
    resultType: InputType | null
    onFileParsed: (root: MapperTreeNode, type: InputType, rawContent: string) => void
}

function FileUploadStep({ side, resultRoot, resultType, onFileParsed }: FileUploadStepProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = React.useState(false)
    const [fileName, setFileName] = React.useState<string | null>(null)
    const [parseError, setParseError] = React.useState<string | null>(null)

    async function handleFileAccepted(file: File) {
        setParseError(null)
        const text = await file.text()

        if (!text.trim()) {
            setParseError("File appears to be empty.")
            return
        }

        const ext = file.name.split(".").pop()?.toLowerCase()

        try {
            let parsedRoot: MapperTreeNode
            let detectedType: InputType

            if (ext === "json") {
                const parsed = parseJSON(text)
                parsedRoot = fromParserTreeNode(parsed)
                detectedType = "JSON"
            } else if (ext === "xml" || ext === "xsd") {
                const parsed = parseXML(text)
                parsedRoot = fromParserTreeNode(parsed)
                detectedType = "XML"
            } else {
                setParseError("Unsupported file type. Accepted: .json, .xml, .xsd")
                return
            }

            setFileName(file.name)
            onFileParsed(parsedRoot, detectedType, text)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to parse file."
            setParseError(`Parse error: ${message}`)
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileAccepted(file)
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(true)
    }

    function handleDragLeave() {
        setIsDragging(false)
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) handleFileAccepted(file)
        e.target.value = ""
    }

    const colorClass = side === "source" ? "text-source" : "text-target"

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Drop a file or click to browse. The format will be auto-detected.
            </p>

            <div
                className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                    isDragging
                        ? "border-primary bg-primary/5"
                        : "border-glass-border hover:border-primary/50 hover:bg-primary/3",
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
            >
                <Upload className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground" />
                <p className="text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .json, .xml, .xsd</p>
                <input
                    type="file"
                    accept=".json,.xml,.xsd"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full pointer-events-none"
                    tabIndex={-1}
                >
                    Browse File
                </Button>
            </div>

            {parseError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {parseError}
                </div>
            )}

            {resultRoot && !parseError && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        {resultType === "JSON" ? (
                            <FileJson className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <FileCode className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">
                            Detected format:{" "}
                            <span className={cn("font-semibold", colorClass)}>{resultType}</span>
                        </span>
                        {fileName && (
                            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                                — {fileName}
                            </span>
                        )}
                    </div>
                    <ModelPreview root={resultRoot} />
                </div>
            )}
        </div>
    )
}

// ─── Step 3: Select apply method ───────────────────────────────────────────────

interface ApplyMethodStepProps {
    side: "source" | "target"
    resultRoot: MapperTreeNode | null
    resultType: InputType | null
    applyMethod: ApplyMethod
    onApplyMethodChange: (method: ApplyMethod) => void
}

function ApplyMethodStep({
    side,
    resultRoot,
    resultType,
    applyMethod,
    onApplyMethodChange,
}: ApplyMethodStepProps) {
    const ALL_METHODS: ApplyMethod[] = ["REPLACE", "ADD_ONLY", "DELETE_ONLY", "MERGE", "RESET"]

    // Count nodes in existing tree
    const existingTree = useMapperStore((s) =>
        side === "source" ? s.mapperState.sourceTreeNode : s.mapperState.targetTreeNode,
    )

    function countNodes(n: MapperTreeNode): number {
        return 1 + (n.children?.reduce((sum, c) => sum + countNodes(c), 0) ?? 0)
    }

    const existingCount = existingTree ? countNodes(existingTree) : 0
    const newCount = resultRoot ? countNodes(resultRoot) : 0

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Choose how the new model should be merged with the existing one.
            </p>

            <div className="space-y-2">
                {ALL_METHODS.map((method) => (
                    <label
                        key={method}
                        className={cn(
                            "flex items-start gap-3 rounded-xl px-3 py-2.5 border cursor-pointer transition-all",
                            applyMethod === method
                                ? "border-primary bg-primary/10"
                                : "border-glass-border bg-glass-bg/40 hover:border-primary/40",
                        )}
                    >
                        <input
                            type="radio"
                            name="apply-method"
                            value={method}
                            checked={applyMethod === method}
                            onChange={() => onApplyMethodChange(method)}
                            className="mt-0.5 accent-[oklch(var(--primary))]"
                        />
                        <div>
                            <span className="text-sm font-medium">{method}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {APPLY_METHOD_DESCRIPTIONS[method]}
                            </p>
                        </div>
                    </label>
                ))}
            </div>

            {resultRoot && resultType && (
                <div className="rounded-lg bg-glass-bg/40 border border-glass-border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                    <p>
                        New model:{" "}
                        <span className="text-foreground font-medium">
                            {newCount} nodes ({resultType})
                        </span>
                    </p>
                    {existingCount > 0 && (
                        <p>
                            Existing model:{" "}
                            <span className="text-foreground font-medium">
                                {existingCount} nodes
                            </span>
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main dialog ───────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

export function UploadModelDialog({ open, onClose, side }: UploadModelDialogProps) {
    const [step, setStep] = React.useState<Step>(1)
    const [resultRoot, setResultRoot] = React.useState<MapperTreeNode | null>(null)
    const [resultType, setResultType] = React.useState<InputType | null>(null)
    const [resultRawContent, setResultRawContent] = React.useState<string | null>(null)
    const [applyMethod, setApplyMethod] = React.useState<ApplyMethod>("REPLACE")

    const applySourceModel = useMapperStore((s) => s.applySourceModel)
    const applyTargetModel = useMapperStore((s) => s.applyTargetModel)
    const snapshot = useMapperStore((s) => s.snapshot)

    // Reset state when dialog opens
    React.useEffect(() => {
        if (open) {
            setStep(1)
            setResultRoot(null)
            setResultType(null)
            setResultRawContent(null)
            setApplyMethod("REPLACE")
        }
    }, [open])

    function handleFileParsed(root: MapperTreeNode, type: InputType, rawContent: string) {
        setResultRoot(root)
        setResultType(type)
        setResultRawContent(rawContent)
        setStep(3)
    }

    function handleNext() {
        if (step === 1) setStep(2)
        else if (step === 2 && resultRoot) setStep(3)
    }

    function handleBack() {
        setStep((s) => (s - 1) as Step)
    }

    function handleApply() {
        if (!resultRoot || !resultType) return

        snapshot()
        if (side === "source") {
            applySourceModel(resultRoot, resultType, applyMethod, resultRawContent)
        } else {
            applyTargetModel(resultRoot, resultType, applyMethod)
        }

        onClose()
    }

    const title = side === "source" ? "Load Source Model" : "Load Target Model"
    const canNext = step === 1 ? true : step === 2 ? !!resultRoot : false

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) onClose()
            }}
        >
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <StepIndicator current={step} total={3} />
                </DialogHeader>

                <div className="py-2">
                    {step === 1 && <MethodSelectStep onNext={() => setStep(2)} />}
                    {step === 2 && (
                        <FileUploadStep
                            side={side}
                            resultRoot={resultRoot}
                            resultType={resultType}
                            onFileParsed={handleFileParsed}
                        />
                    )}
                    {step === 3 && (
                        <ApplyMethodStep
                            side={side}
                            resultRoot={resultRoot}
                            resultType={resultType}
                            applyMethod={applyMethod}
                            onApplyMethodChange={setApplyMethod}
                        />
                    )}
                </div>

                <DialogFooter>
                    {step > 1 && (
                        <Button variant="ghost" className="rounded-full" onClick={handleBack}>
                            ← Back
                        </Button>
                    )}
                    {step < 3 && step !== 1 && (
                        <Button className="rounded-full" onClick={handleNext} disabled={!canNext}>
                            Next →
                        </Button>
                    )}
                    {step === 1 && (
                        <Button className="rounded-full" onClick={() => setStep(2)}>
                            Next →
                        </Button>
                    )}
                    {step === 3 && (
                        <Button
                            className="rounded-full"
                            onClick={handleApply}
                            disabled={!resultRoot || !resultType}
                        >
                            Apply Model
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
