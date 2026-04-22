"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────
type DishPreset = {
  id: string;
  emoji: string | null;
  name: string;
  target: number;
  range?: [number, number];
};

type AnalysisResult = {
  zone: "低い" | "適温" | "高い";
  estimated_temp_range: string;
  confidence: number;
  advice: string;
};

type ScreenState = "select" | "measure";
type ActivityState = "idle" | "permission" | "listening" | "analyzing" | "paused" | "error";

// ─── Constants ────────────────────────────────────────────────
const CHUNK_DURATION_MS = 2000;
const MIN_T = 140;
const MAX_T = 220;

const DISHES: DishPreset[] = [
  { id: "karaage",  emoji: "🍗", name: "唐揚げ",         target: 180 },
  { id: "tempura",  emoji: "🍤", name: "天ぷら",         target: 170 },
  { id: "tonkatsu", emoji: "🍖", name: "トンカツ",       target: 170, range: [160, 180] },
  { id: "korokke",  emoji: "🥔", name: "コロッケ",       target: 180 },
  { id: "fries",    emoji: "🍟", name: "フライドポテト", target: 170 },
  { id: "custom",   emoji: null, name: "カスタム",       target: 170 },
];

// ─── Zone helpers (target-relative) ───────────────────────────
const ZONE_MARGIN = 10; // ±10°C from target = 適温

function buildMeterZones(target: number) {
  const lo = Math.max(MIN_T, target - ZONE_MARGIN);
  const hi = Math.min(MAX_T, target + ZONE_MARGIN);
  return [
    { from: MIN_T, to: lo,   color: "oklch(0.70 0.17 230)" }, // 低い — blue
    { from: lo,   to: hi,   color: "oklch(0.78 0.17 145)" }, // 適温 — green
    { from: hi,   to: MAX_T, color: "oklch(0.68 0.19 25)"  }, // 高い — red
  ];
}

function colorForTargetTemp(t: number, target: number): string {
  const zones = buildMeterZones(target);
  for (const z of zones) if (t >= z.from && t < z.to) return z.color;
  return zones[zones.length - 1].color;
}

// DishCard uses absolute scale (independent of any selected target)
function tempTint(t: number | null): string {
  if (!t) return "oklch(0.70 0.02 250)";
  if (t < 160) return "oklch(0.70 0.17 230)";
  if (t < 180) return "oklch(0.78 0.17 145)";
  if (t < 200) return "oklch(0.85 0.17 90)";
  return "oklch(0.68 0.19 25)";
}

// ─── Geometry helpers ─────────────────────────────────────────
function tempToAngle(t: number): number {
  const clamped = Math.max(MIN_T, Math.min(MAX_T, t));
  return -90 + ((clamped - MIN_T) / (MAX_T - MIN_T)) * 180;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const p1 = polar(cx, cy, r, a1);
  const p2 = polar(cx, cy, r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

function extractTemp(range: string | undefined, fallback: number): number {
  if (!range) return fallback;
  const nums = [...range.matchAll(/\d+/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  if (!nums.length) return fallback;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

// ─── MediaRecorder helpers ────────────────────────────────────
function resolveRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

function extensionForMimeType(mimeType: string): string {
  return mimeType.includes("mp4") ? "m4a" : "webm";
}

async function recordAudioChunk(
  stream: MediaStream,
  durationMs: number,
): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof MediaRecorder === "undefined")
    throw new Error("このブラウザでは録音に対応していません。");

  const mimeType = resolveRecorderMimeType();

  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    // mimeType rejected at construction — fall back to browser default
    recorder = new MediaRecorder(stream);
  }

  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (e) => { if (e.data.size > 0) chunks.push(e.data); });
    recorder.addEventListener("error", () => reject(new Error("録音処理でエラーが発生しました。")));
    recorder.addEventListener("stop", () => {
      const finalMime = recorder.mimeType || mimeType || "audio/webm";
      resolve({ blob: new Blob(chunks, { type: finalMime }), mimeType: finalMime });
    });

    try {
      recorder.start();
    } catch {
      // start() failed (e.g. iOS quirk) — reject cleanly
      reject(new Error("録音を開始できませんでした。マイクの設定を確認してください。"));
    }

    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

async function analyzeAudioChunk(
  blob: Blob,
  mimeType: string,
  target: number,
): Promise<AnalysisResult> {
  const ext = extensionForMimeType(mimeType);
  const fd = new FormData();
  fd.append("audio", blob, `chunk.${ext}`);
  fd.append("target", String(target));
  const res = await fetch("/api/analyze", { method: "POST", body: fd });
  const payload = (await res.json()) as AnalysisResult | { error?: string };
  if (!res.ok) throw new Error("error" in payload && payload.error ? payload.error : "判定APIでエラーが発生しました。");
  return payload as AnalysisResult;
}

// ─── UI Components ────────────────────────────────────────────

function ListeningBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-1.5 h-8">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-white/85"
          style={{
            height: 10,
            animation: active ? `barPulse 1000ms ease-in-out ${i * 120}ms infinite` : "none",
            opacity: active ? 1 : 0.2,
            transition: "opacity 300ms",
          }}
        />
      ))}
      <style>{`
        @keyframes barPulse {
          0%, 100% { height: 8px; opacity: 0.5; }
          50%       { height: 28px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function DeltaIndicator({ temp, target }: { temp: number; target: number }) {
  const diff = target - temp;
  const abs = Math.abs(diff);
  if (abs <= ZONE_MARGIN) return null;
  const steps = 5;
  const proximity = Math.max(0, Math.min(steps, steps - Math.floor(abs / 4)));
  const isUp = diff > 0;
  return (
    <div className="flex items-center justify-center gap-2.5 mt-1">
      <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: isUp ? "none" : "rotate(180deg)" }}>
        <path d="M14 4 L14 22 M6 12 L14 4 L22 12"
          stroke="rgba(255,255,255,0.85)" strokeWidth="3"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex gap-2">
        {Array.from({ length: steps }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full"
            style={{ background: i < proximity ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)" }}
          />
        ))}
      </div>
    </div>
  );
}

function OnTargetFlash({ visible }: { visible: boolean }) {
  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 400ms ease-out",
        background: "radial-gradient(circle at 50% 45%, oklch(0.78 0.17 145 / 0.42), oklch(0.28 0.08 145 / 0.1) 70%)",
      }}
    >
      <svg
        width="260" height="260" viewBox="0 0 260 260"
        style={{
          transform: visible ? "scale(1)" : "scale(0.6)",
          transition: "transform 500ms cubic-bezier(.2,1.2,.3,1)",
          filter: "drop-shadow(0 8px 30px oklch(0.78 0.17 145 / 0.9))",
        }}
      >
        <circle cx="130" cy="130" r="110" fill="oklch(0.78 0.17 145)" />
        <path d="M75 135 L115 175 L190 95"
          stroke="#0b1a10" strokeWidth="18"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function MeterSVG({ temp, target }: { temp: number; target: number }) {
  const W = 400;
  const H = 260;
  const cx = W / 2;
  const cy = 210;
  const rTrack = 168;
  const trackW = 32;

  const zones = buildMeterZones(target);
  const needleA = tempToAngle(temp);
  const tip = polar(cx, cy, rTrack - 6, needleA);
  const baseL = polar(cx, cy, 12, needleA - 90);
  const baseR = polar(cx, cy, 12, needleA + 90);

  const targetA = tempToAngle(target);
  const notchOuterR = rTrack + trackW / 2 + 4;
  const notchTipR = rTrack + trackW / 2 - 2;
  const n0 = polar(cx, cy, notchTipR, targetA);
  const n1 = polar(cx, cy, notchOuterR, targetA - 3);
  const n2 = polar(cx, cy, notchOuterR, targetA + 3);

  const currentColor = colorForTargetTemp(temp, target);

  const ticks: React.ReactNode[] = [];
  for (let t = MIN_T; t <= MAX_T; t += 10) {
    const a = tempToAngle(t);
    const isMajor = (t - MIN_T) % 20 === 0;
    const innerR = rTrack - trackW / 2 - (isMajor ? 14 : 8);
    const outerR = rTrack - trackW / 2 - 2;
    const p1 = polar(cx, cy, innerR, a);
    const p2 = polar(cx, cy, outerR, a);
    ticks.push(
      <line key={t} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={isMajor ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)"}
        strokeWidth={isMajor ? 2.5 : 1.5} strokeLinecap="round" />
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%" }} aria-hidden="true">
      <path d={arcPath(cx, cy, rTrack, -90, 90)}
        stroke="rgba(255,255,255,0.06)" strokeWidth={trackW}
        strokeLinecap="butt" fill="none" />
      {zones.map((z, i) => (
        <path key={i} d={arcPath(cx, cy, rTrack, tempToAngle(z.from), tempToAngle(z.to))}
          stroke={z.color} strokeWidth={trackW - 6}
          strokeLinecap="butt" fill="none" opacity={0.92} />
      ))}
      {ticks}
      <polygon points={`${n0.x},${n0.y} ${n1.x},${n1.y} ${n2.x},${n2.y}`} fill="#fff" />
      <g style={{ filter: `drop-shadow(0 2px 8px ${currentColor})`, transition: "filter 220ms linear" }}>
        <polygon points={`${baseL.x},${baseL.y} ${tip.x},${tip.y} ${baseR.x},${baseR.y}`} fill={currentColor} />
      </g>
      <circle cx={cx} cy={cy} r={16} fill="#1a1d24" stroke={currentColor} strokeWidth={3} />
      <circle cx={cx} cy={cy} r={5} fill={currentColor} />
    </svg>
  );
}

// ─── Screens ──────────────────────────────────────────────────

function DishCard({ dish, onPress }: { dish: DishPreset; onPress: (d: DishPreset) => void }) {
  const [pressed, setPressed] = useState(false);
  const tint = tempTint(dish.target);
  const isCustom = dish.id === "custom";

  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onPress(dish)}
      className="relative overflow-hidden flex flex-col items-center justify-between"
      style={{
        background: "linear-gradient(180deg, #1a1d24 0%, #15171d 100%)",
        borderRadius: 18,
        aspectRatio: "1 / 1",
        padding: "10px 6px 8px",
        boxShadow: pressed
          ? `0 0 0 1px ${tint}, inset 0 2px 6px rgba(0,0,0,0.5)`
          : "0 0 0 1px rgba(255,255,255,0.06), 0 6px 16px rgba(0,0,0,0.4)",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        transition: "transform 120ms ease, box-shadow 180ms ease",
        cursor: "pointer",
      }}
    >
      <div className="w-full flex justify-end pr-1">
        {!isCustom && (
          <div className="w-3 h-3 rounded-full" style={{ background: tint, boxShadow: `0 0 10px ${tint}` }} />
        )}
      </div>
      <div className="flex-1 flex items-center justify-center" style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}>
        {isCustom ? (
          <svg width="44" height="44" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeDasharray="4 6" />
            <circle cx="32" cy="32" r="14" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
            <line x1="32" y1="32" x2="48" y2="20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="32" r="3" fill="#fff" />
          </svg>
        ) : dish.emoji}
      </div>
      <div className="flex items-baseline gap-0.5" style={{ fontVariantNumeric: "tabular-nums", color: tint }}>
        {isCustom ? (
          <span style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: -1 }}>···°</span>
        ) : dish.range ? (
          <div className="flex items-baseline gap-1">
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>{dish.range[0]}</span>
            <svg width="14" height="12" viewBox="0 0 14 12" style={{ opacity: 0.7 }}>
              <path d="M1 6 H11 M8 3 L12 6 L8 9" stroke={tint} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>{dish.range[1]}°</span>
          </div>
        ) : (
          <>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.5 }}>{dish.target}</span>
            <span style={{ fontSize: 20, fontWeight: 700, opacity: 0.9 }}>°</span>
          </>
        )}
      </div>
    </button>
  );
}

function SelectScreen({ onPick }: { onPick: (d: DishPreset) => void }) {
  return (
    <div className="w-full min-h-screen relative overflow-hidden flex flex-col" style={{ background: "#0b0d11", color: "#fff" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 40% at 50% 0%, oklch(0.30 0.04 60 / 0.35), transparent 60%)" }} />
      <div className="relative z-10 pt-10 px-6 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M8 3 C 8 6, 6 6, 6 9 C 6 11, 8 11, 8 13" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M12 3 C 12 6, 10 6, 10 9 C 10 11, 12 11, 12 13" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M16 3 C 16 6, 14 6, 14 9 C 14 11, 16 11, 16 13" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">TempuraTune</span>
        </div>
        <h1 className="m-0 text-[26px] font-extrabold leading-tight" style={{ letterSpacing: -0.8 }}>
          今日は何を<br />作る?
        </h1>
        <p className="mt-2 text-sm leading-5 text-white/55 max-w-xs">
          キッチンにスマホを置いたまま、2秒ごとに油音を解析します。まずは料理を選んで、目標温度をセットしてください。
        </p>
      </div>
      <div className="relative z-10 flex-1 grid gap-2 px-4 pb-4" style={{ gridTemplateColumns: "1fr 1fr", alignContent: "start" }}>
        {DISHES.map((d) => (
          <DishCard key={d.id} dish={d} onPress={onPick} />
        ))}
      </div>
    </div>
  );
}

function MeasureScreen({
  dish,
  result,
  activity,
  errorMessage,
  onBack,
  onStart,
  onPause,
  onResume,
  onRetry,
}: {
  dish: DishPreset;
  result: AnalysisResult | null;
  activity: ActivityState;
  errorMessage: string;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const temp = extractTemp(result?.estimated_temp_range, dish.target);
  const currentColor = colorForTargetTemp(temp, dish.target);
  const onTarget = result !== null && Math.abs(temp - dish.target) <= ZONE_MARGIN;
  const isActive = activity === "listening" || activity === "analyzing" || activity === "permission";
  const isIdle = activity === "idle";
  const isPaused = activity === "paused";

  return (
    <div className="w-full min-h-screen relative overflow-hidden flex flex-col" style={{ background: "#0b0d11", color: "#fff" }}>
      {/* Zone glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 18%, ${currentColor} 0%, transparent 60%)`,
          opacity: isActive ? 0.14 : 0.05,
          transition: "background 400ms linear, opacity 400ms",
        }}
      />

      <OnTargetFlash visible={onTarget} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-white/55 hover:text-white/80 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 4 L6 9 L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          戻る
        </button>
        <div className="flex items-center gap-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="3" width="6" height="12" rx="3" fill="rgba(255,255,255,0.85)" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <ListeningBars active={isActive} />
        </div>
      </div>

      {/* Meter */}
      <div className="relative z-10 flex justify-center pt-2">
        <div className="relative w-full max-w-[400px]">
          <MeterSVG temp={temp} target={dish.target} />
          <div className="absolute left-0 right-0 flex flex-col items-center" style={{ top: "54%" }}>
            <div
              style={{
                fontSize: 100,
                fontWeight: 800,
                letterSpacing: -4,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color: currentColor,
                textShadow: `0 0 40px ${currentColor}55`,
                transition: "color 300ms linear",
                opacity: isIdle || isPaused ? 0.4 : 1,
              }}
            >
              {result ? Math.round(temp) : "--"}
              <span style={{ fontSize: 40, fontWeight: 700, marginLeft: 4, verticalAlign: "top", color: "rgba(255,255,255,0.7)" }}>
                {result ? "°" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delta indicator */}
      <div className="relative z-10 flex justify-center items-center min-h-8 -mt-2">
        {result && isActive && <DeltaIndicator temp={temp} target={dish.target} />}
      </div>

      {/* Target row */}
      <div className="relative z-10 flex justify-center items-center gap-2.5 mt-2">
        <svg width="20" height="20" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          <circle cx="11" cy="11" r="3" fill="#fff" />
        </svg>
        <div style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontVariantNumeric: "tabular-nums" }}>
          {dish.range ? `${dish.range[0]}→${dish.range[1]}°` : `${dish.target}°`}
        </div>
      </div>

      {/* Advice */}
      {result && (
        <div className="relative z-10 mx-5 mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm leading-6 text-white/70">{result.advice}</p>
        </div>
      )}

      {/* Confidence bar */}
      {result && (
        <div className="relative z-10 mx-5 mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round(result.confidence * 100)}%`, background: currentColor }}
            />
          </div>
          <span className="text-xs text-white/40 tabular-nums w-8 text-right">
            {Math.round(result.confidence * 100)}%
          </span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="relative z-10 mx-6 mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 text-center">
          {errorMessage}
        </div>
      )}

      <div className="flex-1" />

      {/* Bottom action button */}
      <div className="relative z-10 flex justify-center pb-12">
        {activity === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            className="px-8 py-4 rounded-full text-base font-bold text-black bg-white"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
          >
            もう一度はじめる
          </button>
        ) : (
          <button
            type="button"
            onClick={isIdle || isPaused ? (isIdle ? onStart : onResume) : onPause}
            className="flex items-center justify-center"
            style={{
              width: 88, height: 88, borderRadius: 9999,
              background: "transparent",
              border: `4px solid ${isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}`,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              transition: "border-color 300ms",
            }}
          >
            {isActive ? (
              // Pause ⏸
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="6" y="5" width="6" height="18" rx="2" fill="rgba(255,255,255,0.85)" />
                <rect x="16" y="5" width="6" height="18" rx="2" fill="rgba(255,255,255,0.85)" />
              </svg>
            ) : (
              // Play ▶ (idle or paused)
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M9 5 L23 14 L9 23 Z" fill="rgba(255,255,255,0.85)" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function Home() {
  const [screen, setScreen] = useState<ScreenState>("select");
  const [activity, setActivity] = useState<ActivityState>("idle");
  const [selectedDish, setSelectedDish] = useState<DishPreset | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasMicSupport] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
  });

  const streamRef = useRef<MediaStream | null>(null);
  const loopActiveRef = useRef(false);
  const pendingCallRef = useRef(false);

  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Overlap: fire API in background, immediately continue to next recording
  async function runAnalysisLoop(stream: MediaStream, target: number) {
    loopActiveRef.current = true;
    pendingCallRef.current = false;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 3;

    while (loopActiveRef.current) {
      try {
        setActivity("listening");
        const { blob, mimeType } = await recordAudioChunk(stream, CHUNK_DURATION_MS);
        if (!loopActiveRef.current) break;

        // Fire API call without awaiting — overlap with next recording
        if (!pendingCallRef.current) {
          pendingCallRef.current = true;
          analyzeAudioChunk(blob, mimeType, target)
            .then((next) => {
              pendingCallRef.current = false;
              if (!loopActiveRef.current) return;
              setResult(next);
              setErrorMessage("");
              consecutiveErrors = 0;
            })
            .catch((error) => {
              pendingCallRef.current = false;
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_ERRORS) {
                loopActiveRef.current = false;
                setActivity("error");
                setErrorMessage(error instanceof Error ? error.message : "判定に失敗しました。");
              }
            });
        }
        // Loop continues immediately → next recording
      } catch (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_ERRORS) {
          loopActiveRef.current = false;
          setActivity("error");
          setErrorMessage(error instanceof Error ? error.message : "録音に失敗しました。");
          break;
        }
      }
    }
  }

  // Navigate to Screen 2 without starting — user presses ▶ manually
  function selectDish(dish: DishPreset) {
    setScreen("measure");
    setSelectedDish(dish);
    setResult(null);
    setErrorMessage("");
    setActivity("idle");
  }

  async function startRecording(dish: DishPreset) {
    if (!hasMicSupport) {
      setActivity("error");
      setErrorMessage("このブラウザではマイク録音に対応していません。");
      return;
    }
    setActivity("permission");
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      await runAnalysisLoop(stream, dish.target);
    } catch (error) {
      loopActiveRef.current = false;
      setActivity("error");
      setErrorMessage(error instanceof Error ? error.message : "判定に失敗しました。");
    }
  }

  function pauseMeasurement() {
    loopActiveRef.current = false;
    pendingCallRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActivity("paused");
  }

  async function resumeMeasurement() {
    if (!selectedDish) return;
    setErrorMessage("");
    await startRecording(selectedDish);
  }

  function goBack() {
    loopActiveRef.current = false;
    pendingCallRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActivity("idle");
    setScreen("select");
    setResult(null);
    setErrorMessage("");
  }

  if (screen === "select") {
    return <SelectScreen onPick={selectDish} />;
  }

  return (
    <MeasureScreen
      dish={selectedDish!}
      result={result}
      activity={activity}
      errorMessage={errorMessage}
      onBack={goBack}
      onStart={() => selectedDish && void startRecording(selectedDish)}
      onPause={pauseMeasurement}
      onResume={() => void resumeMeasurement()}
      onRetry={() => selectedDish && void startRecording(selectedDish)}
    />
  );
}
