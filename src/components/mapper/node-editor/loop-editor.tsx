import { useState } from "react"
import { Link2, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMapperStore } from "@/lib/mapper/store"
import { findNodeById, getFullPath } from "@/lib/mapper/node-utils"
import { cn } from "@/lib/utils"
import type { MapperTreeNode, LoopReference } from "@/lib/mapper/types"

interface LoopEditorProps {
    node: MapperTreeNode
}

// ─── LoopEditor ───────────────────────────────────────────────────────────────

export function LoopEditor({ node }: LoopEditorProps) {
    const mapperState = useMapperStore((s) => s.mapperState)
    const setLoopReference = useMapperStore((s) => s.setLoopReference)
    const setLoopIterator = useMapperStore((s) => s.setLoopIterator)
    const snapshot = useMapperStore((s) => s.snapshot)

    const sourceTree = mapperState.sourceTreeNode

    // Collect all LoopReferences from the entire target tree
    const allLoopRefs: LoopReference[] = []
    function collectLoopRefs(n: MapperTreeNode) {
        if (n.loopReference) allLoopRefs.push(n.loopReference)
        n.children?.forEach(collectLoopRefs)
    }
    if (mapperState.targetTreeNode) collectLoopRefs(mapperState.targetTreeNode)

    const [selectedRefId, setSelectedRefId] = useState<string>(
        node.loopReference?.id ?? allLoopRefs[0]?.id ?? "",
    )
    const [iteratorName, setIteratorName] = useState(
        node.loopIterator ?? node.loopReference?.variableName ?? "",
    )

    const selectedRef = allLoopRefs.find((r) => r.id === selectedRefId)

    const handleRefChange = (refId: string) => {
        setSelectedRefId(refId)
        const ref = allLoopRefs.find((r) => r.id === refId)
        if (ref) {
            // Auto-suggest iterator name from source node name
            const sourceNode = sourceTree ? findNodeById(ref.sourceNodeId, sourceTree) : null
            const suggested = `_${sourceNode?.name ?? ref.variableName}`
            setIteratorName(suggested)
        }
    }

    const handleSetLoop = () => {
        if (!selectedRef) return
        snapshot()
        setLoopReference(node.id, selectedRef)
        setLoopIterator(node.id, iteratorName)
    }

    const handleClearLoop = () => {
        snapshot()
        setLoopReference(node.id, null)
        setIteratorName("")
    }

    const currentLoopSourcePath =
        node.loopReference && sourceTree
            ? getFullPath(node.loopReference.sourceNodeId, sourceTree)
            : null

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Current loop status */}
            {node.loopReference ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
                    <Link2 className="h-4 w-4 text-accent shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium text-accent">
                            {node.loopReference.variableName}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate font-mono">
                            {currentLoopSourcePath ?? node.loopReference.sourceNodeId}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/20 border border-glass-border">
                    <Unlink className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    <span className="text-xs text-muted-foreground/60">No loop reference set</span>
                </div>
            )}

            {/* Loop reference selector */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                    Select Loop Reference Source
                </Label>
                {allLoopRefs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 px-1">
                        No loop references available. Drag a source array node onto a target array
                        node to create one.
                    </p>
                ) : (
                    <div className="flex flex-col gap-1">
                        {allLoopRefs.map((ref) => {
                            const refSourcePath = sourceTree
                                ? getFullPath(ref.sourceNodeId, sourceTree)
                                : ref.sourceNodeId
                            return (
                                <button
                                    key={ref.id}
                                    type="button"
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-colors",
                                        selectedRefId === ref.id
                                            ? "bg-accent/15 text-accent border border-accent/30"
                                            : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border border-glass-border",
                                    )}
                                    onClick={() => handleRefChange(ref.id)}
                                >
                                    <span className="font-mono font-medium">
                                        {ref.variableName}
                                    </span>
                                    <span className="text-muted-foreground/60 truncate">
                                        → {refSourcePath}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Iterator name input */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Iterator Variable Name</Label>
                <Input
                    className="h-8 text-sm font-mono bg-glass-bg/50 border-glass-border"
                    placeholder="e.g. _orders"
                    value={iteratorName}
                    onChange={(e) => setIteratorName(e.target.value)}
                />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    className="rounded-full h-8 flex-1 text-xs"
                    disabled={!selectedRef || !iteratorName.trim()}
                    onClick={handleSetLoop}
                >
                    <Link2 className="h-3 w-3 mr-1.5" />
                    Set Loop Reference
                </Button>
                {node.loopReference && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full h-8 text-xs text-destructive hover:bg-destructive/10"
                        onClick={handleClearLoop}
                    >
                        <Unlink className="h-3 w-3 mr-1.5" />
                        Clear
                    </Button>
                )}
            </div>
        </div>
    )
}
