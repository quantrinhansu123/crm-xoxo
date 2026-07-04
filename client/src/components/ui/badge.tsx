import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default: "border-transparent bg-primary text-white",
                secondary: "border-transparent bg-muted text-foreground",
                destructive: "border-transparent bg-danger text-white",
                outline: "text-foreground",
                success: "border-transparent bg-success-light text-emerald-700",
                warning: "border-transparent bg-warning-light text-amber-700",
                danger: "border-transparent bg-danger-light text-red-700",
                info: "border-transparent bg-info-light text-blue-700",
                purple: "border-transparent bg-purple-light text-purple-700",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
