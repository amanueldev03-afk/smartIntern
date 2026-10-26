import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold shadow-soft transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-glow hover:from-primary-600 hover:to-primary-700",
        secondary:
          "border-neutral-200/80 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700",
        destructive:
          "border-transparent bg-gradient-to-r from-error-500 to-error-600 text-white shadow-soft hover:from-error-600 hover:to-error-700",
        outline: "text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:border-primary-400 hover:text-primary-600",
        success:
          "border-transparent bg-gradient-to-r from-emerald-500 to-success-600 text-white shadow-soft hover:from-emerald-600 hover:to-success-700",
        warning:
          "border-transparent bg-gradient-to-r from-amber-500 to-warning-600 text-white shadow-soft hover:from-amber-600 hover:to-warning-700",
        accent:
          "border-transparent bg-gradient-to-r from-accent-500 to-primary-600 text-white shadow-glow-secondary hover:from-accent-600 hover:to-primary-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
