import { isTauri } from "./env";

let permissionGranted = false;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === "granted";
    }
    return permissionGranted;
  } catch {
    return false;
  }
}

export async function sendSystemNotification(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    if (!permissionGranted) {
      await requestNotificationPermission();
    }
    if (!permissionGranted) return;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
  } catch (err) {
    console.error("[notifications] Failed to send:", err);
  }
}
