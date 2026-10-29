import { useId } from "react";

import { MARQUE } from "@/components/marque.generated";
import { cn } from "@/lib/utils";

export function Marque({ className }: { className?: string }) {
  const { page, glyphR, tile, ink, radius } = MARQUE;
  const r = radius * 512;
  const clipId = `marque-${useId()}`;
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-[26px] shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <clipPath id={clipId}>
        <rect width="512" height="512" rx={r} ry={r} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="512" height="512" fill={tile} />
        {page.rules.map((rule) => (
          <rect
            key={rule.y}
            x="0"
            y={rule.y}
            width={rule.w}
            height={rule.h}
            fill={ink}
            opacity={rule.opacity}
          />
        ))}
        <rect
          x={page.margin.x}
          y="0"
          width={page.margin.w}
          height="512"
          fill={ink}
          opacity={page.margin.opacity}
        />
        <path
          transform={`translate(${page.letter.x} ${page.letter.baseline}) scale(${page.letter.scale} ${-page.letter.scale})`}
          fill={ink}
          d={glyphR}
        />
      </g>
    </svg>
  );
}

export function MarqueSilhouette({ className }: { className?: string }) {
  const { silhouette } = MARQUE;
  const box = silhouette.viewBox;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      className={cn("size-4 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {silhouette.rules.map((rule) => (
        <rect
          key={rule.y}
          x={rule.x}
          y={rule.y}
          width={rule.w}
          height={rule.h}
          rx={rule.h / 2}
          fill="currentColor"
        />
      ))}
      <rect
        x={silhouette.margin.x}
        y={silhouette.margin.y}
        width={silhouette.margin.w}
        height={silhouette.margin.h}
        rx={silhouette.margin.w / 2}
        fill="var(--primary)"
      />
    </svg>
  );
}

export function MarqueSignature({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <MarqueSilhouette />
      <span className="surtitre">Propulsé par Racontine</span>
    </p>
  );
}
