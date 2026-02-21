import { DndContext,  closestCenter } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Link2 } from "lucide-react"

import { ChainLinkRow } from "./chain-link-row"
import type {DragEndEvent} from "@dnd-kit/core";
import { useMapChainStore } from "@/lib/mapchain/store"

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyChainState() {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Link2 className="h-12 w-12 opacity-20" />
            <p className="text-sm text-center">
                No steps yet. Add a Map or Script step from the toolbar.
            </p>
        </div>
    )
}

// ─── ChainGrid ─────────────────────────────────────────────────────────────────

export function ChainGrid() {
    const links = useMapChainStore((s) => s.chain.links)
    const reorderLinks = useMapChainStore((s) => s.reorderLinks)

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIndex = links.findIndex((l) => l.id === active.id)
            const newIndex = links.findIndex((l) => l.id === over.id)
            const reordered = arrayMove(links, oldIndex, newIndex)
            reorderLinks(reordered.map((l) => l.id))
        }
    }

    return (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3 max-w-3xl mx-auto">
                    {links.length === 0 ? (
                        <EmptyChainState />
                    ) : (
                        links.map((link, index) => (
                            <ChainLinkRow
                                key={link.id}
                                link={link}
                                index={index}
                                isFirst={index === 0}
                                isLast={index === links.length - 1}
                            />
                        ))
                    )}
                </div>
            </SortableContext>
        </DndContext>
    )
}
