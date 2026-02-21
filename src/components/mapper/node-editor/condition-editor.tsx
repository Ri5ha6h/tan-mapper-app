import { useState, useRef, useCallback } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useMapperStore, useScriptLanguage } from "@/lib/mapper/store"
import type { MapperTreeNode } from "@/lib/mapper/types"

interface ConditionEditorProps {
    node: MapperTreeNode
}

// ─── ConditionEditor ──────────────────────────────────────────────────────────

export function ConditionEditor({ node }: ConditionEditorProps) {
    const setNodeCondition = useMapperStore((s) => s.setNodeCondition)
    const snapshot = useMapperStore((s) => s.snapshot)
    const scriptLanguage = useScriptLanguage()
    const isGroovy = scriptLanguage === "groovy"

    const [condition, setCondition] = useState(node.nodeCondition?.condition ?? "")

    const hasSnapshotted = useRef(false)
    const ensureSnapshot = useCallback(() => {
        if (!hasSnapshotted.current) {
            snapshot()
            hasSnapshotted.current = true
        }
    }, [snapshot])

    // Sync when node changes
    const prevNodeId = useRef(node.id)
    if (prevNodeId.current !== node.id) {
        prevNodeId.current = node.id
        hasSnapshotted.current = false
        setCondition(node.nodeCondition?.condition ?? "")
    }

    const handleConditionBlur = (value: string) => {
        ensureSnapshot()
        if (!value.trim()) {
            setNodeCondition(node.id, null)
        } else {
            setNodeCondition(node.id, { condition: value })
        }
    }

    const hasCondition = !!node.nodeCondition?.condition

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Label */}
            <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium">Node Condition</Label>
                <p className="text-xs text-muted-foreground">
                    Node is skipped in output if this expression returns{" "}
                    <code className="font-mono text-destructive">false</code>.
                </p>
            </div>

            {/* Condition textarea */}
            <div className="flex flex-col gap-1.5">
                <Textarea
                    className={[
                        "text-sm font-mono min-h-[100px] resize-none bg-glass-bg/50 border-glass-border",
                        hasCondition ? "border-accent/40" : "",
                    ].join(" ")}
                    placeholder={
                        isGroovy
                            ? "Groovy boolean expression\ne.g. sourceData.status == 'ACTIVE'"
                            : "JavaScript boolean expression\ne.g. sourceData.status === 'ACTIVE'"
                    }
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    onBlur={(e) => handleConditionBlur(e.target.value)}
                />
            </div>

            {/* Status indicator */}
            {hasCondition && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/8 border border-accent/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span className="text-xs text-accent">
                        Condition active — node may be skipped
                    </span>
                </div>
            )}

            {/* Clear link */}
            {hasCondition && (
                <button
                    type="button"
                    className="self-start text-xs text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => {
                        snapshot()
                        setCondition("")
                        setNodeCondition(node.id, null)
                    }}
                >
                    Clear condition
                </button>
            )}

            {/* Help */}
            <div className="rounded-xl bg-muted/20 border border-glass-border p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">
                    Examples ({isGroovy ? "Groovy" : "JavaScript"})
                </p>
                <ul className="text-xs text-muted-foreground/70 space-y-0.5 font-mono">
                    {isGroovy ? (
                        <>
                            <li>_status == &apos;ACTIVE&apos;</li>
                            <li>_amount &gt; 0</li>
                            <li>_flag != null &amp;&amp; _flag != &apos;&apos;</li>
                        </>
                    ) : (
                        <>
                            <li>_status === &apos;ACTIVE&apos;</li>
                            <li>_amount &gt; 0</li>
                            <li>_flag !== null &amp;&amp; _flag !== &apos;&apos;</li>
                        </>
                    )}
                </ul>
            </div>
        </div>
    )
}
