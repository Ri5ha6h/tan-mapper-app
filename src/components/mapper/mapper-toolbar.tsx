import { useState } from "react"
import {
    Download,
    FilePlus2,
    FolderOpen,
    Loader2,
    Play,
    Redo2,
    Save,
    SaveAll,
    Settings2,
    Sheet,
    Undo2,
    Upload,
    Wand2,
} from "lucide-react"

import { ExecuteDialog } from "./execute-dialog"
import { UploadExcelDialog } from "./upload-excel-dialog"
import { OpenMapDialog } from "./open-map-dialog"
import { SaveAsDialog } from "./save-as-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useCanRedo, useCanUndo, useIsDirty, useIsSaving, useMapperStore } from "@/lib/mapper/store"
import { downloadAsExcel } from "@/lib/mapper/excel-export"
import { countNodes, downloadAsJtmap } from "@/lib/mapper/persistence"
import { saveMap } from "@/lib/mapper/persistence.server"
import { cn } from "@/lib/utils"

interface MapperToolbarProps {
    onAutoMapClick?: () => void
    onPreferencesClick?: () => void
}

export function MapperToolbar({ onAutoMapClick, onPreferencesClick }: MapperToolbarProps) {
    const resetState = useMapperStore((s) => s.resetState)
    const undo = useMapperStore((s) => s.undo)
    const redo = useMapperStore((s) => s.redo)
    const setDirty = useMapperStore((s) => s.setDirty)
    const setSaving = useMapperStore((s) => s.setSaving)
    const setSaveError = useMapperStore((s) => s.setSaveError)
    const setLastSavedAt = useMapperStore((s) => s.setLastSavedAt)
    const setCurrentResource = useMapperStore((s) => s.setCurrentResource)
    const mapperState = useMapperStore((s) => s.mapperState)
    const currentResourceName = useMapperStore((s) => s.currentResourceName)
    const currentResourceId = useMapperStore((s) => s.currentResourceId)
    const canUndo = useCanUndo()
    const canRedo = useCanRedo()
    const isDirty = useIsDirty()
    const isSaving = useIsSaving()

    const [executeOpen, setExecuteOpen] = useState(false)
    const [excelImportOpen, setExcelImportOpen] = useState(false)
    const [openMapOpen, setOpenMapOpen] = useState(false)
    const [saveAsOpen, setSaveAsOpen] = useState(false)

    function handleNew() {
        if (isDirty && !window.confirm("Discard unsaved changes?")) return
        resetState()
    }

    async function handleSave() {
        if (!currentResourceId || !currentResourceName) {
            setSaveAsOpen(true)
            return
        }
        setSaving(true)
        setSaveError(null)
        try {
            const stateWithName = { ...mapperState, name: currentResourceName }
            const nodeCount =
                countNodes(mapperState.sourceTreeNode) + countNodes(mapperState.targetTreeNode)
            const result = await saveMap({
                data: {
                    id: currentResourceId,
                    name: currentResourceName,
                    state: stateWithName as unknown as Record<string, unknown>,
                    sourceInputType: mapperState.sourceInputType ?? undefined,
                    targetInputType: mapperState.targetInputType ?? undefined,
                    nodeCount,
                },
            })
            setCurrentResource(result.name, result.id)
            setLastSavedAt(result.savedAt)
            setDirty(false)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save."
            setSaveError(message)
            window.alert(message)
        } finally {
            setSaving(false)
        }
    }

    function handleDownload() {
        const filename = currentResourceName ? `${currentResourceName}.jtmap` : undefined
        downloadAsJtmap(mapperState, filename)
    }

    return (
        <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-glass-border bg-glass-bg backdrop-blur-xl">
            {/* File group */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={handleNew}
                title="New mapper"
            >
                <FilePlus2 className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setOpenMapOpen(true)}
                title="Open mapper"
            >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                title="Save mapper"
            >
                {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Save className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setSaveAsOpen(true)}
                title="Save As"
            >
                <SaveAll className="h-4 w-4" />
                <span className="hidden sm:inline">Save As</span>
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={handleDownload}
                title="Download as .jtmap file"
            >
                <Download className="h-4 w-4" />
            </Button>

            {/* Dialogs for file operations */}
            <OpenMapDialog open={openMapOpen} onClose={() => setOpenMapOpen(false)} />
            <SaveAsDialog open={saveAsOpen} onClose={() => setSaveAsOpen(false)} />

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Execute */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5 text-accent hover:text-accent-foreground hover:bg-accent/20"
                onClick={() => setExecuteOpen(true)}
                title="Execute / Test transformation"
            >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Execute</span>
            </Button>

            <ExecuteDialog open={executeOpen} onClose={() => setExecuteOpen(false)} />

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Excel import / export */}
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-accent hover:text-accent-foreground hover:bg-accent/20"
                onClick={() => downloadAsExcel(mapperState)}
                title="Download as Excel (.xlsx)"
            >
                <Sheet className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-accent hover:text-accent-foreground hover:bg-accent/20"
                onClick={() => setExcelImportOpen(true)}
                title="Import from Excel (.xlsx)"
            >
                <Upload className="h-4 w-4" />
            </Button>

            <UploadExcelDialog open={excelImportOpen} onClose={() => setExcelImportOpen(false)} />

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Undo / Redo */}
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={undo}
                disabled={!canUndo}
                title="Undo"
            >
                <Undo2 className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={redo}
                disabled={!canRedo}
                title="Redo"
            >
                <Redo2 className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Mapping tools */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={onAutoMapClick}
                title="Auto-map by name"
            >
                <Wand2 className="h-4 w-4" />
                <span className="hidden sm:inline">Auto-Map</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={onPreferencesClick}
                title="Mapper preferences"
            >
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Preferences</span>
            </Button>

            {/* Resource name + dirty indicator */}
            <div className="flex items-center gap-1.5 ml-auto">
                {currentResourceName ? (
                    <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                        {currentResourceName}
                    </span>
                ) : (
                    <span className="text-sm text-muted-foreground italic">Untitled</span>
                )}
                {isDirty && (
                    <span
                        className={cn(
                            "h-1.5 w-1.5 rounded-full bg-primary shrink-0",
                            "shadow-[0_0_6px_oklch(0.78_0.12_45/60%)]",
                        )}
                        title="Unsaved changes"
                    />
                )}
            </div>
        </div>
    )
}
