import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type {
    ConditionOperator,
    Mapping,
    MappingCondition,
    MappingTransform,
    TransformType,
} from "@/lib/mapper/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface EditMappingModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    mapping: Mapping
    onSave: (mappingId: string, condition?: MappingCondition, transform?: MappingTransform) => void
}

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
    { value: "==", label: "== (equals)" },
    { value: "!=", label: "!= (not equals)" },
    { value: ">", label: "> (greater)" },
    { value: "<", label: "< (less)" },
    { value: ">=", label: ">= (greater or equal)" },
    { value: "<=", label: "<= (less or equal)" },
    { value: "contains", label: "contains" },
    { value: "startsWith", label: "startsWith" },
    { value: "endsWith", label: "endsWith" },
]

const TRANSFORM_OPS: Array<{ value: TransformType; label: string }> = [
    { value: "add", label: "+ (Add)" },
    { value: "subtract", label: "- (Subtract)" },
    { value: "multiply", label: "* (Multiply)" },
    { value: "divide", label: "/ (Divide)" },
    { value: "add_percent", label: "+% (Add %)" },
    { value: "subtract_percent", label: "-% (Subtract %)" },
]

function stripRoot(path: string): string {
    return path.replace(/^root\.?/, "") || "root"
}

export function EditMappingModal({ open, onOpenChange, mapping, onSave }: EditMappingModalProps) {
    const [conditionEnabled, setConditionEnabled] = useState(false)
    const [condField, setCondField] = useState("")
    const [condOperator, setCondOperator] = useState<ConditionOperator>("==")
    const [condValue, setCondValue] = useState("")

    const [transformEnabled, setTransformEnabled] = useState(false)
    const [transformType, setTransformType] = useState<TransformType>("add")
    const [transformValue, setTransformValue] = useState("")

    useEffect(() => {
        if (open) {
            if (mapping.condition) {
                setConditionEnabled(true)
                setCondField(stripRoot(mapping.condition.field))
                setCondOperator(mapping.condition.operator)
                setCondValue(mapping.condition.value)
            } else {
                setConditionEnabled(false)
                setCondField(stripRoot(mapping.sourceId))
                setCondOperator("==")
                setCondValue("")
            }

            if (mapping.transform) {
                setTransformEnabled(true)
                setTransformType(mapping.transform.type)
                setTransformValue(String(mapping.transform.value))
            } else {
                setTransformEnabled(false)
                setTransformType("add")
                setTransformValue("")
            }
        }
    }, [open, mapping])

    if (!open) return null

    const handleSave = () => {
        const condition: MappingCondition | undefined = conditionEnabled
            ? {
                  field: condField.startsWith("root") ? condField : `root.${condField}`,
                  operator: condOperator,
                  value: condValue,
              }
            : undefined

        const parsedValue = parseFloat(transformValue)
        const transform: MappingTransform | undefined =
            transformEnabled && !isNaN(parsedValue)
                ? { type: transformType, value: parsedValue }
                : undefined

        onSave(mapping.id, condition, transform)
        onOpenChange(false)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
        >
            <div
                className="bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-xl w-[480px] max-w-[90vw] animate-modal-enter"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
                    <h3 className="text-lg font-semibold tracking-tight">Edit Mapping</h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenChange(false)}
                        className="rounded-full"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Mapping paths (read-only) */}
                    <div className="flex items-center gap-2 text-sm font-mono bg-muted/30 rounded-xl px-4 py-3">
                        <span className="text-source">{stripRoot(mapping.sourceId)}</span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span className="text-target">{stripRoot(mapping.targetId)}</span>
                    </div>

                    {/* Condition section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Condition (WHERE)</Label>
                            <button
                                onClick={() => setConditionEnabled(!conditionEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    conditionEnabled
                                        ? "bg-accent/20 text-accent"
                                        : "bg-muted/40 text-muted-foreground"
                                }`}
                            >
                                {conditionEnabled ? "Enabled" : "Disabled"}
                            </button>
                        </div>

                        {conditionEnabled && (
                            <div className="space-y-3 pl-1">
                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="cond-field"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Source Field
                                    </Label>
                                    <Input
                                        id="cond-field"
                                        value={condField}
                                        onChange={(e) => setCondField(e.target.value)}
                                        placeholder="e.g. products[0].price"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">
                                            Operator
                                        </Label>
                                        <Select
                                            value={condOperator}
                                            onValueChange={(val) =>
                                                setCondOperator(val as ConditionOperator)
                                            }
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {OPERATORS.map((op) => (
                                                    <SelectItem key={op.value} value={op.value}>
                                                        {op.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label
                                            htmlFor="cond-value"
                                            className="text-xs text-muted-foreground"
                                        >
                                            Value
                                        </Label>
                                        <Input
                                            id="cond-value"
                                            value={condValue}
                                            onChange={(e) => setCondValue(e.target.value)}
                                            placeholder='e.g. 100 or "Laptop"'
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Transform section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Transform (THEN)</Label>
                            <button
                                onClick={() => setTransformEnabled(!transformEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    transformEnabled
                                        ? "bg-chart-5/20 text-chart-5"
                                        : "bg-muted/40 text-muted-foreground"
                                }`}
                            >
                                {transformEnabled ? "Enabled" : "Disabled"}
                            </button>
                        </div>

                        {transformEnabled && (
                            <div className="grid grid-cols-2 gap-3 pl-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">
                                        Operation
                                    </Label>
                                    <Select
                                        value={transformType}
                                        onValueChange={(val) =>
                                            setTransformType(val as TransformType)
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TRANSFORM_OPS.map((op) => (
                                                <SelectItem key={op.value} value={op.value}>
                                                    {op.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="transform-value"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Value
                                    </Label>
                                    <Input
                                        id="transform-value"
                                        type="number"
                                        value={transformValue}
                                        onChange={(e) => setTransformValue(e.target.value)}
                                        placeholder="e.g. 5"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-glass-border">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="rounded-full"
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSave} className="rounded-full">
                        Save
                    </Button>
                </div>
            </div>
        </div>
    )
}
