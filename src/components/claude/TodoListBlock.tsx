interface TodoItem {
  id?: string;
  content?: string;
  status?: string;
  priority?: string;
  activeForm?: string;
}

interface TodoListBlockProps {
  todos: TodoItem[];
}

/** Status icon for a todo item */
function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0 text-status-done" viewBox="0 0 16 16" fill="none">
        <circle
          cx="8"
          cy="8"
          r="7"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="var(--status-done-muted)"
        />
        <path
          d="M5 8.5l2 2 4-4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === "in_progress") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0 text-brand" viewBox="0 0 16 16" fill="none">
        <circle
          cx="8"
          cy="8"
          r="7"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="var(--brand-muted)"
        />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    );
  }

  // pending / unknown
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-on-surface-faint" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Priority indicator */
function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high") {
    return (
      <span className="shrink-0 rounded-xs bg-danger-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-danger">
        high
      </span>
    );
  }
  if (priority === "medium") {
    return (
      <span className="shrink-0 rounded-xs bg-accent-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
        med
      </span>
    );
  }
  return null;
}

/** Render a list of Claude Code TodoWrite items as a proper checklist */
export function TodoListBlock({ todos }: TodoListBlockProps) {
  if (!todos.length) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;

  return (
    <div className="space-y-px">
      {/* Progress summary */}
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-outline-muted">
          <div
            className="h-full rounded-full bg-status-done transition-all duration-300"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-on-surface-faint">
          {completed}/{total}
        </span>
      </div>

      {/* Task list */}
      {todos.map((todo, i) => {
        const status = todo.status ?? "pending";
        const label = todo.content ?? todo.activeForm ?? "Untitled task";
        const isCompleted = status === "completed";

        return (
          <div key={todo.id ?? i} className="flex items-start gap-2 rounded-xs px-1 py-1">
            <div className="mt-px">
              <StatusIcon status={status} />
            </div>
            <span
              className={`min-w-0 flex-1 text-xs leading-relaxed ${
                isCompleted
                  ? "text-on-surface-faint line-through decoration-on-surface-faint/40"
                  : "text-on-surface"
              }`}
            >
              {label}
            </span>
            {todo.priority && <PriorityBadge priority={todo.priority} />}
          </div>
        );
      })}
    </div>
  );
}
