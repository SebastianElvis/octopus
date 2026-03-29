/**
 * Yin-yang brand mark in cyan + gold.
 * Uses CSS custom properties for brand colors so it adapts to theme.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Cyan half (left) */}
      <path
        d="M16 0a16 16 0 0 0 0 32c0-4.418-3.582-8-8-8s-8-3.582-8-8 3.582-8 8-8a8 8 0 0 0 0-8z"
        className="fill-brand"
      />
      {/* Gold half (right) */}
      <path
        d="M16 32a16 16 0 0 0 0-32c0 4.418 3.582 8 8 8s8 3.582 8 8-3.582 8-8 8a8 8 0 0 0 0 8z"
        className="fill-accent"
      />
      {/* Cyan dot in gold half */}
      <circle cx="16" cy="24" r="2.5" className="fill-brand" />
      {/* Gold dot in cyan half */}
      <circle cx="16" cy="8" r="2.5" className="fill-accent" />
    </svg>
  );
}
