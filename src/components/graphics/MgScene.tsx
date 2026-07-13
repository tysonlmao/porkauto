import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

type MgSceneProps = SVGProps<SVGSVGElement> & {
  scene: ComponentType<SVGProps<SVGSVGElement>>;
  /** Max width; height scales with viewBox. */
  width?: number | string;
  className?: string;
};

/** Labeled micrographic composition. Line work tints via text color; labels stay white. */
export function MgScene({
  scene: Scene,
  width = "100%",
  className,
  style,
  ...props
}: MgSceneProps) {
  return (
    <Scene
      className={cn("mg-graphic mg-scene h-auto max-w-full", className)}
      style={{ width, ...style }}
      {...props}
    />
  );
}
