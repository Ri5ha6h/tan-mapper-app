import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core"
import { ArrowRight, FileCode, GripVertical, Trash2, X } from "lucide-react"
import { useRef, useState } from "react"
import { ConnectionLines } from "./connection-lines"
import { FileUpload } from "./file-upload"
import { TreeView } from "./tree-view"
import { GenerateModal } from "./generate-modal"
import type { DragData } from "@/lib/mapper/types"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapper } from "@/lib/mapper/context"

export function MapperFlow() {
    const { source, target, mappings, setMappings, addMapping, removeMapping } = useMapper()
    const containerRef = useRef<HTMLDivElement>(null)

    const [sourceRefs, setSourceRefs] = useState<Map<string, HTMLElement>>(new Map())
    const [targetRefs, setTargetRefs] = useState<Map<string, HTMLElement>>(new Map())
    const [activeId, setActiveId] = useState<string | null>(null)
    const [generateModalOpen, setGenerateModalOpen] = useState(false)

    const handleSourceRefs = (refs: Map<string, HTMLElement>) => {
        setSourceRefs((prev) => {
            if (prev.size !== refs.size) return new Map(refs)
            for (const [key, val] of refs) {
                if (prev.get(key) !== val) return new Map(refs)
            }
            return prev
        })
    }

    const handleTargetRefs = (refs: Map<string, HTMLElement>) => {
        setTargetRefs((prev) => {
            if (prev.size !== refs.size) return new Map(refs)
            for (const [key, val] of refs) {
                if (prev.get(key) !== val) return new Map(refs)
            }
            return prev
        })
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null)

        const { active, over } = event
        if (!over) return

        const activeData = active.data.current as DragData | undefined
        const overData = over.data.current as DragData | undefined

        // Must be dragging from source to target
        if (activeData?.side !== "source" || overData?.side !== "target") return

        addMapping(activeData.nodeId, overData.nodeId)
    }

    return (
        <DndContext
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col h-full gap-5">
                {/* Upload row */}
                <div className="flex items-center justify-between px-6 animate-fade-in-up animate-stagger-2">
                    <FileUpload side="source" />
                    <FileUpload side="target" />
                </div>

                {/* Trees container */}
                <div
                    ref={containerRef}
                    className="flex-1 relative flex gap-5 px-6 min-h-0 animate-fade-in-up animate-stagger-3"
                >
                    {/* Source tree */}
                    <div className="flex-1 overflow-hidden rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg">
                        <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20">
                            <span className="text-sm font-medium text-source">Source</span>
                        </div>
                        <div className="h-[calc(100%-44px)]">
                            <TreeView
                                tree={source?.tree ?? null}
                                side="source"
                                onNodeRefs={handleSourceRefs}
                            />
                        </div>
                    </div>

                    {/* Connection lines */}
                    <ConnectionLines
                        sourceRefs={sourceRefs}
                        targetRefs={targetRefs}
                        containerRef={containerRef as React.RefObject<HTMLElement | null>}
                    />

                    {/* Target tree */}
                    <div className="flex-1 overflow-hidden rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg">
                        <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20">
                            <span className="text-sm font-medium text-target">Target</span>
                        </div>
                        <div className="h-[calc(100%-44px)]">
                            <TreeView
                                tree={target?.tree ?? null}
                                side="target"
                                onNodeRefs={handleTargetRefs}
                            />
                        </div>
                    </div>
                </div>

                {/* Mappings list */}
                <div className="mx-6 mb-6 rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg animate-fade-in-up animate-stagger-4">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-glass-border bg-muted/20">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Mappings</span>
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                {mappings.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMappings([])}
                                disabled={mappings.length === 0}
                                className="rounded-full"
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Clear
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setGenerateModalOpen(true)}
                                disabled={mappings.length === 0 || !source || !target}
                                className="rounded-full"
                            >
                                <FileCode className="h-4 w-4 mr-1" />
                                Generate Result
                            </Button>
                        </div>
                    </div>
                    <ScrollArea className="max-h-[150px]">
                        {mappings.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground animate-fade-in-up">
                                <GripVertical className="h-8 w-8 mb-2 opacity-30" />
                                Drag from source to target to create mappings
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {mappings.map((mapping) => (
                                    <div
                                        key={mapping.id}
                                        className="flex items-center justify-between px-4 py-2 rounded-full bg-muted/30 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 text-sm font-mono">
                                            <span className="text-source">
                                                {formatNodeId(mapping.sourceId)}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-target">
                                                {formatNodeId(mapping.targetId)}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeMapping(mapping.id)}
                                            className="h-6 w-6 rounded-full"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </div>

            {/* Drag overlay */}
            <DragOverlay>
                {activeId ? (
                    <div className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-medium shadow-xl shadow-primary/25">
                        {activeId.replace("drag-", "")}
                    </div>
                ) : null}
            </DragOverlay>

            <GenerateModal open={generateModalOpen} onOpenChange={setGenerateModalOpen} />
        </DndContext>
    )
}

function formatNodeId(id: string): string {
    // Remove "root." prefix for display
    return id.replace(/^root\.?/, "") || "root"
}
