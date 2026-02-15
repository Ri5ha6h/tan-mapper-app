import { FileCode, FileJson, Upload, X } from "lucide-react"
import { useRef } from "react"
import type { FileData } from "@/lib/mapper/types"
import { Button } from "@/components/ui/button"
import { useMapper } from "@/lib/mapper/context"
import { detectFileType, parseJSON, parseXML } from "@/lib/mapper/parsers"

interface FileUploadProps {
    side: "source" | "target"
}

export function FileUpload({ side }: FileUploadProps) {
    const { source, target, setSource, setTarget } = useMapper()
    const inputRef = useRef<HTMLInputElement>(null)

    const fileData = side === "source" ? source : target
    const setFileData = side === "source" ? setSource : setTarget

    const handleClick = () => {
        inputRef.current?.click()
    }

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const content = await file.text()
            const type = detectFileType(content)
            const tree = type === "json" ? parseJSON(content) : parseXML(content)

            const data: FileData = {
                name: file.name,
                type,
                tree,
            }

            setFileData(data)
        } catch (err) {
            console.error("Failed to parse file:", err)
        }

        // Reset input so same file can be re-selected
        e.target.value = ""
    }

    const handleClear = () => {
        setFileData(null)
    }

    const FileIcon = fileData?.type === "xml" ? FileCode : FileJson
    const colorClass = side === "source" ? "bg-source/10 text-source" : "bg-target/10 text-target"

    return (
        <div className="flex items-center gap-2">
            <input
                ref={inputRef}
                type="file"
                accept=".json,.xml"
                onChange={handleChange}
                className="hidden"
            />

            {fileData ? (
                <>
                    <div
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full ${colorClass}`}
                    >
                        <FileIcon className="h-4 w-4" />
                        <span className="text-sm font-medium truncate max-w-[150px]">
                            {fileData.name}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClear}
                        className="h-8 w-8 rounded-full"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </>
            ) : (
                <button
                    onClick={handleClick}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground transition-all cursor-pointer"
                >
                    <Upload className="h-4 w-4" />
                    <span className="text-sm font-medium">
                        Upload {side === "source" ? "Source" : "Target"}
                    </span>
                </button>
            )}
        </div>
    )
}
