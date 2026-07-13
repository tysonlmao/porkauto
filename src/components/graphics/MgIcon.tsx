import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

type MgIconProps = SVGProps<SVGSVGElement> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  size?: number | string;
};

/** Sized micrographic glyph. Tint via `className` text color (`currentColor`). */
export function MgIcon({
  icon: Icon,
  size = 24,
  className,
  style,
  ...props
}: MgIconProps) {
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <Icon
      className={cn("mg-graphic shrink-0", className)}
      style={{ width: dim, height: dim, ...style }}
      {...props}
    />
  );
}
