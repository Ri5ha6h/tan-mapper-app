import { ChainToolbar } from "./chain-toolbar"
import { ChainGrid } from "./chain-grid"

export function ChainView() {
    return (
        <div className="flex flex-col h-full bg-background">
            <ChainToolbar />
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <ChainGrid />
            </div>
        </div>
    )
}
