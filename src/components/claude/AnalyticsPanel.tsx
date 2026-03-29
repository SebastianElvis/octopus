import { useEffect, useState } from "react";
import type { SessionAnalytics } from "../../lib/types";
import { isTauri } from "../../lib/env";
import { getSessionAnalytics } from "../../lib/tauri";

interface AnalyticsPanelProps {
  sessionId: string;
  sessionStatus: string;
}

export function AnalyticsPanel({ sessionId, sessionStatus }: AnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);

  // Fetch analytics on mount, status change, and periodically while running
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isTauri()) return;
      try {
        const data = await getSessionAnalytics(sessionId);
        if (!cancelled) setAnalytics(data);
      } catch {
        // Ignore errors
      }
    }
    void load();

    // Auto-refresh every 5s while running
    if (sessionStatus !== "running")
      return () => {
        cancelled = true;
      };
    const interval = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, sessionStatus]);

  if (!analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-on-surface-faint">No analytics data yet</p>
      </div>
    );
  }

  // Count tools by name
  const toolCounts = new Map<string, { total: number; failed: number }>();
  for (const call of analytics.toolCalls) {
    const existing = toolCounts.get(call.toolName) ?? { total: 0, failed: 0 };
    existing.total++;
    if (!call.success) existing.failed++;
    toolCounts.set(call.toolName, existing);
  }
  const sortedTools = [...toolCounts.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Cost"
          value={analytics.totalCostUsd > 0 ? `$${analytics.totalCostUsd.toFixed(4)}` : "—"}
        />
        <StatCard
          label="Duration"
          value={analytics.totalDurationMs > 0 ? formatDuration(analytics.totalDurationMs) : "—"}
        />
        <StatCard
          label="Input tokens"
          value={analytics.inputTokens > 0 ? analytics.inputTokens.toLocaleString() : "—"}
        />
        <StatCard
          label="Output tokens"
          value={analytics.outputTokens > 0 ? analytics.outputTokens.toLocaleString() : "—"}
        />
      </div>

      {/* Tool calls breakdown */}
      {sortedTools.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
            Tool Usage
          </h4>
          <div className="space-y-1">
            {sortedTools.map(([name, counts]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-hover"
              >
                <span className="font-mono text-on-surface">{name}</span>
                <span className="text-on-surface-muted">
                  {counts.total}
                  {counts.failed > 0 && (
                    <span className="ml-1 text-danger">({counts.failed} failed)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent tool calls timeline */}
      {analytics.toolCalls.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
            Recent Activity
          </h4>
          <div className="space-y-0.5">
            {analytics.toolCalls
              .slice(-20)
              .reverse()
              .map((call, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${call.success ? "bg-status-done" : "bg-danger"}`}
                  />
                  <span className="font-mono text-on-surface-muted">
                    {call.toolName}
                  </span>
                  <span className="ml-auto text-on-surface-faint">
                    {formatTime(call.timestamp)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-outline px-3 py-2">
      <p className="text-xs text-on-surface-muted">{label}</p>
      <p className="text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = Math.round(sec % 60);
  return `${min}m ${remainSec}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
