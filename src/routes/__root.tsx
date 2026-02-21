import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"
import { NotFound } from "@/components/not-found"
import { cn } from "@/lib/utils"

export const Route = createRootRoute({
    head: () => ({
        meta: [
            {
                charSet: "utf-8",
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
            {
                name: "color-scheme",
                content: "dark",
            },
            {
                title: "Data Mapper",
            },
        ],
        links: [
            {
                rel: "stylesheet",
                href: appCss,
            },
        ],
    }),

    component: RootLayout,
    shellComponent: RootDocument,
    notFoundComponent: NotFound,
})

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
    return (
        <Link
            to={to}
            className={cn(
                "text-sm px-3 py-1.5 rounded-full transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/20",
            )}
            activeProps={{
                className: "text-foreground bg-primary/10 font-medium",
            }}
        >
            {children}
        </Link>
    )
}

function RootLayout() {
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

            {/* App header with navigation */}
            <header className="shrink-0 border-b border-glass-border bg-glass-bg backdrop-blur-xl px-6 py-3 relative z-10 animate-fade-in-up">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_oklch(0.78_0.12_45/50%)]" />
                        <h1 className="text-lg font-semibold tracking-tight">Data Mapper</h1>
                    </div>
                    <nav className="flex items-center gap-1">
                        <NavLink to="/">Mapper</NavLink>
                        <NavLink to="/map-chain">Map Chains</NavLink>
                    </nav>
                </div>
            </header>

            <div className="flex-1 min-h-0 relative z-10 animate-fade-in-up animate-stagger-1">
                <Outlet />
            </div>
        </main>
    )
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <HeadContent />
            </head>
            <body className="antialiased">
                {children}
                <TanStackDevtools
                    config={{
                        position: "bottom-right",
                    }}
                    plugins={[
                        {
                            name: "Tanstack Router",
                            render: <TanStackRouterDevtoolsPanel />,
                        },
                    ]}
                />
                <Scripts />
            </body>
        </html>
    )
}
