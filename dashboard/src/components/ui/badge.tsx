import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary-container text-on-primary-container",
        secondary:
          "bg-secondary-container text-on-secondary-container",
        destructive:
          "bg-error-container text-on-error-container",
        outline:
          "ghost-border text-foreground",
        endpoint:
          "bg-tertiary-container/10 text-tertiary-dim font-mono text-[10px] rounded-md px-2 py-1",
        success:
          "bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim",
        warning:
          "bg-secondary-container text-secondary-dim",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
