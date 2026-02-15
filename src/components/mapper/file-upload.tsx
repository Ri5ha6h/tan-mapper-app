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
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium truncate max-w-[150px]">
                            {fileData.name}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClear} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </>
            ) : (
                <Button variant="outline" onClick={handleClick}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {side === "source" ? "Source" : "Target"}
                </Button>
            )}
        </div>
    )
}
