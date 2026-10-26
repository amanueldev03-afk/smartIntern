import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-bold ring-offset-background transition-all duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-600 text-white hover:opacity-95 shadow-glow transform hover:-translate-y-0.5 active:translate-y-0",
        secondary: "bg-white text-neutral-800 border-2 border-neutral-200/80 hover:border-primary-400 hover:bg-primary-50/50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800 shadow-soft transform hover:-translate-y-0.5 active:translate-y-0",
        destructive: "bg-gradient-to-r from-error-600 to-error-700 text-white hover:from-error-700 hover:to-error-800 shadow-soft transform hover:-translate-y-0.5 active:translate-y-0",
        danger: "bg-gradient-to-r from-error-600 to-error-700 text-white hover:from-error-700 hover:to-error-800 shadow-soft transform hover:-translate-y-0.5 active:translate-y-0",
        outline: "border-2 border-neutral-300 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:border-primary-400 hover:text-primary-600",
        ghost: "hover:bg-primary-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400",
        link: "text-primary-600 dark:text-primary-400 underline-offset-4 hover:underline",
        accent: "bg-gradient-to-r from-accent-600 to-primary-600 text-white hover:opacity-95 shadow-glow-secondary transform hover:-translate-y-0.5 active:translate-y-0",
        success: "bg-gradient-to-r from-success-600 to-emerald-600 text-white hover:opacity-95 shadow-soft transform hover:-translate-y-0.5 active:translate-y-0",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 rounded-xl px-4 py-2",
        lg: "h-13 rounded-2xl px-8 py-3 text-base",
        icon: "h-11 w-11 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
