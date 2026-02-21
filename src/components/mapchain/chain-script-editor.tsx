import MonacoEditor from "@monaco-editor/react"

interface ChainScriptEditorProps {
    value: string
    onChange: (code: string) => void
}

export function ChainScriptEditor({ value, onChange }: ChainScriptEditorProps) {
    return (
        <MonacoEditor
            height="100%"
            theme="vs-dark"
            language="javascript"
            value={value}
            onChange={(v) => onChange(v ?? "")}
            options={{
                minimap: { enabled: false },
                fontSize: 12,
                fontFamily: "Geist Mono Variable, monospace",
                lineNumbers: "off",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 8, bottom: 8 },
            }}
        />
    )
}
