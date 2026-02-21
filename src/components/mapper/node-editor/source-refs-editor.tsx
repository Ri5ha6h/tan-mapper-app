import { useState } from "react"
import { Trash2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapperStore } from "@/lib/mapper/store"
import { findNodeById, getFullPath } from "@/lib/mapper/node-utils"
import { SourceTreePicker } from "./source-tree-picker"
import type { MapperTreeNode, SourceReference } from "@/lib/mapper/types"

interface SourceRefsEditorProps {
    node: MapperTreeNode
}

// ─── Row color based on reference status ─────────────────────────────────────

function getReferenceRowClass(ref: SourceReference, sourceTree: MapperTreeNode | null): string {
    if (!sourceTree) return "bg-mapped/5"
    const sourceNode = findNodeById(ref.sourceNodeId, sourceTree)
    if (!sourceNode) return "bg-destructive/10 border-l-2 border-destructive"
    return "bg-mapped/5"
}

// ─── Single reference row ─────────────────────────────────────────────────────

interface RefRowProps {
    ref: SourceReference
    nodeId: string
    sourceTree: MapperTreeNode | null
    loopVarName: string | undefined
}

function RefRow({ ref, nodeId, sourceTree, loopVarName }: RefRowProps) {
    const updateSourceReference = useMapperStore((s) => s.updateSourceReference)
    const deleteSourceReference = useMapperStore((s) => s.deleteSourceReference)
    const snapshot = useMapperStore((s) => s.snapshot)

    const [varName, setVarName] = useState(ref.variableName)

    const sourcePath = sourceTree ? getFullPath(ref.sourceNodeId, sourceTree) : ref.sourceNodeId

    return (
        <div
            className={cn(
                "grid items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                "grid-cols-[1fr_110px_52px_80px_32px]",
                getReferenceRowClass(ref, sourceTree),
            )}
        >
            {/* Source path */}
            <span className="text-xs text-muted-foreground truncate font-mono" title={sourcePath}>
                {sourcePath || ref.sourceNodeId}
            </span>

            {/* Variable name */}
            <Input
                className="h-6 text-xs font-mono px-2 py-0 bg-transparent border-glass-border"
                value={varName}
                onChange={(e) => setVarName(e.target.value)}
                onBlur={(e) => {
                    snapshot()
                    updateSourceReference(nodeId, ref.id, { variableName: e.target.value })
                }}
            />

            {/* Text ref checkbox */}
            <label className="flex items-center gap-1 cursor-pointer">
                <input
                    type="checkbox"
                    checked={ref.textReference}
                    onChange={(e) => {
                        snapshot()
                        updateSourceReference(nodeId, ref.id, { textReference: e.target.checked })
                    }}
                    className="w-3.5 h-3.5 accent-primary"
                />
                <span className="text-xs text-muted-foreground">Text</span>
            </label>

            {/* Loop over badge */}
            <div className="truncate">
                {loopVarName ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                        {loopVarName}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                )}
            </div>

            {/* Delete */}
            <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => {
                    snapshot()
                    deleteSourceReference(nodeId, ref.id)
                }}
                title="Remove reference"
            >
                <Trash2 className="h-3 w-3" />
            </button>
        </div>
    )
}

// ─── SourceRefsEditor ─────────────────────────────────────────────────────────

export function SourceRefsEditor({ node }: SourceRefsEditorProps) {
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const addSourceReferences = useMapperStore((s) => s.addSourceReferences)
    const clearSourceReferences = useMapperStore((s) => s.clearSourceReferences)
    const snapshot = useMapperStore((s) => s.snapshot)

    const [pickerOpen, setPickerOpen] = useState(false)

    const refs = node.sourceReferences ?? []

    // Build a map of loop ref ID → variable name for display
    const loopVarById: Record<string, string> = {}
    if (node.loopReference) {
        loopVarById[node.loopReference.id] = node.loopReference.variableName
    }

    const handleAddRefs = (selectedNodes: MapperTreeNode[]) => {
        snapshot()
        addSourceReferences(node.id, selectedNodes)
    }

    const handleClearAll = () => {
        snapshot()
        clearSourceReferences(node.id)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 py-2 border-b border-glass-border shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                    Source References
                    {refs.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-mono text-[10px]">
                            {refs.length}
                        </span>
                    )}
                </span>
            </div>

            {/* Column headers */}
            {refs.length > 0 && (
                <div className="grid grid-cols-[1fr_110px_52px_80px_32px] px-2 py-1 gap-2 border-b border-glass-border/50 shrink-0">
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Source
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Variable
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Text
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Loop
                    </span>
                    <span />
                </div>
            )}

            {/* Refs list */}
            <ScrollArea className="flex-1 min-h-0">
                {refs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/50">
                        <p className="text-xs text-center px-4">
                            No source references yet. Add one below or drag a source node onto this
                            target node.
                        </p>
                    </div>
                ) : (
                    <div className="p-2 flex flex-col gap-0.5">
                        {refs.map((ref) => (
                            <RefRow
                                key={ref.id}
                                ref={ref}
                                nodeId={node.id}
                                sourceTree={sourceTree}
                                loopVarName={
                                    ref.loopOverId ? loopVarById[ref.loopOverId] : undefined
                                }
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Footer actions */}
            <div className="flex gap-2 px-2 py-2 border-t border-glass-border shrink-0">
                <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full h-7 text-xs gap-1.5 text-primary hover:bg-primary/10"
                    onClick={() => setPickerOpen(true)}
                >
                    <Plus className="h-3 w-3" />
                    Add Reference
                </Button>
                {refs.length > 0 && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full h-7 text-xs gap-1.5 text-destructive hover:bg-destructive/10 ml-auto"
                        onClick={handleClearAll}
                    >
                        <X className="h-3 w-3" />
                        Clear All
                    </Button>
                )}
            </div>

            {/* Source tree picker dialog */}
            <SourceTreePicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onConfirm={handleAddRefs}
                multiSelect
            />
        </div>
    )
}
