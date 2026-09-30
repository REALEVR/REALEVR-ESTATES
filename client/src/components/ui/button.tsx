import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // A light top edge and a soft drop shadow make the primary button read as a
        // raised key; active:translate-y-px (base class) presses it back in.
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 [box-shadow:inset_0_1px_0_hsl(0_0%_100%/0.14),0_2px_6px_hsl(235_21%_21%/0.28)] hover:[box-shadow:inset_0_1px_0_hsl(0_0%_100%/0.16),0_6px_14px_hsl(235_21%_21%/0.32)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          // hover was bg-accent/text-accent-foreground — that pair computes to
          // 3.59:1 on this palette's actual accent lightness, below the 4.5:1
          // regular-text floor. primary/primary-foreground (13.16:1) gives the
          // same "confident dark" hover emphasis at a contrast that passes.
          "border border-input bg-background hover:bg-primary hover:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-primary hover:text-primary-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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
