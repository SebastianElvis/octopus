import { timeAgo } from "../lib/utils";

interface TimelineEvent {
  status: string;
  timestamp: number;
}

interface SessionTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const DOT_COLOR: Record<string, string> = {
  waiting: "bg-red-500",
  running: "bg-green-500",
  idle: "bg-gray-500",
  done: "bg-gray-500",
  killed: "bg-gray-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  paused: "bg-yellow-500",
  stuck: "bg-orange-500",
  interrupted: "bg-amber-500",
};

const LABEL_COLOR: Record<string, string> = {
  waiting: "text-red-500",
  running: "text-green-500",
  idle: "text-gray-500 dark:text-gray-400",
  done: "text-gray-500 dark:text-gray-400",
  killed: "text-gray-500 dark:text-gray-400",
  completed: "text-green-500",
  failed: "text-red-500",
  paused: "text-yellow-500",
  stuck: "text-orange-500",
  interrupted: "text-amber-500",
};

function dotColor(status: string): string {
  return DOT_COLOR[status] ?? "bg-gray-500";
}

function labelColor(status: string): string {
  return LABEL_COLOR[status] ?? "text-gray-500 dark:text-gray-400";
}

export default function SessionTimeline({ events, className = "" }: SessionTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className={`rounded-lg bg-white p-3 dark:bg-gray-950 dark:text-gray-100 ${className}`}>
      <ol className="relative ml-2">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;

          return (
            <li key={i} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* Connecting line */}
              {!isLast && (
                <span
                  className="absolute left-[5px] top-3 h-full w-px bg-gray-300 dark:bg-gray-700"
                  aria-hidden="true"
                />
              )}

              {/* Dot */}
              <span
                className={`relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white dark:ring-gray-950 ${dotColor(event.status)}`}
              />

              {/* Content */}
              <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                <span className={`text-xs font-semibold capitalize ${labelColor(event.status)}`}>
                  {event.status}
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
