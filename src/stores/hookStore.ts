import { create } from "zustand";
import type { HookEventPayload } from "../lib/types";

const MAX_RECENT_EVENTS = 100;

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  sessionId: string;
  cwd: string;
  timestamp: number;
}

interface HookState {
  pendingPermissions: PendingPermission[];
  recentEvents: HookEventPayload[];

  addPermissionRequest: (payload: HookEventPayload) => void;
  removePermissionRequest: (requestId: string) => void;
  addHookEvent: (payload: HookEventPayload) => void;
}

export const useHookStore = create<HookState>((set) => ({
  pendingPermissions: [],
  recentEvents: [],

  addPermissionRequest: (payload) =>
    set((state) => ({
      pendingPermissions: [
        ...state.pendingPermissions,
        {
          requestId: payload.requestId,
          toolName: payload.event.tool_name ?? "unknown",
          toolInput: payload.event.tool_input,
          sessionId: payload.event.session_id,
          cwd: payload.event.cwd,
          timestamp: Date.now(),
        },
      ],
    })),

  removePermissionRequest: (requestId) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter(
        (p) => p.requestId !== requestId,
      ),
    })),

  addHookEvent: (payload) =>
    set((state) => {
      const events = [...state.recentEvents, payload];
      // Keep only the last N events
      if (events.length > MAX_RECENT_EVENTS) {
        events.splice(0, events.length - MAX_RECENT_EVENTS);
      }
      return { recentEvents: events };
    }),
}));
