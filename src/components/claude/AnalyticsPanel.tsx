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
        <p className="text-xs text-gray-400 dark:text-gray-500">No analytics data yet</p>
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
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Tool Usage
          </h4>
          <div className="space-y-1">
            {sortedTools.map(([name, counts]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <span className="font-mono text-gray-700 dark:text-gray-300">{name}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {counts.total}
                  {counts.failed > 0 && (
                    <span className="ml-1 text-red-500">({counts.failed} failed)</span>
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
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Recent Activity
          </h4>
          <div className="space-y-0.5">
            {analytics.toolCalls
              .slice(-20)
              .reverse()
              .map((call, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${call.success ? "bg-green-500" : "bg-red-500"}`}
                  />
                  <span className="font-mono text-gray-600 dark:text-gray-400">
                    {call.toolName}
                  </span>
                  <span className="ml-auto text-gray-400 dark:text-gray-500">
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
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
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
