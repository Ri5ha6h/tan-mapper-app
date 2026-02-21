import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import type { DragData } from "@/lib/mapper/types"

import { ConnectionLines } from "./connection-lines"
import { FileUpload } from "./file-upload"
import { TreeView } from "./tree-view"
import { MapperToolbar } from "./mapper-toolbar"
import { ReferencesPanel } from "./references-panel"
import { AutoMapDialog } from "./auto-map-dialog"
import { PreferencesDialog } from "./preferences-dialog"
import { EnvironmentEditor } from "./environment-editor"
import { NodeEditorPanel } from "./node-editor/node-editor-panel"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useMapperStore } from "@/lib/mapper/store"

// ─── Client-only guard ─────────────────────────────────────────────────────────
// DndContext generates sequential IDs for aria-describedby that differ between
// SSR and client hydration, causing React hydration mismatches. We skip SSR
// rendering for the entire mapper by returning a stable placeholder on the server
// and rendering the real component only on the client.
const _subscribe = () => () => {}
function useIsClient() {
    return useSyncExternalStore(
        _subscribe,
        () => true, // client snapshot
        () => false, // server snapshot
    )
}

export function MapperFlow() {
    const isClient = useIsClient()
    if (!isClient) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <span className="text-sm text-muted-foreground/40">Loading mapper...</span>
            </div>
        )
    }
    return <MapperFlowInner />
}

function MapperFlowInner() {
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const targetTree = useMapperStore((s) => s.mapperState.targetTreeNode)
    const addMapping = useMapperStore((s) => s.addMapping)
    const snapshot = useMapperStore((s) => s.snapshot)
    const references = useMapperStore((s) => s.mapperState.references)

    // beforeunload guard — warn when leaving with unsaved changes
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (useMapperStore.getState().isDirty) {
                e.preventDefault()
                e.returnValue = ""
            }
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [])

    const containerRef = useRef<HTMLDivElement>(null)
    const [sourceRefs, setSourceRefs] = useState<Map<string, HTMLElement>>(new Map())
    const [targetRefs, setTargetRefs] = useState<Map<string, HTMLElement>>(new Map())
    const [activeId, setActiveId] = useState<string | null>(null)
    const [autoMapOpen, setAutoMapOpen] = useState(false)
    const [preferencesOpen, setPreferencesOpen] = useState(false)

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

        if (activeData?.side !== "source" || overData?.side !== "target") return

        snapshot()
        addMapping(activeData.nodeId, overData.nodeId)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <MapperToolbar
                onAutoMapClick={() => setAutoMapOpen(true)}
                onPreferencesClick={() => setPreferencesOpen(true)}
            />

            {/* Tab layout */}
            <Tabs defaultValue="mapper" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-3 pb-0 shrink-0">
                    <TabsList>
                        <TabsTrigger value="mapper">Mapper</TabsTrigger>
                        <TabsTrigger value="references">
                            References
                            {references.length > 0 && (
                                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                                    {references.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="environment">Environment</TabsTrigger>
                    </TabsList>
                </div>

                {/* ── Mapper tab ── */}
                <TabsContent value="mapper" className="flex-1 min-h-0 flex flex-col">
                    <DndContext
                        collisionDetection={pointerWithin}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex-1 min-h-0 flex gap-0">
                            {/* Left 60% — file upload + trees */}
                            <div className="flex-[3] flex flex-col min-w-0 min-h-0 p-4 gap-3">
                                {/* Upload row */}
                                <div className="flex items-center justify-between shrink-0">
                                    <FileUpload side="source" />
                                    <FileUpload side="target" />
                                </div>

                                {/* Trees container */}
                                <div
                                    ref={containerRef}
                                    className="flex-1 relative flex gap-4 min-h-0"
                                >
                                    {/* Source tree */}
                                    <div className="flex-1 overflow-hidden rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg min-h-0">
                                        <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20 shrink-0">
                                            <span className="text-sm font-medium text-source">
                                                Source
                                            </span>
                                        </div>
                                        <div className="h-[calc(100%-44px)]">
                                            <TreeView
                                                tree={sourceTree}
                                                side="source"
                                                onNodeRefs={handleSourceRefs}
                                            />
                                        </div>
                                    </div>

                                    {/* Connection SVG lines */}
                                    <ConnectionLines
                                        sourceRefs={sourceRefs}
                                        targetRefs={targetRefs}
                                        containerRef={
                                            containerRef as React.RefObject<HTMLElement | null>
                                        }
                                    />

                                    {/* Target tree */}
                                    <div className="flex-1 overflow-hidden rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg min-h-0">
                                        <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20 shrink-0">
                                            <span className="text-sm font-medium text-target">
                                                Target
                                            </span>
                                        </div>
                                        <div className="h-[calc(100%-44px)]">
                                            <TreeView
                                                tree={targetTree}
                                                side="target"
                                                onNodeRefs={handleTargetRefs}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right 40% — Node Editor Panel (Phase 5) */}
                            <div className="flex-[2] border-l border-glass-border min-w-0 min-h-0 flex flex-col">
                                <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20 shrink-0">
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Node Editor
                                    </span>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <NodeEditorPanel />
                                </div>
                            </div>
                        </div>

                        {/* Drag overlay */}
                        <DragOverlay>
                            {activeId ? (
                                <div className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-medium shadow-xl shadow-primary/25">
                                    {activeId.replace("drag-", "").split("-")[0]}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </TabsContent>

                {/* ── References tab ── */}
                <TabsContent value="references" className="flex-1 min-h-0 p-4">
                    <div className="h-full rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-glass-border bg-muted/20 shrink-0">
                            <span className="text-sm font-medium">All References</span>
                        </div>
                        <div className="h-[calc(100%-44px)]">
                            <ReferencesPanel />
                        </div>
                    </div>
                </TabsContent>

                {/* ── Environment tab ── */}
                <TabsContent value="environment" className="flex-1 min-h-0">
                    <EnvironmentEditor />
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <AutoMapDialog open={autoMapOpen} onOpenChange={setAutoMapOpen} />
            <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </div>
    )
}
