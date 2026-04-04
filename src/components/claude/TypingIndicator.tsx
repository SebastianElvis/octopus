interface TypingIndicatorProps {
  /** Color variant: brand cyan (default) or purple for thinking blocks */
  color?: "brand" | "purple";
  /** Additional classes for positioning (e.g., align-middle, ml-1) */
  className?: string;
}

/** Animated three-dot typing indicator for streaming content */
export function TypingIndicator({ color = "brand", className = "" }: TypingIndicatorProps) {
  const dotColor = color === "purple" ? "bg-purple-400" : "bg-brand";
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`}>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className={`inline-block h-[3px] w-[3px] rounded-full ${dotColor} animate-typing-dot`}
          style={{ animationDelay: `${String(delay)}ms` }}
        />
      ))}
    </span>
  );
}
