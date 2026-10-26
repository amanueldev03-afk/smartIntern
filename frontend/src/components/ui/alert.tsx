import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-2xl border p-4 shadow-soft backdrop-blur-md [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:w-5 [&>svg]:h-5 transition-all duration-300",
  {
    variants: {
      variant: {
        default: "bg-white/90 dark:bg-neutral-900/90 text-neutral-900 dark:text-neutral-100 border-neutral-200 dark:border-neutral-800 [&>svg]:text-neutral-700 dark:[&>svg]:text-neutral-300",
        destructive:
          "border-error-300/60 dark:border-error-800/80 text-error-800 dark:text-error-300 [&>svg]:text-error-600 dark:[&>svg]:text-error-400 bg-error-50/90 dark:bg-error-950/40",
        success:
          "border-emerald-300/60 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400 bg-emerald-50/90 dark:bg-emerald-950/40",
        warning:
          "border-amber-300/60 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400 bg-amber-50/90 dark:bg-amber-950/40",
        info:
          "border-primary-300/60 dark:border-primary-800/80 text-primary-900 dark:text-primary-300 [&>svg]:text-primary-600 dark:[&>svg]:text-primary-400 bg-primary-50/90 dark:bg-primary-950/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
