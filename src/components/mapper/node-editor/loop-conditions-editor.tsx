import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapperStore } from "@/lib/mapper/store"
import { getFullPath } from "@/lib/mapper/node-utils"
import { cn } from "@/lib/utils"
import { SourceTreePicker } from "./source-tree-picker"
import type { MapperTreeNode } from "@/lib/mapper/types"

interface LoopConditionsEditorProps {
    node: MapperTreeNode
}

// ─── LoopConditionsEditor ─────────────────────────────────────────────────────

export function LoopConditionsEditor({ node }: LoopConditionsEditorProps) {
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const addLoopCondition = useMapperStore((s) => s.addLoopCondition)
    const removeLoopCondition = useMapperStore((s) => s.removeLoopCondition)
    const updateLoopCondition = useMapperStore((s) => s.updateLoopCondition)
    const setLoopConditionsConnective = useMapperStore((s) => s.setLoopConditionsConnective)
    const snapshot = useMapperStore((s) => s.snapshot)

    const [pickerOpen, setPickerOpen] = useState(false)

    const conditions = node.loopConditions ?? []
    const connective = node.loopConditionsConnective ?? "AND"

    const handleAddCondition = (selectedNodes: MapperTreeNode[]) => {
        const sourceNode = selectedNodes[0]
        if (!sourceNode) return
        const path = sourceTree ? getFullPath(sourceNode.id, sourceTree) : sourceNode.name
        snapshot()
        addLoopCondition(node.id, {
            id: uuidv4(),
            sourceNodePath: path,
            condition: "",
            textReference: true,
        })
    }

    const handleUpdateConditionValue = (condId: string, value: string) => {
        snapshot()
        updateLoopCondition(node.id, condId, { condition: value })
    }

    const handleToggleText = (condId: string, val: boolean) => {
        snapshot()
        updateLoopCondition(node.id, condId, { textReference: val })
    }

    const handleDelete = (condId: string) => {
        snapshot()
        removeLoopCondition(node.id, condId)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header + AND/OR toggle */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-glass-border shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                    Loop Conditions
                    {conditions.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-mono text-[10px]">
                            {conditions.length}
                        </span>
                    )}
                </span>
                {conditions.length > 1 && (
                    <div className="flex items-center gap-0.5 rounded-full bg-muted/30 p-0.5">
                        {(["AND", "OR"] as const).map((opt) => (
                            <button
                                key={opt}
                                type="button"
                                className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                                    connective === opt
                                        ? "bg-accent text-background"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => {
                                    snapshot()
                                    setLoopConditionsConnective(node.id, opt)
                                }}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Conditions list */}
            <ScrollArea className="flex-1 min-h-0">
                {conditions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/50">
                        <p className="text-xs text-center px-4">
                            No loop conditions. Add one to filter loop items (e.g. status ==
                            &apos;ACTIVE&apos;).
                        </p>
                    </div>
                ) : (
                    <div className="p-2 flex flex-col gap-1.5">
                        {conditions.map((cond, idx) => (
                            <div key={cond.id}>
                                {idx > 0 && (
                                    <div className="flex items-center gap-2 my-0.5">
                                        <div className="flex-1 h-px bg-glass-border" />
                                        <span className="text-[10px] font-mono text-accent px-1">
                                            {connective}
                                        </span>
                                        <div className="flex-1 h-px bg-glass-border" />
                                    </div>
                                )}
                                <div className="grid grid-cols-[1fr_1fr_52px_28px] gap-2 items-center px-1 py-1.5 rounded-lg bg-muted/10">
                                    {/* Source path (read-only) */}
                                    <span
                                        className="text-xs font-mono text-muted-foreground truncate"
                                        title={cond.sourceNodePath}
                                    >
                                        {cond.sourceNodePath}
                                    </span>

                                    {/* Condition expression */}
                                    <ConditionInput
                                        value={cond.condition}
                                        onBlur={(v) => handleUpdateConditionValue(cond.id, v)}
                                    />

                                    {/* Text checkbox */}
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={cond.textReference}
                                            onChange={(e) =>
                                                handleToggleText(cond.id, e.target.checked)
                                            }
                                            className="w-3.5 h-3.5 accent-primary"
                                        />
                                        <span className="text-xs text-muted-foreground">Text</span>
                                    </label>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        onClick={() => handleDelete(cond.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Footer */}
            <div className="px-2 py-2 border-t border-glass-border shrink-0">
                <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full h-7 text-xs gap-1.5 text-accent hover:bg-accent/10"
                    onClick={() => setPickerOpen(true)}
                >
                    <Plus className="h-3 w-3" />
                    Add Condition
                </Button>
            </div>

            {/* Source picker — single select */}
            <SourceTreePicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onConfirm={handleAddCondition}
                multiSelect={false}
            />
        </div>
    )
}

// ─── Inline condition input (local state) ─────────────────────────────────────

function ConditionInput({
    value: initialValue,
    onBlur,
}: {
    value: string
    onBlur: (v: string) => void
}) {
    const [val, setVal] = useState(initialValue)
    return (
        <Input
            className="h-6 text-xs font-mono px-2 py-0 bg-transparent border-glass-border"
            placeholder="== 'ACTIVE'"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={(e) => onBlur(e.target.value)}
        />
    )
}
