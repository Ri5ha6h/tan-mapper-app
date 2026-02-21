import { useState, useRef, useCallback } from "react"
import Editor from "@monaco-editor/react"
import { ChevronDown, ChevronRight, Code2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useMapperStore, useScriptLanguage } from "@/lib/mapper/store"
import { InsertValueMenu } from "./insert-value-menu"
import { cn } from "@/lib/utils"
import type { MapperTreeNode } from "@/lib/mapper/types"

interface ValueEditorProps {
    node: MapperTreeNode
}

// ─── Checkbox helper ─────────────────────────────────────────────────────────

interface CheckboxFieldProps {
    id: string
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
}

function CheckboxField({ id, label, checked, onChange }: CheckboxFieldProps) {
    return (
        <label htmlFor={id} className="flex items-center gap-1.5 cursor-pointer select-none group">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {label}
            </span>
        </label>
    )
}

// ─── ValueEditor ─────────────────────────────────────────────────────────────

export function ValueEditor({ node }: ValueEditorProps) {
    const updateTargetNode = useMapperStore((s) => s.updateTargetNode)
    const snapshot = useMapperStore((s) => s.snapshot)
    const scriptLanguage = useScriptLanguage()
    const editorLanguage = scriptLanguage === "groovy" ? "groovy" : "javascript"

    // Local controlled state — synced from node
    const [value, setValue] = useState(node.value ?? "")
    const [plainTextValue, setPlainTextValue] = useState(node.plainTextValue ?? false)
    const [debugComment, setDebugComment] = useState(node.debugComment ?? false)
    const [nonEmpty, setNonEmpty] = useState(node.nonEmpty ?? false)
    const [quote, setQuote] = useState(node.quote ?? false)
    const [comment, setComment] = useState(node.comment ?? "")
    const [format, setFormat] = useState(node.format ?? "")
    const [label, setLabel] = useState(node.label ?? "")
    const [errorMessage, setErrorMessage] = useState(node.errorMessage ?? "")
    const [customCode, setCustomCode] = useState(node.customCode ?? "")
    const [codeExpanded, setCodeExpanded] = useState(!!node.customCode)

    // Snapshot guard — only snapshot once per editing "session" on a node
    const hasSnapshotted = useRef(false)

    const ensureSnapshot = useCallback(() => {
        if (!hasSnapshotted.current) {
            snapshot()
            hasSnapshotted.current = true
        }
    }, [snapshot])

    // Sync local state when node ID changes
    const prevNodeId = useRef(node.id)
    if (prevNodeId.current !== node.id) {
        prevNodeId.current = node.id
        hasSnapshotted.current = false
        setValue(node.value ?? "")
        setPlainTextValue(node.plainTextValue ?? false)
        setDebugComment(node.debugComment ?? false)
        setNonEmpty(node.nonEmpty ?? false)
        setQuote(node.quote ?? false)
        setComment(node.comment ?? "")
        setFormat(node.format ?? "")
        setLabel(node.label ?? "")
        setErrorMessage(node.errorMessage ?? "")
        setCustomCode(node.customCode ?? "")
        setCodeExpanded(!!node.customCode)
    }

    const handleInsert = (text: string) => {
        ensureSnapshot()
        const newVal = value ? `${value}${text}` : text
        setValue(newVal)
        updateTargetNode(node.id, { value: newVal })
    }

    // ── Code node: full Monaco editor ────────────────────────────────────────
    if (node.type === "code") {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-glass-border">
                    <Editor
                        defaultLanguage={editorLanguage}
                        language={editorLanguage}
                        value={value}
                        theme="vs-dark"
                        options={{
                            fontSize: 12,
                            minimap: { enabled: false },
                            lineNumbers: "on",
                            scrollBeyondLastLine: false,
                            padding: { top: 8, bottom: 8 },
                            folding: false,
                            wordWrap: "on",
                        }}
                        onChange={(v) => {
                            ensureSnapshot()
                            const newVal = v ?? ""
                            setValue(newVal)
                            updateTargetNode(node.id, { value: newVal })
                        }}
                    />
                </div>
            </div>
        )
    }

    // ── Regular node ──────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
            {/* Row 1: value input + insert menu */}
            <div className="flex gap-2 items-center">
                <Input
                    className="flex-1 h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="Expression or value..."
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateTargetNode(node.id, { value: e.target.value })
                    }}
                />
                <InsertValueMenu onInsert={handleInsert} />
            </div>

            {/* Row 2: checkboxes */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <CheckboxField
                    id={`${node.id}-plain`}
                    label="Plain Text"
                    checked={plainTextValue}
                    onChange={(v) => {
                        ensureSnapshot()
                        setPlainTextValue(v)
                        updateTargetNode(node.id, { plainTextValue: v })
                    }}
                />
                <CheckboxField
                    id={`${node.id}-debug`}
                    label="Debug Comment"
                    checked={debugComment}
                    onChange={(v) => {
                        ensureSnapshot()
                        setDebugComment(v)
                        updateTargetNode(node.id, { debugComment: v })
                    }}
                />
                <CheckboxField
                    id={`${node.id}-nonempty`}
                    label="Non-Empty"
                    checked={nonEmpty}
                    onChange={(v) => {
                        ensureSnapshot()
                        setNonEmpty(v)
                        updateTargetNode(node.id, { nonEmpty: v })
                    }}
                />
                <CheckboxField
                    id={`${node.id}-quote`}
                    label="Quote"
                    checked={quote}
                    onChange={(v) => {
                        ensureSnapshot()
                        setQuote(v)
                        updateTargetNode(node.id, { quote: v })
                    }}
                />
            </div>

            {/* Comment textarea */}
            <Textarea
                className="text-sm min-h-[64px] resize-none bg-glass-bg/50 border-glass-border"
                placeholder="Rule description / comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={(e) => {
                    ensureSnapshot()
                    updateTargetNode(node.id, { comment: e.target.value })
                }}
            />

            {/* Row 3: format + label */}
            <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Format</Label>
                    <Input
                        className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                        placeholder="e.g. yyyy-MM-dd"
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        onBlur={(e) => {
                            ensureSnapshot()
                            updateTargetNode(node.id, { format: e.target.value })
                        }}
                    />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                        className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                        placeholder="Display label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onBlur={(e) => {
                            ensureSnapshot()
                            updateTargetNode(node.id, { label: e.target.value })
                        }}
                    />
                </div>
            </div>

            {/* Row 4: error message */}
            <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Error Message</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="Custom validation error message"
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateTargetNode(node.id, { errorMessage: e.target.value })
                    }}
                />
            </div>

            {/* Custom Code editor (collapsible) */}
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={() => setCodeExpanded((v) => !v)}
                    className={cn(
                        "flex items-center gap-1.5 text-xs font-medium transition-colors select-none",
                        codeExpanded
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {codeExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Code2 className="h-3.5 w-3.5" />
                    Custom Code
                    {customCode && !codeExpanded && (
                        <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                </button>

                {codeExpanded && (
                    <div
                        className="rounded-xl overflow-hidden border border-glass-border"
                        style={{ height: 160 }}
                    >
                        <Editor
                            height="160px"
                            defaultLanguage={editorLanguage}
                            language={editorLanguage}
                            value={customCode}
                            theme="vs-dark"
                            options={{
                                fontSize: 12,
                                minimap: { enabled: false },
                                lineNumbers: "on",
                                scrollBeyondLastLine: false,
                                padding: { top: 6, bottom: 6 },
                                folding: false,
                                wordWrap: "on",
                                fontFamily: "Geist Mono Variable, monospace",
                            }}
                            onChange={(v) => {
                                ensureSnapshot()
                                const newVal = v ?? ""
                                setCustomCode(newVal)
                                updateTargetNode(node.id, { customCode: newVal })
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
