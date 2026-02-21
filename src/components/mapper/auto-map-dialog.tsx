import { useState } from "react"
import { Wand2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useMapperStore } from "@/lib/mapper/store"
import { isLeaf, traverseDown } from "@/lib/mapper/node-utils"

interface AutoMapDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface AutoMapOptions {
    matchByName: boolean
    oneToMany: boolean
    includeSubNodes: boolean
}

function previewAutoMap(
    sourceTree: ReturnType<typeof useMapperStore.getState>["mapperState"]["sourceTreeNode"],
    targetTree: ReturnType<typeof useMapperStore.getState>["mapperState"]["targetTreeNode"],
    options: AutoMapOptions,
): Array<{ source: string; target: string }> {
    if (!sourceTree || !targetTree) return []

    const sourceLeaves = new Map<string, string>()
    traverseDown(sourceTree, (node) => {
        if (isLeaf(node)) {
            sourceLeaves.set(node.name.toLowerCase(), node.name)
        }
    })

    const previews: Array<{ source: string; target: string }> = []
    traverseDown(targetTree, (node) => {
        if (!isLeaf(node) && !options.includeSubNodes) return
        if (node.sourceReferences?.length) return

        const match = options.matchByName ? sourceLeaves.get(node.name.toLowerCase()) : undefined
        if (match) {
            previews.push({ source: match, target: node.name })
        }
    })

    return previews
}

export function AutoMapDialog({ open, onOpenChange }: AutoMapDialogProps) {
    const [options, setOptions] = useState<AutoMapOptions>({
        matchByName: true,
        oneToMany: false,
        includeSubNodes: false,
    })

    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const targetTree = useMapperStore((s) => s.mapperState.targetTreeNode)
    const snapshot = useMapperStore((s) => s.snapshot)
    const autoMap = useMapperStore((s) => s.autoMap)

    const previews = open ? previewAutoMap(sourceTree, targetTree, options) : []

    const handleApply = () => {
        snapshot()
        autoMap(options)
        onOpenChange(false)
    }

    const toggleOption = (key: keyof AutoMapOptions) => {
        setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-primary" />
                        Auto-Map by Name
                    </DialogTitle>
                    <DialogDescription>
                        Automatically create mappings between source and target nodes that share the
                        same name.
                    </DialogDescription>
                </DialogHeader>

                {/* Options */}
                <div className="space-y-3">
                    {(
                        [
                            { key: "matchByName", label: "Match by exact name", defaultOn: true },
                            { key: "oneToMany", label: "One source to many targets" },
                            {
                                key: "includeSubNodes",
                                label: "Include parent / intermediate nodes",
                            },
                        ] as const
                    ).map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 cursor-pointer group">
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={options[key]}
                                onClick={() => toggleOption(key)}
                                className={`h-5 w-5 rounded flex items-center justify-center border transition-colors ${
                                    options[key]
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-border bg-muted/30 hover:border-primary/50"
                                }`}
                            >
                                {options[key] && (
                                    <svg
                                        className="h-3 w-3"
                                        viewBox="0 0 12 12"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                    >
                                        <path d="M2 6l3 3 5-5" />
                                    </svg>
                                )}
                            </button>
                            <span className="text-sm group-hover:text-foreground transition-colors">
                                {label}
                            </span>
                        </label>
                    ))}
                </div>

                {/* Preview */}
                {previews.length > 0 && (
                    <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                            Will create {previews.length} mapping{previews.length !== 1 ? "s" : ""}:
                        </p>
                        <div className="rounded-xl bg-muted/30 border border-glass-border p-3 max-h-40 overflow-y-auto space-y-1">
                            {previews.slice(0, 20).map((p, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                                    <span className="text-source">{p.source}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="text-target">{p.target}</span>
                                </div>
                            ))}
                            {previews.length > 20 && (
                                <p className="text-xs text-muted-foreground pt-1">
                                    +{previews.length - 20} more…
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {previews.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                        No matching nodes found with current options.
                    </p>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="rounded-full"
                        onClick={handleApply}
                        disabled={previews.length === 0}
                    >
                        <Wand2 className="h-4 w-4 mr-1" />
                        Auto-Map ({previews.length})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
