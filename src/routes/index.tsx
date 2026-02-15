import { createFileRoute } from "@tanstack/react-router"
import { MapperProvider } from "@/lib/mapper/context"
import { MapperFlow } from "@/components/mapper/mapper-flow"

export const Route = createFileRoute("/")({ component: App })

function App() {
    return (
        <main className="h-screen flex flex-col bg-background">
            <header className="shrink-0 border-b px-4 py-3">
                <h1 className="text-xl font-semibold">Data Mapper</h1>
            </header>
            <div className="flex-1 min-h-0 py-4">
                <MapperProvider>
                    <MapperFlow />
                </MapperProvider>
            </div>
        </main>
    )
}
