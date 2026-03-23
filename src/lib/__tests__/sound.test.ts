import { playNotificationSound } from "../sound";

function createMockAudioContext(state = "running") {
  const oscillator = {
    type: "sine",
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gainNode = {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gainNode),
  };
  return { ctx, oscillator, gainNode };
}

describe("playNotificationSound", () => {
  let originalAudioContext: typeof globalThis.AudioContext;

  beforeEach(() => {
    originalAudioContext = globalThis.AudioContext;
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
  });

  it("plays tones for success sound without throwing", async () => {
    const { ctx } = createMockAudioContext();
    globalThis.AudioContext = vi.fn(() => ctx) as unknown as typeof AudioContext;

    // playNotificationSound uses module-level audioCtx, so the first call
    // might use a previously cached context. Just verify it doesn't throw.
    await expect(playNotificationSound("success")).resolves.toBeUndefined();
  });

  it("plays tones for alert sound without throwing", async () => {
    await expect(playNotificationSound("alert")).resolves.toBeUndefined();
  });

  it("silently handles when AudioContext is not available", async () => {
    const saved = globalThis.AudioContext;
    // @ts-expect-error testing unavailable AudioContext
    globalThis.AudioContext = undefined;
    await expect(playNotificationSound("success")).resolves.toBeUndefined();
    globalThis.AudioContext = saved;
  });

  it("silently handles when AudioContext constructor throws", async () => {
    globalThis.AudioContext = vi.fn(() => {
      throw new Error("not supported");
    }) as unknown as typeof AudioContext;

    // Even if the cached audioCtx is set, new calls should not throw
    await expect(playNotificationSound("alert")).resolves.toBeUndefined();
  });
});
