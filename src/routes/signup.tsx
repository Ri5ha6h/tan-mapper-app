import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import type { FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { signUp } from "@/lib/auth-client"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/signup")({
    beforeLoad: async () => {
        const session = await authClient.getSession()
        if (session.data) {
            throw redirect({ to: "/" })
        }
    },
    component: SignupPage,
})

function SignupPage() {
    const navigate = useNavigate()
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError("")

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters")
            return
        }

        setLoading(true)

        const result = await signUp.email({ email, password, name })
        if (result.error) {
            setError(result.error.message ?? "Sign up failed")
            setLoading(false)
        } else {
            navigate({ to: "/" })
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
                    <p className="text-sm text-muted-foreground">Create your account</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoComplete="name"
                            autoFocus
                        />
                    </div>

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
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
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
                                Creating account...
                            </>
                        ) : (
                            "Create Account"
                        )}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    )
}
