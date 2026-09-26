import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-secondary text-secondary-foreground ring-1 ring-inset ring-border",
        success:
          "border-transparent bg-gradient-to-br from-success/10 to-success/20 text-success ring-1 ring-inset ring-success/25",
        warning:
          "border-transparent bg-gradient-to-br from-warning/15 to-warning/30 text-warning-foreground ring-1 ring-inset ring-warning/35",
        destructive:
          "border-transparent bg-gradient-to-br from-destructive/10 to-destructive/20 text-destructive ring-1 ring-inset ring-destructive/25",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
