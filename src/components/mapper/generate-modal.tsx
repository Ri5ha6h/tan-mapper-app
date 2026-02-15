import { useCallback, useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { Copy, Download, Play, X } from "lucide-react"
import type { DSLError } from "@/lib/mapper/dsl"
import { Button } from "@/components/ui/button"
import { useMapper } from "@/lib/mapper/context"
import {
    applyMappings,
    generateJSONOutput,
    generateXMLOutput,
    parseInput,
    treeToData,
} from "@/lib/mapper/engine"
import { generateDSL, parseDSL } from "@/lib/mapper/dsl"

interface GenerateModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function GenerateModal({ open, onOpenChange }: GenerateModalProps) {
    const { source, target, mappings, setMappings } = useMapper()

    const [script, setScript] = useState("")
    const [input, setInput] = useState("")
    const [output, setOutput] = useState("")
    const [errors, setErrors] = useState<Array<DSLError>>([])
    const [showErrorModal, setShowErrorModal] = useState(false)

    const [topHeight, setTopHeight] = useState(40)
    const [leftWidth, setLeftWidth] = useState(50)
    const [isDraggingH, setIsDraggingH] = useState(false)
    const [isDraggingV, setIsDraggingV] = useState(false)

    useEffect(() => {
        if (open && source && target) {
            const dsl = generateDSL(mappings)
            setScript(dsl)
            const sourceData = treeToData(source.tree)
            const sourceType = source.type
            if (sourceType === "json") {
                setInput(JSON.stringify(sourceData, null, 2))
            } else {
                setInput(generateXMLOutput(sourceData))
            }
        }
    }, [open, source, target, mappings])

    const handleRun = useCallback(() => {
        if (!source || !target) return

        const parseResult = parseDSL(script)
        setErrors(parseResult.errors)

        if (parseResult.errors.length > 0) {
            setShowErrorModal(true)
            return
        }

        if (parseResult.mappings.length === 0) {
            setErrors([{ line: 0, message: "No mappings defined" }])
            setShowErrorModal(true)
            return
        }

        setMappings(parseResult.mappings)

        try {
            const sourceData = parseInput(input, source.type)
            const targetTemplate = treeToData(target.tree) as Record<string, unknown>

            const { result } = applyMappings(sourceData, parseResult.mappings, targetTemplate)

            if (target.type === "json") {
                setOutput(generateJSONOutput(result))
            } else {
                setOutput(generateXMLOutput(result))
            }
        } catch (e) {
            setErrors([
                {
                    line: 0,
                    message: `Execution error: ${e instanceof Error ? e.message : "Unknown error"}`,
                },
            ])
            setShowErrorModal(true)
        }
    }, [script, input, source, target, setMappings])

    const handleCopy = useCallback(() => {
        const data = {
            script,
            input: input,
            output: output,
        }
        navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    }, [script, input, output])

    const handleDownload = useCallback(() => {
        const data = {
            script,
            input: input,
            output: output,
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "mapper-output-raw.json"
        a.click()
        URL.revokeObjectURL(url)
    }, [script, input, output])

    const handleOutputCopy = useCallback(() => {
        navigator.clipboard.writeText(output)
    }, [output])

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (isDraggingH) {
                const container = document.getElementById("generate-modal-container")
                if (container) {
                    const rect = container.getBoundingClientRect()
                    setLeftWidth(((e.clientX - rect.left) / rect.width) * 100)
                }
            }
            if (isDraggingV) {
                const container = document.getElementById("generate-modal-container")
                if (container) {
                    const rect = container.getBoundingClientRect()
                    setTopHeight(((e.clientY - rect.top) / rect.height) * 100)
                }
            }
        },
        [isDraggingH, isDraggingV],
    )

    const handleMouseUp = useCallback(() => {
        setIsDraggingH(false)
        setIsDraggingV(false)
    }, [])

    useEffect(() => {
        if (isDraggingH || isDraggingV) {
            document.addEventListener("mouseup", handleMouseUp)
            return () => document.removeEventListener("mouseup", handleMouseUp)
        }
    }, [isDraggingH, isDraggingV, handleMouseUp])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => onOpenChange(false)}
        >
            <div
                id="generate-modal-container"
                className="bg-background border rounded-lg shadow-xl w-[90vw] h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-lg font-semibold">Generate Output</h2>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download className="h-4 w-4 mr-1" />
                            Download JSON
                        </Button>
                        <Button
                            onClick={() =>
                                errors.length > 0 ? setShowErrorModal(true) : handleRun()
                            }
                            size="sm"
                            className="relative"
                        >
                            <Play className="h-4 w-4 mr-1" />
                            Run
                            {errors.length > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                    {errors.length}
                                </span>
                            )}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col overflow-hidden" onMouseMove={handleMouseMove}>
                    {/* Script pane */}
                    <div style={{ height: `${topHeight}%` }} className="relative">
                        <div className="absolute top-0 left-0 right-0 px-2 py-1 bg-muted/50 text-xs font-medium border-b">
                            Script
                        </div>
                        <div className="pt-6 h-full">
                            <Editor
                                height="100%"
                                language="plaintext"
                                value={script}
                                onChange={(v) => setScript(v ?? "")}
                                options={{
                                    minimap: { enabled: false },
                                    lineNumbers: "on",
                                    fontSize: 13,
                                    scrollBeyondLastLine: false,
                                    wordWrap: "on",
                                }}
                            />
                        </div>
                    </div>

                    {/* Horizontal divider */}
                    <div
                        className="h-1 bg-border cursor-row-resize hover:bg-primary/50 transition-colors"
                        onMouseDown={() => setIsDraggingV(true)}
                    />

                    {/* Input/Output panes */}
                    <div style={{ height: `${100 - topHeight}%` }} className="flex">
                        {/* Input pane */}
                        <div style={{ width: `${leftWidth}%` }} className="relative border-r">
                            <div className="absolute top-0 left-0 right-0 px-2 py-1 bg-muted/50 text-xs font-medium border-b">
                                Input ({source?.type ?? "N/A"})
                            </div>
                            <div className="pt-6 h-full">
                                <Editor
                                    height="100%"
                                    language={source?.type === "xml" ? "xml" : "json"}
                                    value={input}
                                    onChange={(v) => setInput(v ?? "")}
                                    options={{
                                        minimap: { enabled: false },
                                        lineNumbers: "on",
                                        fontSize: 13,
                                        scrollBeyondLastLine: false,
                                        readOnly: false,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Vertical divider */}
                        <div
                            className="w-1 bg-border cursor-col-resize hover:bg-primary/50 transition-colors"
                            onMouseDown={() => setIsDraggingH(true)}
                        />

                        {/* Output pane */}
                        <div style={{ width: `${100 - leftWidth}%` }} className="relative">
                            <div className="absolute top-0 left-0 right-0 px-2 py-1 bg-muted/50 text-xs font-medium border-b flex items-center justify-between">
                                <span>Output ({target?.type ?? "N/A"})</span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={handleOutputCopy}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <div className="pt-6 h-full">
                                <Editor
                                    height="100%"
                                    language={target?.type === "xml" ? "xml" : "json"}
                                    value={output}
                                    options={{
                                        minimap: { enabled: false },
                                        lineNumbers: "on",
                                        fontSize: 13,
                                        scrollBeyondLastLine: false,
                                        readOnly: true,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Modal */}
            {showErrorModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
                    onClick={() => setShowErrorModal(false)}
                >
                    <div
                        className="bg-background border rounded-lg shadow-xl w-[400px] max-w-[90vw] p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-red-600">
                                Error{errors.length > 1 ? "s" : ""} Found
                            </h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowErrorModal(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-3 max-h-60 overflow-auto">
                            {errors.map((err, i) => (
                                <div
                                    key={i}
                                    className="text-sm text-red-600 dark:text-red-400 mb-1"
                                >
                                    {err.line > 0 && (
                                        <span className="font-medium">Line {err.line}: </span>
                                    )}
                                    {err.message}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Button onClick={() => setShowErrorModal(false)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
