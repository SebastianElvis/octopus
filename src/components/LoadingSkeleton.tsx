interface SkeletonCardProps {
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="animate-pulse rounded-sm border border-outline bg-surface p-3">
      <div className="h-3.5 w-3/4 rounded bg-active" />
      <div className="mt-2 h-2.5 w-1/2 rounded bg-hover" />
      {Array.from({ length: lines - 2 }).map((_, i) => {
        const widths = [75, 85, 65, 90, 70, 80];
        const width = widths[i % widths.length];
        return (
          <div
            key={i}
            className="mt-1.5 h-2 rounded bg-hover"
            style={{ width: `${width}%` }}
          />
        );
      })}
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-12 rounded bg-active" />
        <div className="h-5 w-16 rounded bg-hover" />
      </div>
    </div>
  );
}

interface SpinnerProps {
  label?: string;
  size?: "sm" | "md";
}

export function Spinner({ label, size = "md" }: SpinnerProps) {
  const sizeClass = size === "sm" ? "h-3 w-3 border" : "h-5 w-5 border-2";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block animate-spin rounded-full border-outline-strong border-t-brand ${sizeClass}`}
      />
      {label && <span className="text-xs text-on-surface-muted">{label}</span>}
    </div>
  );
}
