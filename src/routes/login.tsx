import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import type { FormEvent } from "react"
import { z } from "zod/v4"
import { Loader2 } from "lucide-react"
import { signIn } from "@/lib/auth-client"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/login")({
    validateSearch: z.object({
        redirectTo: z.string().optional(),
    }),
    beforeLoad: async () => {
        const session = await authClient.getSession()
        if (session.data) {
            throw redirect({ to: "/" })
        }
    },
    component: LoginPage,
})

function LoginPage() {
    const navigate = useNavigate()
    const { redirectTo } = Route.useSearch()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        const result = await signIn.email({ email, password })
        if (result.error) {
            setError(result.error.message ?? "Sign in failed")
            setLoading(false)
        } else {
            navigate({ to: redirectTo ?? "/" })
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div
                className={cn(
                    "w-full max-w-sm animate-fade-in-up",
                    "rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-xl",
                    "p-8 shadow-2xl",
                )}
            >
                {/* Logo / App name */}
                <div className="mb-8 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_oklch(0.78_0.12_45/60%)]" />
                        <h1 className="text-2xl font-semibold tracking-tight">Data Mapper</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive animate-fade-in-up">
                            {error}
                        </p>
                    )}

                    <Button type="submit" disabled={loading} className="mt-1 w-full">
                        {loading ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link
                        to="/signup"
                        className="font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}
