interface SkeletonCardProps {
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="animate-pulse rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="h-3.5 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-2.5 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
      {Array.from({ length: lines - 2 }).map((_, i) => {
        const widths = [75, 85, 65, 90, 70, 80];
        const width = widths[i % widths.length];
        return (
          <div
            key={i}
            className="mt-1.5 h-2 rounded bg-gray-100 dark:bg-gray-800"
            style={{ width: `${width}%` }}
          />
        );
      })}
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-12 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-16 rounded bg-gray-100 dark:bg-gray-800" />
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
        className={`inline-block animate-spin rounded-full border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400 ${sizeClass}`}
      />
      {label && <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>}
    </div>
  );
}
