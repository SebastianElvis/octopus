import { requestNotificationPermission, sendSystemNotification } from "../notifications";
import { isTauri } from "../env";

vi.mock("../env", () => ({
  isTauri: vi.fn(() => false),
}));

const mockIsTauri = vi.mocked(isTauri);

describe("requestNotificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
    mockIsTauri.mockReturnValue(false);
  });

  it("returns false outside Tauri", async () => {
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
  });

  it("returns true when permission already granted", async () => {
    mockIsTauri.mockReturnValue(true);
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn(() => Promise.resolve(true)),
      requestPermission: vi.fn(),
    }));

    const mod = await import("../notifications");
    const result = await mod.requestNotificationPermission();
    expect(result).toBe(true);
  });

  it("requests permission when not yet granted", async () => {
    mockIsTauri.mockReturnValue(true);
    const requestPermission = vi.fn(() => Promise.resolve("granted"));
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn(() => Promise.resolve(false)),
      requestPermission,
    }));

    const mod = await import("../notifications");
    const result = await mod.requestNotificationPermission();
    expect(requestPermission).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when permission denied", async () => {
    mockIsTauri.mockReturnValue(true);
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn(() => Promise.resolve(false)),
      requestPermission: vi.fn(() => Promise.resolve("denied")),
    }));

    const mod = await import("../notifications");
    const result = await mod.requestNotificationPermission();
    expect(result).toBe(false);
  });

  it("returns false on error", async () => {
    mockIsTauri.mockReturnValue(true);
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn(() => Promise.reject(new Error("fail"))),
    }));

    const mod = await import("../notifications");
    const result = await mod.requestNotificationPermission();
    expect(result).toBe(false);
  });
});

describe("sendSystemNotification", () => {
  beforeEach(() => {
    vi.resetModules();
    mockIsTauri.mockReturnValue(false);
  });

  it("is a no-op outside Tauri", async () => {
    await expect(sendSystemNotification("title", "body")).resolves.toBeUndefined();
  });

  it("logs error on send failure", async () => {
    mockIsTauri.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn(() => Promise.resolve(true)),
      requestPermission: vi.fn(() => Promise.resolve("granted")),
      sendNotification: vi.fn(() => {
        throw new Error("send fail");
      }),
    }));

    const mod = await import("../notifications");
    await mod.requestNotificationPermission(); // Grant first
    await mod.sendSystemNotification("title", "body");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
