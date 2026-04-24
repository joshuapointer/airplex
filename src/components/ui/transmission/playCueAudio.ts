// src/components/ui/transmission/playCueAudio.ts
// 160ms soft thunk via Web Audio. Idempotent-safe if AudioContext is
// unavailable or suspended. NEVER throws. Returns void (never a Promise).

let ctx: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

export function playCueAudio(): void {
  try {
    if (typeof window === 'undefined') return;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;

    if (!ctx) {
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const dur = 0.16;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    gain.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    oscA.type = 'triangle';
    oscA.frequency.setValueAtTime(200, now);

    const oscBGain = ctx.createGain();
    oscBGain.gain.setValueAtTime(0.125, now); // -18dB relative blend
    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.setValueAtTime(800, now);

    oscA.connect(gain);
    oscB.connect(oscBGain);
    oscBGain.connect(gain);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + dur);
    oscB.stop(now + dur);
  } catch {
    // never throw, never log
  }
}
