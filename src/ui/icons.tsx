// Inline SVG icons (24x24, 1.75 stroke, currentColor). Self-hosted to satisfy
// the strict CSP (no external icon font/CDN). Purely decorative: callers label
// the buttons with aria-label / title.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconSelect = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3l7 17 2.5-6.5L20 11 4 3z" />
  </Svg>
);
export const IconText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6V5h14v1M12 5v14M9 19h6" />
  </Svg>
);
export const IconRect = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="6" width="16" height="12" rx="1.5" />
  </Svg>
);
export const IconEllipse = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="8" ry="6" />
  </Svg>
);
export const IconLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19L19 5" />
  </Svg>
);
export const IconArrow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19L19 5M19 5h-7M19 5v7" />
  </Svg>
);
export const IconInk = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20c3-1 4-4 7-4s3 2 5 1 3-4 4-6" />
    <path d="M14 6l4 4-8 8H6v-4l8-8z" opacity="0" />
  </Svg>
);
export const IconHighlight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M9 15l6-9 4 2-6 9-4-2z" />
  </Svg>
);
export const IconUnderline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5v6a5 5 0 0010 0V5M5 20h14" />
  </Svg>
);
export const IconStrike = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M7 8a4 3 0 018-1M9 16a4 3 0 008 1" />
  </Svg>
);
export const IconWhiteout = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="8" rx="1" />
    <path d="M4 12h16" opacity="0" />
  </Svg>
);
export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M5 17l4-4 3 3 3-3 4 4" />
  </Svg>
);
export const IconSignature = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18c2 0 3-8 5-8s1 6 3 6 2-9 4-9 2 5 3 5h1" />
    <path d="M3 21h18" />
  </Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a4 4 0 005.66 0l2.83-2.83a4 4 0 00-5.66-5.66L11 6" />
    <path d="M14 11a4 4 0 00-5.66 0L5.5 13.83a4 4 0 005.66 5.66L13 18" />
  </Svg>
);
export const IconRotate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 11-3-6.7M21 4v4h-4" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const IconDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const IconBlankPage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const IconMerge = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="9" height="12" rx="1.5" />
    <rect x="12" y="8" width="9" height="12" rx="1.5" />
    <path d="M12 12h0" />
  </Svg>
);
export const IconZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M11 8v6M8 11h6M20 20l-3.5-3.5" />
  </Svg>
);
export const IconZoomOut = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M8 11h6M20 20l-3.5-3.5" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </Svg>
);
export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14.5 0 17M12 3.5c-2.5 2.5-2.5 14.5 0 17" />
  </Svg>
);
