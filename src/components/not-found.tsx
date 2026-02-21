import { Link } from "@tanstack/react-router"
import { ArrowLeft, MapPin } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function NotFound() {
    return (
        <div className="h-full flex items-center justify-center p-8 animate-fade-in-up">
            <div className="bg-glass-bg backdrop-blur-xl border border-glass-border shadow-lg rounded-2xl px-10 py-12 flex flex-col items-center gap-6 max-w-md w-full text-center">
                {/* Icon */}
                <div className="relative">
                    <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <MapPin className="h-7 w-7 text-primary" />
                    </div>
                    <span className="absolute -top-1 -right-1 text-xs font-bold bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center">
                        ?
                    </span>
                </div>

                {/* Heading */}
                <div className="flex flex-col gap-2">
                    <span className="text-5xl font-semibold tracking-tight text-foreground/20 select-none">
                        404
                    </span>
                    <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        The route you navigated to doesn&apos;t exist. It may have been moved or the
                        URL might be incorrect.
                    </p>
                </div>

                {/* Action */}
                <Link to="/" className={cn(buttonVariants({ size: "sm" }), "rounded-full gap-1.5")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Mapper
                </Link>
            </div>
        </div>
    )
}
