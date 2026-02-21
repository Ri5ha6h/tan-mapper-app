import { useEffect, useRef, useState } from "react"
import MonacoEditor from "@monaco-editor/react"
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Loader2,
    Play,
    RotateCcw,
    Terminal,
} from "lucide-react"

import type { TemplateType } from "@/lib/mapper/engine"
import type { MapperState } from "@/lib/mapper/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { detectTemplateType, executeScript, generateScript } from "@/lib/mapper/engine"
import { useMapperStore } from "@/lib/mapper/store"
import { treeToSample } from "@/lib/mapper/tree-to-sample"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusType = "idle" | "running" | "success" | "error"

interface Status {
    type: StatusType
    message: string
}

export interface ExecuteDialogProps {
    open: boolean
    onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTemplateType(state: MapperState): TemplateType {
    try {
        return detectTemplateType(state)
    } catch {
        return "json_to_json"
    }
}

function srcLang(type: TemplateType): "json" | "xml" {
    return type.startsWith("xml") ? "xml" : "json"
}

function tgtLang(type: TemplateType): "json" | "xml" {
    return type.endsWith("xml") ? "xml" : "json"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusLabel({ status }: { status: Status }) {
    const colors: Record<StatusType, string> = {
        idle: "text-muted-foreground",
        running: "text-primary animate-pulse",
        success: "text-accent",
        error: "text-destructive",
    }
    return <span className={cn("text-sm font-medium", colors[status.type])}>{status.message}</span>
}

interface TypeSelectorProps {
    value: TemplateType
    onChange: (v: TemplateType) => void
}

function TypeSelector({ value, onChange }: TypeSelectorProps) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as TemplateType)}>
            <SelectTrigger size="sm" className="w-36 rounded-full text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="json_to_json">JSON → JSON</SelectItem>
                <SelectItem value="xml_to_json">XML → JSON</SelectItem>
                <SelectItem value="json_to_xml">JSON → XML</SelectItem>
                <SelectItem value="xml_to_xml">XML → XML</SelectItem>
            </SelectContent>
        </Select>
    )
}

interface PaneHeaderProps {
    label: string
    type: string
    side: "source" | "target"
}

function PaneHeader({ label, type, side }: PaneHeaderProps) {
    const badgeClass =
        side === "source"
            ? "border-source/30 text-source bg-source/10"
            : "border-target/30 text-target bg-target/10"
    return (
        <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 border-b border-glass-border bg-glass-bg/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {label}
            </span>
            <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 rounded-full", badgeClass)}
            >
                {type}
            </Badge>
        </div>
    )
}

interface ScriptPaneHeaderProps {
    visible: boolean
    isModified: boolean
    onToggle: () => void
    onReset: () => void
}

function ScriptPaneHeader({ visible, isModified, onToggle, onReset }: ScriptPaneHeaderProps) {
    return (
        <div className="shrink-0 px-2 py-1.5 flex items-center justify-between gap-1 border-b border-glass-border bg-glass-bg/50">
            {visible && (
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        Generated Script
                    </span>
                    {isModified && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 whitespace-nowrap">
                            Modified
                        </span>
                    )}
                    {isModified && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground gap-0.5"
                            onClick={onReset}
                            title="Regenerate script from mapper state"
                        >
                            <RotateCcw className="h-2.5 w-2.5" />
                            Reset
                        </Button>
                    )}
                </div>
            )}
            <Button
                variant="ghost"
                size="sm"
                className={cn("h-5 w-5 rounded-full p-0 shrink-0", !visible && "mx-auto")}
                onClick={onToggle}
                title={visible ? "Hide script" : "Show generated script"}
            >
                {visible ? (
                    <ChevronLeft className="h-3 w-3" />
                ) : (
                    <ChevronRight className="h-3 w-3" />
                )}
            </Button>
        </div>
    )
}

// ─── Monaco options ───────────────────────────────────────────────────────────

const MONACO_FONT = "Geist Mono Variable, monospace"

const editorOptions = {
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: MONACO_FONT,
    scrollBeyondLastLine: false,
    wordWrap: "on" as const,
    lineNumbers: "on" as const,
}

const readonlyEditorOptions = {
    ...editorOptions,
    readOnly: true,
    fontSize: 12,
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExecuteDialog({ open, onClose }: ExecuteDialogProps) {
    const state = useMapperStore((s) => s.mapperState)

    const [templateType, setTemplateType] = useState<TemplateType>(() => resolveTemplateType(state))
    const [inputText, setInputText] = useState(() => {
        if (state.sourceOriginalContent) return state.sourceOriginalContent
        const lang = resolveTemplateType(state).startsWith("xml") ? "xml" : "json"
        return treeToSample(state.sourceTreeNode, lang)
    })
    const [scriptText, setScriptText] = useState("")
    const [isScriptModified, setIsScriptModified] = useState(false)
    const [outputText, setOutputText] = useState("")
    const [consoleLogs, setConsoleLogs] = useState<string[]>([])
    const [consoleExpanded, setConsoleExpanded] = useState(false)
    const [scriptPaneVisible, setScriptPaneVisible] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [status, setStatus] = useState<Status>({ type: "idle", message: "Ready" })

    // Re-detect template type when state changes (e.g. different model loaded)
    const prevStateRef = useRef(state)
    useEffect(() => {
        if (state !== prevStateRef.current) {
            // Invalidate cached script when mapper state changes
            setScriptText("")
            setIsScriptModified(false)
            prevStateRef.current = state
        }
    }, [state])

    // Re-populate input from source tree (or original file content) when the dialog opens or source tree changes
    const sourceTreeNode = state.sourceTreeNode
    const sourceOriginalContent = state.sourceOriginalContent ?? null
    useEffect(() => {
        if (open) {
            if (sourceOriginalContent) {
                setInputText(sourceOriginalContent)
            } else {
                const lang = templateType.startsWith("xml") ? "xml" : "json"
                const sample = treeToSample(sourceTreeNode, lang)
                setInputText(sample)
            }
        }
        // templateType is intentionally excluded — we only re-populate when the dialog opens or source changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sourceTreeNode, sourceOriginalContent])

    // Sync template type when state's input types change
    useEffect(() => {
        setTemplateType(resolveTemplateType(state))
    }, [state.sourceInputType, state.targetInputType])

    const inputLang = srcLang(templateType)
    const outputLang = tgtLang(templateType)
    const [srcType, tgtType] = templateType.split("_to_") as ["json" | "xml", "json" | "xml"]

    const hasSourceTree = !!state.sourceTreeNode
    const hasTargetTree = !!state.targetTreeNode
    const canRun = hasSourceTree && hasTargetTree && !!inputText.trim() && !isRunning

    function handleGenerateScript() {
        try {
            const script = generateScript(state, srcType, tgtType)
            setScriptText(script)
            setIsScriptModified(false)
            setScriptPaneVisible(true)
            setStatus({ type: "idle", message: "Script generated" })
        } catch (err) {
            setStatus({
                type: "error",
                message: err instanceof Error ? err.message : "Script generation failed",
            })
        }
    }

    function handleResetScript() {
        try {
            const script = generateScript(state, srcType, tgtType)
            setScriptText(script)
            setIsScriptModified(false)
            setStatus({ type: "idle", message: "Script regenerated" })
        } catch (err) {
            setStatus({
                type: "error",
                message: err instanceof Error ? err.message : "Script generation failed",
            })
        }
    }

    async function handleRun() {
        const input = inputText.trim()
        if (!input) {
            setStatus({ type: "error", message: "Please provide input data" })
            return
        }

        setIsRunning(true)
        setStatus({ type: "running", message: "Running..." })
        setOutputText("")
        setConsoleLogs([])

        try {
            // Use whatever is currently in the script editor (hand-edited or auto-generated)
            // Only auto-generate if no script exists yet
            let script = scriptText
            if (!script) {
                script = generateScript(state, srcType, tgtType)
                setScriptText(script)
                setIsScriptModified(false)
            }

            const result = await executeScript(script, input, state.localContext)

            // Show captured logs and auto-expand if any exist
            if (result.logs.length > 0) {
                setConsoleLogs(result.logs)
                setConsoleExpanded(true)
            }

            if (result.error) {
                setOutputText(`ERROR:\n${result.error}`)
                setStatus({
                    type: "error",
                    message: `Error (${result.durationMs.toFixed(0)}ms)`,
                })
                // Auto-show script pane on error for debugging
                setScriptPaneVisible(true)
            } else {
                setOutputText(result.output)
                setStatus({
                    type: "success",
                    message: `Done (${result.durationMs.toFixed(0)}ms)`,
                })
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setOutputText(`ERROR:\n${msg}`)
            setStatus({ type: "error", message: "Error" })
            setScriptPaneVisible(true)
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose()
            }}
        >
            <DialogContent
                showClose={false}
                className="p-0 overflow-hidden"
                style={{
                    maxWidth: "92vw",
                    width: "92vw",
                    height: "88vh",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* ── Header ── */}
                <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b border-glass-border mb-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <DialogTitle className="text-lg font-semibold">Execute Mapper</DialogTitle>
                        <TypeSelector value={templateType} onChange={setTemplateType} />

                        {/* Missing model warning */}
                        {(!hasSourceTree || !hasTargetTree) && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>
                                    {!hasSourceTree && !hasTargetTree
                                        ? "No source or target model loaded"
                                        : !hasSourceTree
                                          ? "No source model loaded"
                                          : "No target model loaded"}
                                </span>
                            </div>
                        )}

                        <div className="flex gap-2 ml-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full"
                                onClick={handleGenerateScript}
                                disabled={!hasSourceTree || !hasTargetTree}
                                title="Generate and view the transformation script"
                            >
                                View Script
                            </Button>
                            <Button
                                size="sm"
                                className="rounded-full"
                                onClick={handleRun}
                                disabled={!canRun}
                                title={
                                    !hasSourceTree || !hasTargetTree
                                        ? "Load source and target models first"
                                        : !inputText.trim()
                                          ? "Enter input data first"
                                          : "Run transformation"
                                }
                            >
                                {isRunning ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                ) : (
                                    <Play className="h-3.5 w-3.5 mr-1" />
                                )}
                                Run
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* ── Main content — 3 panes ── */}
                <div className="flex-1 flex min-h-0">
                    {/* Input pane */}
                    <div className="flex flex-col flex-1 min-w-0 min-h-0">
                        <PaneHeader label="Input" type={inputLang.toUpperCase()} side="source" />
                        <div className="flex-1 min-h-0">
                            <MonacoEditor
                                height="100%"
                                theme="vs-dark"
                                language={inputLang}
                                value={inputText}
                                onChange={(v) => setInputText(v ?? "")}
                                options={editorOptions}
                            />
                        </div>
                    </div>

                    {/* Script pane (collapsible) */}
                    <div
                        className={cn(
                            "flex flex-col border-l border-glass-border transition-all duration-200",
                            scriptPaneVisible ? "flex-1 min-w-0" : "w-8 shrink-0",
                        )}
                    >
                        <ScriptPaneHeader
                            visible={scriptPaneVisible}
                            isModified={isScriptModified}
                            onToggle={() => setScriptPaneVisible((v) => !v)}
                            onReset={handleResetScript}
                        />
                        {scriptPaneVisible && (
                            <div className="flex-1 min-h-0">
                                <MonacoEditor
                                    height="100%"
                                    theme="vs-dark"
                                    language="javascript"
                                    value={scriptText}
                                    onChange={(v) => {
                                        setScriptText(v ?? "")
                                        setIsScriptModified(true)
                                    }}
                                    options={editorOptions}
                                />
                            </div>
                        )}
                    </div>

                    {/* Output pane */}
                    <div className="flex flex-col flex-1 min-w-0 min-h-0 border-l border-glass-border">
                        <PaneHeader label="Output" type={outputLang.toUpperCase()} side="target" />

                        {/* Console log section — collapsible, auto-expands when logs present */}
                        {consoleLogs.length > 0 && (
                            <div className="shrink-0 border-b border-glass-border bg-[oklch(0.15_0.01_240/0.8)]">
                                <button
                                    type="button"
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setConsoleExpanded((v) => !v)}
                                >
                                    <Terminal className="h-3 w-3 text-accent shrink-0" />
                                    <span className="font-mono font-medium text-accent">
                                        Console
                                    </span>
                                    <span className="ml-1 text-muted-foreground/60">
                                        ({consoleLogs.length}{" "}
                                        {consoleLogs.length === 1 ? "message" : "messages"})
                                    </span>
                                    <ChevronDown
                                        className={cn(
                                            "h-3 w-3 ml-auto transition-transform duration-150",
                                            consoleExpanded && "rotate-180",
                                        )}
                                    />
                                </button>
                                {consoleExpanded && (
                                    <div className="max-h-36 overflow-y-auto px-3 pb-2 flex flex-col gap-0.5">
                                        {consoleLogs.map((log, i) => (
                                            <pre
                                                key={i}
                                                className={cn(
                                                    "text-[11px] font-mono whitespace-pre-wrap break-all",
                                                    log.startsWith("[error]")
                                                        ? "text-destructive"
                                                        : log.startsWith("[warn]")
                                                          ? "text-amber-400"
                                                          : "text-foreground/80",
                                                )}
                                            >
                                                {log}
                                            </pre>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex-1 min-h-0">
                            <MonacoEditor
                                height="100%"
                                theme="vs-dark"
                                language={outputLang}
                                value={outputText}
                                options={{
                                    ...readonlyEditorOptions,
                                    fontSize: 13,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Footer ── */}
                <DialogFooter className="shrink-0 px-6 py-3 border-t border-glass-border flex items-center mt-0">
                    <StatusLabel status={status} />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full ml-auto"
                        onClick={onClose}
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
