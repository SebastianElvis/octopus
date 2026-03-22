import { useSessionStore } from "../stores/sessionStore";

export function DispatchBoard() {
  const sessions = useSessionStore((s) => s.sessions);

  const waiting = sessions.filter((s) => s.status === "waiting");
  const running = sessions.filter((s) => s.status === "running");
  const idle = sessions.filter(
    (s) => s.status === "idle" || s.status === "done",
  );

  return (
    <div className="space-y-8">
      <Section
        title="Needs Input"
        count={waiting.length}
        accentColor="red"
        empty="No sessions waiting for input."
      />
      <Section
        title="Running"
        count={running.length}
        accentColor="green"
        empty="No sessions running."
      />
      <Section
        title="Idle"
        count={idle.length}
        accentColor="gray"
        empty="No idle sessions."
      />
    </div>
  );
}

function Section({
  title,
  count,
  accentColor,
  empty,
}: {
  title: string;
  count: number;
  accentColor: string;
  empty: string;
}) {
  const colors: Record<string, string> = {
    red: "border-red-500",
    green: "border-green-500",
    gray: "border-gray-600",
  };

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        <span className={`inline-block h-2 w-2 rounded-full border-2 ${colors[accentColor]}`} />
        {title}
        <span className="text-gray-600">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-gray-600">{empty}</p>
      ) : (
        <div className="grid gap-3">
          {/* Session cards will be rendered here */}
        </div>
      )}
    </section>
  );
}
