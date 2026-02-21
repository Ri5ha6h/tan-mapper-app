import { MousePointerClick, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useMapperStore } from "@/lib/mapper/store"
import { findNodeById, getFullPath } from "@/lib/mapper/node-utils"
import { ValueEditor } from "./value-editor"
import { SourceRefsEditor } from "./source-refs-editor"
import { LoopEditor } from "./loop-editor"
import { LoopConditionsEditor } from "./loop-conditions-editor"
import { ConditionEditor } from "./condition-editor"
import { SourceNodeEditor } from "./source-node-editor"

// ─── Drop placeholder ─────────────────────────────────────────────────────────

function DropPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/50 p-4">
            <MousePointerClick className="h-9 w-9 opacity-30" />
            <p className="text-xs text-center leading-relaxed">
                Select a node in the tree to edit it, or drag a source node onto a target node to
                create a mapping.
            </p>
        </div>
    )
}

// ─── Target node tabs ─────────────────────────────────────────────────────────

function TargetNodeEditorTabs() {
    const mapperState = useMapperStore((s) => s.mapperState)
    const selectedTargetNodeId = useMapperStore((s) => s.selectedTargetNodeId)
    const selectTargetNode = useMapperStore((s) => s.selectTargetNode)

    const node =
        selectedTargetNodeId && mapperState.targetTreeNode
            ? findNodeById(selectedTargetNodeId, mapperState.targetTreeNode)
            : null

    if (!node) return <DropPlaceholder />

    const fullPath = mapperState.targetTreeNode
        ? getFullPath(node.id, mapperState.targetTreeNode)
        : node.name

    const refsCount = node.sourceReferences?.length ?? 0
    const hasCondition = !!node.nodeCondition?.condition
    const hasLoop = !!node.loopReference
    const loopCondCount = node.loopConditions?.length ?? 0

    return (
        <div className="flex flex-col h-full">
            {/* Header row */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-glass-border shrink-0 min-w-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-target/15 text-target font-medium shrink-0">
                            Target
                        </span>
                        <span
                            className="text-xs text-muted-foreground font-mono truncate"
                            title={fullPath}
                        >
                            {fullPath || node.name}
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    className="flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition-colors shrink-0"
                    onClick={() => selectTargetNode(null)}
                    title="Deselect node"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="value" className="flex-1 flex flex-col min-h-0">
                <div className="px-2 pt-2 pb-0 shrink-0">
                    <TabsList className="w-full flex gap-0.5">
                        <TabsTrigger value="value" className="flex-1 text-[11px] px-1 py-1 h-7">
                            Value
                        </TabsTrigger>
                        <TabsTrigger value="refs" className="flex-1 text-[11px] px-1 py-1 h-7">
                            Refs
                            {refsCount > 0 && (
                                <span className="ml-1 text-[9px] px-1 rounded-full bg-mapped/20 text-mapped font-mono">
                                    {refsCount}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="loop" className="flex-1 text-[11px] px-1 py-1 h-7">
                            Loop
                            {hasLoop && (
                                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="loop-cond" className="flex-1 text-[11px] px-1 py-1 h-7">
                            Filter
                            {loopCondCount > 0 && (
                                <span className="ml-1 text-[9px] px-1 rounded-full bg-accent/20 text-accent font-mono">
                                    {loopCondCount}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="condition" className="flex-1 text-[11px] px-1 py-1 h-7">
                            Cond
                            {hasCondition && (
                                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="value" className="flex-1 min-h-0 overflow-hidden">
                    <ValueEditor node={node} />
                </TabsContent>

                <TabsContent value="refs" className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <SourceRefsEditor node={node} />
                </TabsContent>

                <TabsContent value="loop" className="flex-1 min-h-0 overflow-y-auto">
                    <LoopEditor node={node} />
                </TabsContent>

                <TabsContent
                    value="loop-cond"
                    className="flex-1 min-h-0 overflow-hidden flex flex-col"
                >
                    <LoopConditionsEditor node={node} />
                </TabsContent>

                <TabsContent value="condition" className="flex-1 min-h-0 overflow-y-auto">
                    <ConditionEditor node={node} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// ─── NodeEditorPanel — public export ─────────────────────────────────────────

export function NodeEditorPanel() {
    const selectedTargetNodeId = useMapperStore((s) => s.selectedTargetNodeId)
    const selectedSourceNodeId = useMapperStore((s) => s.selectedSourceNodeId)
    const mapperState = useMapperStore((s) => s.mapperState)

    const sourceNode =
        selectedSourceNodeId && mapperState.sourceTreeNode
            ? findNodeById(selectedSourceNodeId, mapperState.sourceTreeNode)
            : null

    // If a target node is selected, always show the target editor
    if (selectedTargetNodeId) {
        return <TargetNodeEditorTabs />
    }

    // If only a source node is selected, show the source view
    if (sourceNode) {
        return (
            <div className="flex flex-col h-full overflow-y-auto">
                <SourceNodeEditor node={sourceNode} />
            </div>
        )
    }

    return <DropPlaceholder />
}
