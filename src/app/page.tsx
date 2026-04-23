"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────
type TargetMode = {
  id: "low" | "medium" | "high";
  emoji: string;
  label: string;
  sublabel: string;
  tempRange: string;
  targetTemp: number;
};

type AnalysisResult = {
  current_zone: "TOO_LOW" | "LOW" | "MEDIUM" | "HIGH" | "TOO_HIGH";
  judgment: "UNDER" | "PERFECT" | "OVER";
};

type ScreenState = "select" | "measure";
type ActivityState = "idle" | "permission" | "listening" | "analyzing" | "paused" | "error";

// ─── Constants ────────────────────────────────────────────────
const CHUNK_DURATION_MS = 2000;
const MIN_T = 140;
const MAX_T = 220;

const MODES: TargetMode[] = [
  { id: "low",    emoji: "🥬", label: "低温",  sublabel: "野菜・ポテト",       tempRange: "160–165°C", targetTemp: 162 },
  { id: "medium", emoji: "🍗", label: "中温",  sublabel: "唐揚げ・トンカツ",    tempRange: "170–175°C", targetTemp: 172 },
  { id: "high",   emoji: "🍤", label: "高温",  sublabel: "天ぷら・魚介",       tempRange: "180–185°C", targetTemp: 182 },
];

// 5 fixed temperature zones (boundaries bridging the gaps between defined ranges)
const ZONE_DEFS = [
  { id: "TOO_LOW",  from: MIN_T, to: 158,   color: "oklch(0.60 0.08 240)" },
  { id: "LOW",      from: 158,   to: 167,   color: "oklch(0.72 0.17 230)" },
  { id: "MEDIUM",   from: 167,   to: 177,   color: "oklch(0.78 0.17 145)" },
  { id: "HIGH",     from: 177,   to: 192,   color: "oklch(0.83 0.16 55)"  },
  { id: "TOO_HIGH", from: 192,   to: MAX_T, color: "oklch(0.68 0.19 25)"  },
] as const;

// Needle rests at zone center when no estimated_temp available
const ZONE_NEEDLE_TEMP: Record<string, number> = {
  TOO_LOW:  149,
  LOW:      163,
  MEDIUM:   172,
  HIGH:     184,
  TOO_HIGH: 207,
};

// Zone display data: English name + onomatopoeia
const ZONE_DISPLAY: Record<string, { name: string; onomato: string }> = {
  TOO_LOW:  { name: "Too Low",  onomato: "ボコ…ボコ…" },
  LOW:      { name: "Low",      onomato: "シュワシュワ" },
  MEDIUM:   { name: "Medium",   onomato: "ピチピチ" },
  HIGH:     { name: "High",     onomato: "チリチリ" },
  TOO_HIGH: { name: "Too High", onomato: "バチ！パン！" },
};

const ZONE_FOR_MODE: Record<"low" | "medium" | "high", AnalysisResult["current_zone"]> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

function colorForZone(zone: string): string {
  const def = ZONE_DEFS.find((z) => z.id === zone);
  return def?.color ?? "rgba(255,255,255,0.5)";
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
  mode: "low" | "medium" | "high",
): Promise<AnalysisResult> {
  const ext = extensionForMimeType(mimeType);
  const fd = new FormData();
  fd.append("audio", blob, `chunk.${ext}`);
  fd.append("mode", mode);
  const res = await fetch("/api/analyze", { method: "POST", body: fd });
  const payload = (await res.json()) as AnalysisResult | { error?: string };
  if (!res.ok) throw new Error("error" in payload && payload.error ? payload.error : "判定APIでエラーが発生しました。");
  return payload as AnalysisResult;
}

// ─── UI Components ────────────────────────────────────────────

function StatusBadge({ activity }: { activity: ActivityState }) {
  const config: Record<string, { text: string; color: string; dot?: boolean }> = {
    permission: { text: "Getting mic...",  color: "rgba(255,255,255,0.5)" },
    listening:  { text: "LISTENING",       color: "oklch(0.83 0.16 55)",  dot: true },
    analyzing:  { text: "ANALYZING",       color: "rgba(255,255,255,0.6)", dot: true },
    paused:     { text: "PAUSED",          color: "rgba(255,255,255,0.35)" },
  };
  const c = config[activity];
  if (!c) return <div style={{ height: 32 }} />;
  return (
    <div className="relative z-10 flex justify-center pb-1">
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
        {c.dot && (
          <span style={{
            width: 7, height: 7, borderRadius: 9999, background: c.color, flexShrink: 0,
            animation: "dotPulse 1.2s ease-in-out infinite",
            display: "inline-block",
          }} />
        )}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: c.color }}>
          {c.text}
        </span>
      </div>
      <style>{`
        @keyframes dotPulse { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
        @keyframes tunePulse { 0%,100%{opacity:.35} 50%{opacity:.9} }
      `}</style>
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

function MeterSVG({ temp, targetTemp, currentZone }: { temp: number; targetTemp: number; currentZone: string }) {
  const W = 400;
  const H = 260;
  const cx = W / 2;
  const cy = 210;
  const rTrack = 168;
  const trackW = 32;

  const needleA = tempToAngle(temp);
  const tip = polar(cx, cy, rTrack - 6, needleA);
  const baseL = polar(cx, cy, 12, needleA - 90);
  const baseR = polar(cx, cy, 12, needleA + 90);

  const targetA = tempToAngle(targetTemp);
  const notchOuterR = rTrack + trackW / 2 + 4;
  const notchTipR = rTrack + trackW / 2 - 2;
  const n0 = polar(cx, cy, notchTipR, targetA);
  const n1 = polar(cx, cy, notchOuterR, targetA - 3);
  const n2 = polar(cx, cy, notchOuterR, targetA + 3);

  const currentColor = colorForZone(currentZone);

  const ticks = [];
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
      {ZONE_DEFS.map((z, i) => (
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

function ModeCard({ mode, onPress }: { mode: TargetMode; onPress: (m: TargetMode) => void }) {
  const [pressed, setPressed] = useState(false);
  const color = colorForZone(ZONE_FOR_MODE[mode.id]);

  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onPress(mode)}
      className="relative overflow-hidden flex items-center gap-4 w-full"
      style={{
        background: "linear-gradient(135deg, #1a1d24 0%, #15171d 100%)",
        borderRadius: 18,
        padding: "16px 20px",
        boxShadow: pressed
          ? `0 0 0 1.5px ${color}, inset 0 2px 6px rgba(0,0,0,0.5)`
          : "0 0 0 1px rgba(255,255,255,0.06), 0 6px 16px rgba(0,0,0,0.4)",
        transform: pressed ? "scale(0.98)" : "scale(1)",
        transition: "transform 120ms ease, box-shadow 180ms ease",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1, flexShrink: 0, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}>
        {mode.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{mode.label}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{mode.sublabel}</div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{mode.tempRange}</div>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7 4 L13 10 L7 16" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

function SelectScreen({ onPick }: { onPick: (m: TargetMode) => void }) {
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
          今日は何を<br />揚げる?
        </h1>
        <p className="mt-2 text-sm leading-5 text-white/55 max-w-xs">
          キッチンにスマホを置いたまま、2秒ごとに油音を解析します。まずは料理を選んで、目標温度をセットしてください。
        </p>
      </div>
      <div className="relative z-10 flex flex-col gap-3 px-4 pb-4">
        {MODES.map((m) => (
          <ModeCard key={m.id} mode={m} onPress={onPick} />
        ))}
      </div>
    </div>
  );
}

function MeasureScreen({
  mode,
  result,
  activity,
  errorMessage,
  onBack,
  onStart,
  onPause,
  onResume,
  onRetry,
}: {
  mode: TargetMode;
  result: AnalysisResult | null;
  activity: ActivityState;
  errorMessage: string;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const currentZone = result?.current_zone ?? ZONE_FOR_MODE[mode.id];
  const temp = ZONE_NEEDLE_TEMP[currentZone] ?? mode.targetTemp;
  const currentColor = colorForZone(currentZone);
  const onTarget = result?.judgment === "PERFECT";
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
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-3">
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
        <span className="text-sm text-white/55">{mode.emoji} {mode.label}</span>
      </div>

      {/* Status badge */}
      <StatusBadge activity={activity} />

      {/* Meter */}
      <div className="relative z-10 flex justify-center pt-2">
        <div className="relative w-full max-w-[400px]">
          <MeterSVG temp={temp} targetTemp={mode.targetTemp} currentZone={currentZone} />
          <div className="absolute left-0 right-0 flex flex-col items-center" style={{ top: "54%" }}>
            {result ? (
              <>
                <div style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: currentColor,
                  textShadow: `0 0 30px ${currentColor}66`,
                  transition: "color 300ms linear",
                  letterSpacing: -0.5,
                }}>
                  {ZONE_DISPLAY[currentZone]?.name ?? currentZone}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                  {ZONE_DISPLAY[currentZone]?.onomato}
                </div>
              </>
            ) : isActive ? (
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: 0.5,
                animation: "tunePulse 2s ease-in-out infinite",
              }}>
                Now Tuning
              </div>
            ) : (
              <div style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.18)" }}>
                --
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Judgment badge */}
      <div className="relative z-10 flex justify-center mt-2" style={{ minHeight: 36 }}>
        {result && (() => {
          const j = result.judgment;
          const cfg = j === "PERFECT"
            ? { label: "✓ ON TARGET",  bg: "oklch(0.78 0.17 145 / 0.15)", border: "oklch(0.78 0.17 145 / 0.45)", color: "oklch(0.85 0.17 145)" }
            : j === "UNDER"
            ? { label: "↑ HEAT UP",    bg: "oklch(0.83 0.16 55 / 0.15)",  border: "oklch(0.83 0.16 55 / 0.45)",  color: "oklch(0.88 0.16 55)"  }
            : { label: "↓ COOL DOWN",  bg: "oklch(0.72 0.17 230 / 0.15)", border: "oklch(0.72 0.17 230 / 0.45)", color: "oklch(0.78 0.17 230)" };
          return (
            <div style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              color: cfg.color,
              borderRadius: 9999,
              padding: "6px 22px",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.3,
              transition: "all 300ms",
            }}>
              {cfg.label}
            </div>
          );
        })()}
      </div>

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
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="6" y="5" width="6" height="18" rx="2" fill="rgba(255,255,255,0.85)" />
                <rect x="16" y="5" width="6" height="18" rx="2" fill="rgba(255,255,255,0.85)" />
              </svg>
            ) : (
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
  const [selectedMode, setSelectedMode] = useState<TargetMode | null>(null);
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

  async function runAnalysisLoop(stream: MediaStream, mode: "low" | "medium" | "high") {
    loopActiveRef.current = true;
    pendingCallRef.current = false;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 3;

    while (loopActiveRef.current) {
      try {
        setActivity("listening");
        const { blob, mimeType } = await recordAudioChunk(stream, CHUNK_DURATION_MS);
        if (!loopActiveRef.current) break;

        if (!pendingCallRef.current) {
          pendingCallRef.current = true;
          analyzeAudioChunk(blob, mimeType, mode)
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

  function selectMode(mode: TargetMode) {
    setScreen("measure");
    setSelectedMode(mode);
    setResult(null);
    setErrorMessage("");
    setActivity("idle");
  }

  async function startRecording(mode: TargetMode) {
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
      await runAnalysisLoop(stream, mode.id);
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
    if (!selectedMode) return;
    setErrorMessage("");
    await startRecording(selectedMode);
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
    return <SelectScreen onPick={selectMode} />;
  }

  return (
    <MeasureScreen
      mode={selectedMode!}
      result={result}
      activity={activity}
      errorMessage={errorMessage}
      onBack={goBack}
      onStart={() => selectedMode && void startRecording(selectedMode)}
      onPause={pauseMeasurement}
      onResume={() => void resumeMeasurement()}
      onRetry={() => selectedMode && void startRecording(selectedMode)}
    />
  );
}
