import { useState } from "react"
import { FileCode, FileJson, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMapperStore } from "@/lib/mapper/store"
import { UploadModelDialog } from "./upload-model-dialog"
import { cn } from "@/lib/utils"

interface FileUploadProps {
    side: "source" | "target"
}

export function FileUpload({ side }: FileUploadProps) {
    const [dialogOpen, setDialogOpen] = useState(false)

    const applySourceModel = useMapperStore((s) => s.applySourceModel)
    const applyTargetModel = useMapperStore((s) => s.applyTargetModel)
    const snapshot = useMapperStore((s) => s.snapshot)

    // Read current tree to display the file badge
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const targetTree = useMapperStore((s) => s.mapperState.targetTreeNode)
    const sourceInputType = useMapperStore((s) => s.mapperState.sourceInputType)
    const targetInputType = useMapperStore((s) => s.mapperState.targetInputType)

    const currentTree = side === "source" ? sourceTree : targetTree
    const currentInputType = side === "source" ? sourceInputType : targetInputType
    const hasTree = !!currentTree && currentTree.children && currentTree.children.length > 0

    function handleClear() {
        snapshot()
        const emptyRoot = {
            id: `${side}-root`,
            name: "root",
            type: "element" as const,
            children: [],
        }
        if (side === "source") {
            applySourceModel(emptyRoot, "JSON", "REPLACE")
        } else {
            applyTargetModel(emptyRoot, "JSON", "REPLACE")
        }
    }

    // Count nodes
    function countNodes(n: typeof currentTree): number {
        if (!n) return 0
        return 1 + (n.children?.reduce((sum, c) => sum + countNodes(c), 0) ?? 0)
    }
    const nodeCount = currentTree ? countNodes(currentTree) - 1 : 0 // -1 to exclude root

    const isXML = currentInputType === "XML"
    const FileIcon = isXML ? FileCode : FileJson
    const colorClass = side === "source" ? "bg-source/10 text-source" : "bg-target/10 text-target"

    return (
        <>
            <UploadModelDialog open={dialogOpen} onClose={() => setDialogOpen(false)} side={side} />

            {hasTree ? (
                <div
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl",
                        "bg-glass-bg border border-glass-border",
                    )}
                >
                    <div
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            colorClass,
                        )}
                    >
                        <FileIcon className="h-3 w-3" />
                        <span>{side === "source" ? "Source" : "Target"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {nodeCount} node{nodeCount !== 1 ? "s" : ""}
                    </span>
                    <div className="flex gap-1 ml-auto">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-full"
                            title="Change model"
                            onClick={() => setDialogOpen(true)}
                        >
                            <Upload className="h-3 w-3" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-full text-destructive hover:text-destructive"
                            title="Clear model"
                            onClick={handleClear}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setDialogOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground transition-all cursor-pointer"
                >
                    <Upload className="h-4 w-4" />
                    <span className="text-sm font-medium">
                        Upload {side === "source" ? "Source" : "Target"}
                    </span>
                </button>
            )}
        </>
    )
}
