import { useState } from "react"
import MonacoEditor from "@monaco-editor/react"
import {
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Clock,
    Loader2,
    MinusCircle,
    Play,
    XCircle,
} from "lucide-react"

import type { ChainStepResult, MapChainLink } from "@/lib/mapchain/types"
import { executeChain } from "@/lib/mapchain/chain-engine"
import { useMapChainStore } from "@/lib/mapchain/store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChainExecuteDialogProps {
    open: boolean
    onClose: () => void
}

// ─── Status icons ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ChainStepResult["status"] }) {
    switch (status) {
        case "pending":
            return <Clock className="h-4 w-4 text-muted-foreground" />
        case "running":
            return <Loader2 className="h-4 w-4 text-primary animate-spin" />
        case "done":
            return <CheckCircle className="h-4 w-4 text-accent" />
        case "error":
            return <XCircle className="h-4 w-4 text-destructive" />
        case "skipped":
            return <MinusCircle className="h-4 w-4 text-muted-foreground" />
    }
}

// ─── Step row ──────────────────────────────────────────────────────────────────

interface StepRowProps {
    link: MapChainLink
    result: ChainStepResult
    index: number
}

function StepRow({ link, result, index }: StepRowProps) {
    const [showOutput, setShowOutput] = useState(false)

    return (
        <div
            className={cn(
                "rounded-xl border border-glass-border/50 p-3 transition-colors",
                result.status === "running" && "border-primary/30 bg-primary/5",
                result.status === "error" && "border-destructive/30 bg-destructive/5",
                result.status === "done" && "border-accent/20",
            )}
        >
            <div className="flex items-center gap-3">
                {/* Step number */}
                <div className="h-5 w-5 rounded-full bg-muted/30 text-muted-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                    {index + 1}
                </div>

                {/* Type badge */}
                <Badge
                    className={cn(
                        "rounded-full text-xs border",
                        link.type === "JT_MAP"
                            ? "bg-source/10 text-source border-source/20"
                            : "bg-secondary/10 text-secondary border-secondary/20",
                    )}
                >
                    {link.type === "JT_MAP" ? "Map" : "Script"}
                </Badge>

                {/* Name */}
                <span className="text-sm font-medium truncate flex-1">
                    {link.type === "JT_MAP"
                        ? (link.mapName ?? "Map step")
                        : (link.scriptName ?? "Inline Script")}
                </span>

                {/* Duration */}
                {result.status === "done" && result.durationMs > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                        {result.durationMs.toFixed(0)}ms
                    </span>
                )}

                {/* Status icon */}
                <StatusIcon status={result.status} />

                {/* Toggle output */}
                {(result.status === "done" || result.status === "error") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full shrink-0"
                        onClick={() => setShowOutput((s) => !s)}
                        title={showOutput ? "Hide output" : "View output"}
                    >
                        {showOutput ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                    </Button>
                )}
            </div>

            {/* Error message */}
            {result.status === "error" && result.error && (
                <p className="mt-2 text-xs text-destructive font-mono bg-destructive/5 rounded-lg px-3 py-2 break-all">
                    {result.error}
                </p>
            )}

            {/* Expandable output */}
            {showOutput && result.output && (
                <div className="mt-2 rounded-lg overflow-hidden border border-glass-border/50 h-28">
                    <MonacoEditor
                        height="100%"
                        theme="vs-dark"
                        language="json"
                        value={result.output}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 11,
                            fontFamily: "Geist Mono Variable, monospace",
                            lineNumbers: "off",
                            scrollBeyondLastLine: false,
                            wordWrap: "on",
                            padding: { top: 6, bottom: 6 },
                        }}
                    />
                </div>
            )}
        </div>
    )
}

// ─── ChainExecuteDialog ────────────────────────────────────────────────────────

export function ChainExecuteDialog({ open, onClose }: ChainExecuteDialogProps) {
    const chain = useMapChainStore((s) => s.chain)
    const setTestInput = useMapChainStore((s) => s.setTestInput)

    const links = chain.links
    const initialInput = chain.testInput ?? ""

    const [inputText, setInputText] = useState(initialInput)
    const [finalOutput, setFinalOutput] = useState("")
    const [isRunning, setIsRunning] = useState(false)
    const [stepResults, setStepResults] = useState<Array<ChainStepResult>>(() =>
        links.map((l) => ({
            linkId: l.id,
            status: "pending" as const,
            output: "",
            error: null,
            durationMs: 0,
        })),
    )

    function handleInputChange(value: string) {
        setInputText(value)
        setTestInput(value)
    }

    async function handleRun() {
        if (isRunning || !inputText.trim()) return

        setIsRunning(true)
        setFinalOutput("")

        // Reset all steps to pending
        setStepResults(
            links.map((l) => ({
                linkId: l.id,
                status: "pending" as const,
                output: "",
                error: null,
                durationMs: 0,
            })),
        )

        await executeChain(links, inputText, {
            onStepStart(linkId) {
                setStepResults((prev) =>
                    prev.map((r) =>
                        r.linkId === linkId ? { ...r, status: "running" as const } : r,
                    ),
                )
            },
            onStepComplete(result) {
                setStepResults((prev) => prev.map((r) => (r.linkId === result.linkId ? result : r)))
            },
            onChainComplete(output) {
                setFinalOutput(output)
                setIsRunning(false)
            },
            onChainError(_linkId, _error) {
                setIsRunning(false)
            },
        })
    }

    const canRun = !isRunning && inputText.trim().length > 0 && links.length > 0

    // Sync step results array when links change (dialog re-open)
    const syncedResults = links.map((l) => {
        const existing = stepResults.find((r) => r.linkId === l.id)
        return (
            existing ?? {
                linkId: l.id,
                status: "pending" as const,
                output: "",
                error: null,
                durationMs: 0,
            }
        )
    })

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="w-[90vw] max-w-[90vw] h-[85vh] flex flex-col p-0 gap-0"
                showClose={false}
            >
                {/* Header */}
                <DialogHeader className="shrink-0 px-6 pt-5 pb-0 mb-0">
                    <DialogTitle className="flex items-center gap-3">
                        <Play className="h-5 w-5 text-accent" />
                        Execute Map Chain
                        {isRunning && (
                            <span className="text-sm font-normal text-primary animate-pulse ml-2">
                                Running…
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {/* Main content */}
                <div className="flex flex-1 min-h-0 gap-0 px-6 py-4">
                    {/* Left pane — I/O */}
                    <div className="flex flex-col w-[40%] min-w-0 gap-3 pr-4 border-r border-glass-border/50">
                        {/* Input */}
                        <div className="flex flex-col flex-1 min-h-0 gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                                Input
                            </span>
                            <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-glass-border">
                                <MonacoEditor
                                    height="100%"
                                    theme="vs-dark"
                                    language="json"
                                    value={inputText}
                                    onChange={(v) => handleInputChange(v ?? "")}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 12,
                                        fontFamily: "Geist Mono Variable, monospace",
                                        scrollBeyondLastLine: false,
                                        wordWrap: "on",
                                        padding: { top: 8, bottom: 8 },
                                    }}
                                />
                            </div>
                        </div>

                        {/* Output */}
                        <div className="flex flex-col flex-1 min-h-0 gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                                Output
                            </span>
                            <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-glass-border">
                                <MonacoEditor
                                    height="100%"
                                    theme="vs-dark"
                                    language="json"
                                    value={finalOutput}
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: false },
                                        fontSize: 12,
                                        fontFamily: "Geist Mono Variable, monospace",
                                        scrollBeyondLastLine: false,
                                        wordWrap: "on",
                                        padding: { top: 8, bottom: 8 },
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right pane — Step-by-step grid */}
                    <div className="flex flex-col flex-1 min-w-0 pl-4 gap-2 overflow-y-auto">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                            Steps ({links.length})
                        </span>

                        {links.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No steps in this chain.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {links.map((link, index) => (
                                    <StepRow
                                        key={link.id}
                                        link={link}
                                        result={syncedResults[index]}
                                        index={index}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="shrink-0 border-t border-glass-border/50 px-6 py-4 mt-0">
                    <div className="flex items-center gap-2 w-full">
                        <Button
                            className="rounded-full gap-1.5 text-accent-foreground bg-accent hover:bg-accent/90"
                            onClick={handleRun}
                            disabled={!canRun}
                        >
                            {isRunning ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Play className="h-4 w-4" />
                            )}
                            {isRunning ? "Running…" : "Run"}
                        </Button>
                        <Button variant="ghost" className="rounded-full ml-auto" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
