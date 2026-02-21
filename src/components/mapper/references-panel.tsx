import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapperStore } from "@/lib/mapper/store"
import { getFullPath, findNodeById } from "@/lib/mapper/node-utils"
import type { FlatReference, MapperTreeNode } from "@/lib/mapper/types"
import { cn } from "@/lib/utils"

function isReferenceValid(
    ref: FlatReference,
    sourceTree: MapperTreeNode | null,
    targetTree: MapperTreeNode | null,
): boolean {
    if (!sourceTree || !targetTree) return false
    return (
        !!findNodeById(ref.sourceNodeId, sourceTree) && !!findNodeById(ref.targetNodeId, targetTree)
    )
}

function getReferenceRowClass(
    ref: FlatReference,
    sourceTree: MapperTreeNode | null,
    targetTree: MapperTreeNode | null,
): string {
    if (!isReferenceValid(ref, sourceTree, targetTree)) {
        return "bg-destructive/10 border-destructive/20"
    }
    if (ref.isLoop) {
        return "bg-accent/10 border-accent/20"
    }
    return "bg-mapped/[0.08] border-mapped/15"
}

function TypeBadge({ ref }: { ref: FlatReference }) {
    if (ref.isLoop) {
        return (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent">
                Loop
            </span>
        )
    }
    if (!ref.textReference) {
        return (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/15 text-secondary">
                Expr
            </span>
        )
    }
    return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted/40 text-muted-foreground">
            Text
        </span>
    )
}

export function ReferencesPanel() {
    const references = useMapperStore((s) => s.mapperState.references)
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const targetTree = useMapperStore((s) => s.mapperState.targetTreeNode)
    const removeReference = useMapperStore((s) => s.removeReference)
    const selectTargetNode = useMapperStore((s) => s.selectTargetNode)

    if (references.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in-up">
                <p className="text-sm">No references yet</p>
                <p className="text-xs mt-1 text-muted-foreground/60">
                    Drag a source node onto a target node to create a reference
                </p>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header row */}
            <div
                className="grid gap-2 px-3 py-2 border-b border-glass-border text-xs font-medium text-muted-foreground bg-muted/20 rounded-t-xl"
                style={{ gridTemplateColumns: "1fr 1fr 130px 80px 120px 44px" }}
            >
                <span>Source</span>
                <span>Target</span>
                <span>Variable</span>
                <span>Type</span>
                <span>Loop Over</span>
                <span />
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {references.map((ref) => {
                        const sourcePath = sourceTree
                            ? getFullPath(ref.sourceNodeId, sourceTree)
                            : ref.sourceNodeId
                        const targetPath = targetTree
                            ? getFullPath(ref.targetNodeId, targetTree)
                            : ref.targetNodeId

                        // Find the loop-over variable name from the references list
                        const loopOverRef = ref.loopOverId
                            ? references.find((r) => r.id === ref.loopOverId)
                            : null

                        const rowClass = getReferenceRowClass(ref, sourceTree, targetTree)

                        return (
                            <div
                                key={ref.id}
                                className={cn(
                                    "grid gap-2 items-center px-3 py-2 rounded-lg border cursor-pointer",
                                    "hover:brightness-110 transition-all duration-150",
                                    rowClass,
                                )}
                                style={{ gridTemplateColumns: "1fr 1fr 130px 80px 120px 44px" }}
                                onClick={() => selectTargetNode(ref.targetNodeId)}
                            >
                                {/* Source path */}
                                <span
                                    className="font-mono text-xs text-source truncate"
                                    title={sourcePath}
                                >
                                    {sourcePath || ref.sourceNodeId}
                                </span>

                                {/* Target path */}
                                <span
                                    className="font-mono text-xs text-target truncate"
                                    title={targetPath}
                                >
                                    {targetPath || ref.targetNodeId}
                                </span>

                                {/* Variable name */}
                                <span
                                    className="font-mono text-xs truncate"
                                    title={ref.variableName}
                                >
                                    {ref.variableName}
                                </span>

                                {/* Type badge */}
                                <TypeBadge ref={ref} />

                                {/* Loop over */}
                                <span className="font-mono text-xs text-muted-foreground truncate">
                                    {loopOverRef?.variableName ?? "—"}
                                </span>

                                {/* Delete button */}
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        removeReference(ref.id)
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
