/** Simple audio notification using Web Audio API. */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

/**
 * Play a short notification sound.
 * - "alert": two-tone attention chime (for waiting/stuck/failed)
 * - "success": pleasant ascending tone (for completed)
 */
export async function playNotificationSound(type: "alert" | "success"): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    if (type === "success") {
      // Ascending two-note chime
      playTone(ctx, 523.25, now, 0.12, 0.3); // C5
      playTone(ctx, 659.25, now + 0.15, 0.15, 0.3); // E5
    } else {
      // Two-tone alert
      playTone(ctx, 440, now, 0.1, 0.4); // A4
      playTone(ctx, 440, now + 0.2, 0.1, 0.4); // A4 again
    }
  } catch {
    // Audio not available — silently ignore
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}
