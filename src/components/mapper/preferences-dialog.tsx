import { Settings2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useMapperStore, usePreferences } from "@/lib/mapper/store"
import type { MapperPreferences } from "@/lib/mapper/types"

interface PreferencesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const PREFERENCE_ITEMS: Array<{
    key: keyof MapperPreferences
    label: string
    description: string
}> = [
    {
        key: "debugComment",
        label: "Debug comments in output",
        description: "Include node-name comments in generated transformation code",
    },
    {
        key: "overrideTargetValue",
        label: "Override target value on drop",
        description:
            "Automatically set the target node value to the source variable name when mapping",
    },
    {
        key: "autoMap",
        label: "Auto-map by name on file load",
        description: "Automatically create mappings when both files are loaded",
    },
    {
        key: "autoMapOneToMany",
        label: "Auto-map one source to many targets",
        description: "Allow a single source node to map to multiple target nodes",
    },
    {
        key: "autoMapIncludeSubNodes",
        label: "Include parent nodes in auto-map",
        description: "Also map non-leaf (parent/intermediate) nodes when auto-mapping",
    },
]

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
    const preferences = usePreferences()
    const updatePreferences = useMapperStore((s) => s.updatePreferences)

    const toggle = (key: keyof MapperPreferences) => {
        updatePreferences({ [key]: !preferences[key] })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-primary" />
                        Mapper Preferences
                    </DialogTitle>
                    <DialogDescription>
                        Configure how the mapper behaves during mapping and code generation.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    {PREFERENCE_ITEMS.map(({ key, label, description }) => (
                        <label
                            key={key}
                            className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-muted/30 transition-colors"
                        >
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={preferences[key]}
                                onClick={() => toggle(key)}
                                className={`mt-0.5 h-5 w-5 shrink-0 rounded flex items-center justify-center border transition-colors ${
                                    preferences[key]
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-border bg-muted/30 hover:border-primary/50"
                                }`}
                            >
                                {preferences[key] && (
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
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">{label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {description}
                                </p>
                            </div>
                        </label>
                    ))}
                </div>

                <DialogFooter>
                    <Button className="rounded-full" onClick={() => onOpenChange(false)}>
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
