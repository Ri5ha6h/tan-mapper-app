import { useState } from "react"
import { CSS } from "@dnd-kit/utilities"
import { useSortable } from "@dnd-kit/sortable"
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react"

import { ChainScriptEditor } from "./chain-script-editor"
import type { MapChainLink } from "@/lib/mapchain/types"
import { useMapChainStore } from "@/lib/mapchain/store"
import { listSavedMaps } from "@/lib/mapper/persistence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ─── MapLinkContent ────────────────────────────────────────────────────────────

function MapLinkContent({ link }: { link: MapChainLink }) {
    const savedMaps = listSavedMaps()
    const setLinkMap = useMapChainStore((s) => s.setLinkMap)

    return (
        <div className="mt-3 pt-3 border-t border-glass-border/50">
            <Select
                value={link.mapId ?? ""}
                onValueChange={(id: string | null) => {
                    if (!id) return
                    const entry = savedMaps.find((m) => m.id === id)
                    if (entry) setLinkMap(link.id, id, entry.name)
                }}
            >
                <SelectTrigger className="rounded-full text-sm w-full">
                    <SelectValue placeholder="Select a saved map..." />
                </SelectTrigger>
                <SelectContent>
                    {savedMaps.length === 0 ? (
                        <SelectItem value="__empty__" disabled>
                            No saved maps found
                        </SelectItem>
                    ) : (
                        savedMaps.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                <span className="text-muted-foreground text-xs ml-2">
                                    {m.sourceInputType}→{m.targetInputType}
                                </span>
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
        </div>
    )
}

// ─── ScriptLinkContent ─────────────────────────────────────────────────────────

function ScriptLinkContent({ link }: { link: MapChainLink }) {
    const [expanded, setExpanded] = useState(false)
    const updateLink = useMapChainStore((s) => s.updateLink)

    return (
        <div className="mt-3 pt-3 border-t border-glass-border/50">
            {/* Script name field */}
            <Input
                value={link.scriptName ?? ""}
                onChange={(e) =>
                    updateLink(link.id, { scriptName: (e.target as HTMLInputElement).value })
                }
                placeholder="Script name..."
                className="rounded-full text-sm mb-2"
            />

            {/* Monaco editor (collapsible) */}
            <div
                className={cn(
                    "rounded-xl overflow-hidden border border-glass-border transition-all",
                    expanded ? "h-48" : "h-20",
                )}
            >
                <ChainScriptEditor
                    value={link.scriptCode ?? ""}
                    onChange={(code) => updateLink(link.id, { scriptCode: code })}
                />
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="rounded-full mt-1 text-xs"
                onClick={() => setExpanded((e) => !e)}
            >
                {expanded ? "Collapse" : "Expand"} editor
            </Button>
        </div>
    )
}

// ─── ChainLinkRow ──────────────────────────────────────────────────────────────

interface ChainLinkRowProps {
    link: MapChainLink
    index: number
    isFirst: boolean
    isLast: boolean
}

export function ChainLinkRow({ link, index, isFirst, isLast }: ChainLinkRowProps) {
    const toggleLinkEnabled = useMapChainStore((s) => s.toggleLinkEnabled)
    const moveLink = useMapChainStore((s) => s.moveLink)
    const removeLink = useMapChainStore((s) => s.removeLink)

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: link.id,
    })

    function handleRemove() {
        if (window.confirm("Remove this step from the chain?")) {
            removeLink(link.id)
        }
    }

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
            }}
            className={cn(
                "bg-glass-bg border border-glass-border rounded-xl p-4",
                !link.enabled && "opacity-50",
            )}
        >
            {/* Header row */}
            <div className="flex items-center gap-3">
                {/* Step number */}
                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {index + 1}
                </div>

                {/* Drag handle */}
                <div
                    className="cursor-grab shrink-0 text-muted-foreground hover:text-foreground"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4" />
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

                {/* Link name */}
                <span className="font-medium text-sm truncate flex-1">
                    {link.type === "JT_MAP"
                        ? (link.mapName ?? "Select a map...")
                        : (link.scriptName ?? "Inline Script")}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full"
                        onClick={() => toggleLinkEnabled(link.id)}
                        title={link.enabled ? "Disable step" : "Enable step"}
                    >
                        {link.enabled ? (
                            <Eye className="h-3.5 w-3.5" />
                        ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                        )}
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full"
                        onClick={() => moveLink(link.id, "up")}
                        disabled={isFirst}
                        title="Move up"
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full"
                        onClick={() => moveLink(link.id, "down")}
                        disabled={isLast}
                        title="Move down"
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full text-destructive hover:bg-destructive/10"
                        onClick={handleRemove}
                        title="Remove step"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Content section */}
            {link.type === "JT_MAP" && <MapLinkContent link={link} />}
            {link.type === "JT_SCRIPT" && <ScriptLinkContent link={link} />}
        </div>
    )
}
