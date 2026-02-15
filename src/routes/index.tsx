import { createFileRoute } from "@tanstack/react-router"
import { MapperProvider } from "@/lib/mapper/context"
import { MapperFlow } from "@/components/mapper/mapper-flow"

export const Route = createFileRoute("/")({ component: App })

function App() {
    return (
        <main className="h-screen flex flex-col bg-background relative overflow-hidden">
            {/* Ambient radial gradient background */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 80% 60% at 20% 20%, oklch(0.25 0.04 300 / 40%) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 80%, oklch(0.22 0.03 45 / 30%) 0%, transparent 70%)",
                }}
            />

            <header className="shrink-0 border-b border-glass-border bg-glass-bg backdrop-blur-xl px-6 py-4 relative z-10 animate-fade-in-up">
                <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_oklch(0.78_0.12_45/50%)]" />
                    <h1 className="text-xl font-semibold tracking-tight">Data Mapper</h1>
                </div>
            </header>
            <div className="flex-1 min-h-0 py-4 relative z-10 animate-fade-in-up animate-stagger-1">
                <MapperProvider>
                    <MapperFlow />
                </MapperProvider>
            </div>
        </main>
    )
}
