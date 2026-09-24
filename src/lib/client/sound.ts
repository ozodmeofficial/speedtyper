"use client";

import type { SoundId } from "@/lib/settings";

/** Tiny synthesized key sounds (no audio files to download). */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(ac.sampleRate * 0.05);
  noise = ac.createBuffer(1, len, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  return noise;
}

export function playKey(sound: SoundId, volume: number, error = false) {
  if (sound === "off" || volume <= 0) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const out = ac.createGain();
  out.connect(ac.destination);
  const v = Math.min(1, volume) * 0.6;
  const jitter = 1 + (Math.random() - 0.5) * 0.12;

  if (sound === "click" || sound === "typewriter") {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = (sound === "click" ? 3200 : 1800) * jitter;
    filter.Q.value = sound === "click" ? 1.2 : 0.8;
    src.connect(filter).connect(out);
    out.gain.setValueAtTime(v * (sound === "typewriter" ? 1.4 : 1), t);
    out.gain.exponentialRampToValueAtTime(0.001, t + (sound === "typewriter" ? 0.06 : 0.035));
    src.start(t);
    src.stop(t + 0.07);
    if (sound === "typewriter") {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 180 * jitter;
      g.gain.setValueAtTime(v * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.05);
    }
  } else {
    const o = ac.createOscillator();
    o.type = sound === "pop" ? "sine" : "triangle";
    const base = sound === "pop" ? 520 : 330;
    o.frequency.setValueAtTime(base * jitter * (error ? 0.7 : 1), t);
    o.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.05);
    o.connect(out);
    out.gain.setValueAtTime(v * 0.7, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.start(t);
    o.stop(t + 0.07);
  }
}
