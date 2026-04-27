"use client";

import { useEffect, useRef, useState } from "react";
import { loadModel, classifyContinuous, getAudioFeatures, getModelProperties, resetClassifier, resampleLinear, EILabel } from "@/lib/localInference";
import { AudioCaptureInfo, startCapture, stopCapture } from "@/lib/audioCapture";

// ─── Types ────────────────────────────────────────────────────
type EIZone = "LOW" | "MID" | "HIGH";
type ActivityState = "idle" | "permission" | "calibrating" | "listening" | "paused" | "error";
type DebugInfo = {
  scores: { label: string; value: number }[];
  sampleRate: number;
  frameCount: number;
  topLabel: string;
  topValue: number;
  modelFrequency?: number;
  sliceSize?: number;
  rms: number;
  peak: number;
  baselineRms: number;
  activeRms: number;
  reason: string;
  pendingState: string;
  pendingCount: number;
  captureInfo?: AudioCaptureInfo;
  error: string;
};

// ─── Audio level bars ─────────────────────────────────────────
function AudioBars({ level, color }: { level: number; color: string }) {
  const heights = [0.55, 1.0, 0.75, 0.9, 0.6];
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 32 }}>
      {heights.map((mult, i) => (
        <div
          key={i}
          style={{
            width: 5,
            borderRadius: 3,
            background: color,
            height: `${Math.max(16, Math.min(100, level * mult * 100))}%`,
            transition: "height 80ms ease",
            opacity: level > 0.02 ? 0.7 : 0.2,
          }}
        />
      ))}
    </div>
  );
}

// ─── Scan ring ────────────────────────────────────────────────
function ScanRing({ color, active }: { color: string; active: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 220,
        height: 220,
        borderRadius: "50%",
        border: `1.5px solid ${color}`,
        opacity: active ? 0.2 : 0,
        animation: active ? "spin 10s linear infinite" : "none",
        transition: "opacity 600ms ease",
        backgroundImage: `conic-gradient(${color} 0deg, transparent 60deg, transparent 360deg)`,
        WebkitMaskImage: "none",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Zone config ──────────────────────────────────────────────
const ZONE_CONFIG: Record<EIZone, {
  text: string;
  sub: string;
  color: string;
  glow: string;
  judgment: string;
  jBg: string;
  jBorder: string;
  jColor: string;
}> = {
  LOW: {
    text: "低温",
    sub: "もっと加熱を",
    color: "oklch(0.72 0.17 230)",
    glow: "oklch(0.72 0.17 230 / 0.28)",
    judgment: "↑ HEAT UP",
    jBg: "oklch(0.72 0.17 230 / 0.15)",
    jBorder: "oklch(0.72 0.17 230 / 0.45)",
    jColor: "oklch(0.78 0.17 230)",
  },
  MID: {
    text: "適温",
    sub: "天ぷらOK",
    color: "oklch(0.78 0.17 145)",
    glow: "oklch(0.78 0.17 145 / 0.28)",
    judgment: "✓ ON TARGET",
    jBg: "oklch(0.78 0.17 145 / 0.15)",
    jBorder: "oklch(0.78 0.17 145 / 0.45)",
    jColor: "oklch(0.85 0.17 145)",
  },
  HIGH: {
    text: "高温",
    sub: "火を弱めて",
    color: "oklch(0.75 0.18 35)",
    glow: "oklch(0.75 0.18 35 / 0.28)",
    judgment: "↓ COOL DOWN",
    jBg: "oklch(0.75 0.18 35 / 0.15)",
    jBorder: "oklch(0.75 0.18 35 / 0.45)",
    jColor: "oklch(0.80 0.18 35)",
  },
};

// ─── Confidence thresholds ────────────────────────────────────
const THRESHOLD: Record<string, number> = {
  noise: 0.40,
  LOW:   0.45,
  MID:   0.60,
  HIGH:  0.40,
};

// ─── Guide screen ─────────────────────────────────────────────
function GuideScreen({ onStart }: { onStart: () => void }) {
  const steps = [
    {
      icon: "🥢",
      title: "菜箸を準備する",
      desc: "水で濡らし、キッチンペーパーで1回だけ軽く拭く。びしょ濡れだと跳ねて危険。",
    },
    {
      icon: "📱",
      title: "スマホを置く",
      desc: "鍋から20〜30cmの場所に置く。換気扇はつけたままOK。",
    },
    {
      icon: "🔥",
      title: "箸を油に入れる",
      desc: "Tune Now を押してから箸の先を油に静かに入れ、音を聞かせる。",
    },
  ];

  return (
    <div
      className="w-full min-h-screen flex flex-col"
      style={{ background: "#0b0d11", color: "#fff" }}
    >
      {/* Subtle top glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 30% at 50% 0%, oklch(0.78 0.17 145 / 0.12), transparent 60%)",
        }}
      />

      {/* Header */}
      <div className="relative z-10 pt-14 px-6 pb-4">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.35)",
            marginBottom: 10,
          }}
        >
          TEMPURA TUNE
        </div>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: -1,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          油の温度を<br />音で知る
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 14,
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.7,
          }}
        >
          菜箸を油に入れた音をAIが解析し、<br />今の温度帯をリアルタイムで判定します。
        </p>
      </div>

      {/* Steps */}
      <div className="relative z-10 flex flex-col gap-3 px-4 pb-4 flex-1">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 18,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 30, flexShrink: 0, lineHeight: 1 }}>{s.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="relative z-10 px-6 pb-14">
        <button
          type="button"
          onClick={onStart}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: 9999,
            background: "#fff",
            color: "#0b0d11",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 0.3,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(255,255,255,0.18)",
          }}
        >
          Tune Now
        </button>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ activity }: { activity: ActivityState }) {
  const config: Record<string, { text: string; color: string; dot?: boolean }> = {
    permission:   { text: "Getting mic...",  color: "rgba(255,255,255,0.5)" },
    calibrating:  { text: "ENV CHECK",       color: "oklch(0.72 0.15 280)", dot: true },
    listening:    { text: "LISTENING",       color: "oklch(0.78 0.17 145)", dot: true },
    paused:       { text: "PAUSED",          color: "rgba(255,255,255,0.35)" },
  };
  const c = config[activity];
  if (!c) return <div style={{ height: 32 }} />;
  return (
    <div className="relative z-10 flex justify-center pb-1">
      <div
        className="flex items-center gap-2 px-4 py-1.5 rounded-full"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {c.dot && (
          <span
            style={{
              width: 7, height: 7, borderRadius: 9999,
              background: c.color, flexShrink: 0,
              animation: "dotPulse 1.2s ease-in-out infinite",
              display: "inline-block",
            }}
          />
        )}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: c.color }}>
          {c.text}
        </span>
      </div>
    </div>
  );
}

// ─── ON TARGET flash ──────────────────────────────────────────
function OnTargetFlash({ visible }: { visible: boolean }) {
  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 400ms ease-out",
        background:
          "radial-gradient(circle at 50% 45%, oklch(0.78 0.17 145 / 0.42), oklch(0.28 0.08 145 / 0.1) 70%)",
      }}
    >
      <svg
        width="240"
        height="240"
        viewBox="0 0 260 260"
        style={{
          transform: visible ? "scale(1)" : "scale(0.6)",
          transition: "transform 500ms cubic-bezier(.2,1.2,.3,1)",
          filter: "drop-shadow(0 8px 30px oklch(0.78 0.17 145 / 0.9))",
        }}
      >
        <circle cx="130" cy="130" r="110" fill="oklch(0.78 0.17 145)" />
        <path
          d="M75 135 L115 175 L190 95"
          stroke="#0b1a10"
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── Measure screen ───────────────────────────────────────────
function MeasureScreen({
  zone,
  noOil,
  weakSignal,
  activity,
  errorMessage,
  onTargetFlash,
  debugInfo,
  audioLevel,
  onBack,
  onStart,
  onPause,
  onResume,
  onRetry,
}: {
  zone: EIZone | null;
  noOil: boolean;
  weakSignal: boolean;
  activity: ActivityState;
  errorMessage: string;
  onTargetFlash: boolean;
  debugInfo: DebugInfo | null;
  audioLevel: number;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const isActive = activity === "listening" || activity === "permission" || activity === "calibrating";
  const isIdle = activity === "idle";
  const isPaused = activity === "paused";
  const cfg = zone ? ZONE_CONFIG[zone] : null;

  return (
    <div
      className="w-full min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: "#0b0d11", color: "#fff" }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: cfg
            ? `radial-gradient(ellipse 80% 55% at 50% 20%, ${cfg.glow}, transparent 70%)`
            : "none",
          transition: "background 600ms ease",
        }}
      />

      <OnTargetFlash visible={onTargetFlash} />

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center justify-between px-5"
        style={{ paddingTop: 52, paddingBottom: 8 }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none", border: "none",
            color: "rgba(255,255,255,0.45)",
            fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M11 4 L6 9 L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          戻る
        </button>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)" }}>
          TEMPURA TUNE
        </span>
      </div>

      {/* Status badge */}
      <StatusBadge activity={activity} />

      {/* Main display */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center"
        style={{ padding: "0 32px", gap: 16 }}
      >
        {cfg && activity === "listening" ? (
          <>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ScanRing color={cfg.color} active={true} />
              <div
                style={{
                  fontSize: 80,
                  fontWeight: 900,
                  color: cfg.color,
                  textShadow: `0 0 80px ${cfg.color}`,
                  letterSpacing: -2,
                  transition: "color 600ms ease, text-shadow 600ms ease",
                }}
              >
                {cfg.text}
              </div>
            </div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
              {cfg.sub}
            </div>
            <div
              style={{
                marginTop: 8,
                background: cfg.jBg,
                border: `1px solid ${cfg.jBorder}`,
                color: cfg.jColor,
                borderRadius: 9999,
                padding: "8px 28px",
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: 0.3,
                transition: "all 400ms",
              }}
            >
              {cfg.judgment}
            </div>
            <div style={{ marginTop: 16 }}>
              <AudioBars level={audioLevel} color={cfg.color} />
            </div>
          </>
        ) : weakSignal && activity === "listening" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.2)", marginBottom: 20 }}>
              ─ ─ ─ ─ ─ ─ ─ ─ ─
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
              音が届いていません
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
              マイク入力と距離を確認してください
            </div>
          </div>
        ) : noOil && activity === "listening" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <AudioBars level={audioLevel} color="rgba(255,255,255,0.3)" />
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "rgba(255,255,255,0.4)",
                animation: "tunePulse 2s ease-in-out infinite",
              }}
            >
              測定中...
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", marginTop: 8 }}>
              箸を油に静かに入れてください
            </div>
          </div>
        ) : activity === "calibrating" ? (
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <AudioBars level={audioLevel} color="rgba(255,255,255,0.35)" />
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "rgba(255,255,255,0.4)",
                animation: "tunePulse 2s ease-in-out infinite",
              }}
            >
              環境音を確認中...
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", marginTop: 8 }}>
              そのままお待ちください
            </div>
          </div>
        ) : isActive ? (
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: 3,
              animation: "tunePulse 2s ease-in-out infinite",
            }}
          >
            Tuning...
          </div>
        ) : (
          <div style={{ fontSize: 72, fontWeight: 900, color: "rgba(255,255,255,0.12)" }}>
            --
          </div>
        )}
      </div>

      {debugInfo && isActive && (
        <div
          className="relative z-10 mx-5 mb-4"
          style={{
            padding: "12px 14px",
            background: "rgba(255,255,255,0.055)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            textAlign: "left",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.52)", marginBottom: 6 }}>
            {debugInfo.reason}  F:{debugInfo.frameCount}  P:{debugInfo.pendingState || "-"}:{debugInfo.pendingCount}
          </div>
          <div style={{ color: "rgba(255,255,255,0.42)", marginBottom: 6 }}>
            SR:{debugInfo.sampleRate}Hz  M:{debugInfo.modelFrequency ?? "-"}Hz  Slice:{debugInfo.sliceSize ?? "-"}
          </div>
          {debugInfo.captureInfo && (
            <div style={{ color: "rgba(255,255,255,0.42)", marginBottom: 6, wordBreak: "break-word" }}>
              Mic:{debugInfo.captureInfo.trackLabel || "-"}  State:{debugInfo.captureInfo.trackReadyState || "-"}  Muted:{String(debugInfo.captureInfo.trackMuted ?? "-")}
            </div>
          )}
          {debugInfo.captureInfo?.audioInputs && (
            <div style={{ color: "rgba(255,255,255,0.32)", marginBottom: 6, wordBreak: "break-word" }}>
              Inputs:{debugInfo.captureInfo.audioInputs.join(" / ")}
            </div>
          )}
          <div style={{ color: debugInfo.rms >= debugInfo.activeRms ? "oklch(0.78 0.17 145)" : "oklch(0.75 0.18 35)", marginBottom: 6 }}>
            RMS:{debugInfo.rms.toExponential(2)}  Peak:{debugInfo.peak.toExponential(2)}  Base:{debugInfo.baselineRms.toExponential(2)}  Gate:{debugInfo.activeRms.toExponential(2)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.42)", marginBottom: 6 }}>
            TOP: {debugInfo.topLabel || "-"} {(debugInfo.topValue * 100).toFixed(0)}%
          </div>
          {debugInfo.error && (
            <div style={{ color: "oklch(0.75 0.18 35)", marginBottom: 6, wordBreak: "break-all" }}>
              ERR: {debugInfo.error}
            </div>
          )}
          {debugInfo.scores.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ width: 36, color: s.label === debugInfo.topLabel ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.45)" }}>
                {s.label}
              </span>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(s.value * 100).toFixed(0)}%`,
                  background: s.label === debugInfo.topLabel ? "oklch(0.78 0.17 145)" : "rgba(255,255,255,0.28)",
                  borderRadius: 3,
                  transition: "width 200ms",
                }} />
              </div>
              <span style={{ width: 34, textAlign: "right", color: "rgba(255,255,255,0.4)" }}>
                {(s.value * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div
          className="relative z-10 mx-6 mb-4 rounded-2xl text-center text-sm"
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            padding: "12px 16px",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Bottom button */}
      <div className="relative z-10 flex justify-center" style={{ paddingBottom: 52 }}>
        {activity === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "16px 40px",
              borderRadius: 9999,
              background: "#fff",
              color: "#0b0d11",
              fontSize: 16,
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
            }}
          >
            もう一度はじめる
          </button>
        ) : (
          <button
            type="button"
            onClick={isIdle || isPaused ? (isIdle ? onStart : onResume) : onPause}
            style={{
              width: 88, height: 88, borderRadius: 9999,
              background: "transparent",
              border: `4px solid ${isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)"}`,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
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

      <style>{`
        @keyframes dotPulse { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
        @keyframes tunePulse { 0%,100%{opacity:.25} 50%{opacity:.75} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function Home() {
  const [screen, setScreen] = useState<"guide" | "measure">("guide");
  const [activity, setActivity] = useState<ActivityState>("idle");
  const [currentZone, setCurrentZone] = useState<EIZone | null>(null);
  const [noOil, setNoOil] = useState(false);
  const [weakSignal, setWeakSignal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [onTargetFlash, setOnTargetFlash] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const loopActiveRef = useRef(false);
  const prevZoneRef = useRef<EIZone | null>(null);
  const zoneQueueRef = useRef<EIZone[]>([]);
  const VOTE_WINDOW = 3;
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ state: string; count: number }>({ state: "", count: 0 });
  const noiseReadyRef = useRef(false);
  const calibCountRef = useRef(0);
  const frameCountRef = useRef(0);
  const baselineRmsRef = useRef(0);
  const baselineSamplesRef = useRef<number[]>([]);
  const captureInfoRef = useRef<AudioCaptureInfo | undefined>(undefined);
  const COMMIT_FRAMES = 3;
  const CALIBRATE_FRAMES = 12;
  const MIN_ACTIVE_RMS = 0.006;
  const BASELINE_MULTIPLIER = 2.2;
  const SILENT_PEAK = 0.00003;

  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      stopCapture();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  async function startRecording() {
    setActivity("permission");
    setNoOil(false);
    setWeakSignal(false);
    setCurrentZone(null);
    setDebugInfo(null);
    setAudioLevel(0);
    prevZoneRef.current = null;
    zoneQueueRef.current = [];
    pendingRef.current = { state: "", count: 0 };
    noiseReadyRef.current = false;
    calibCountRef.current = 0;
    frameCountRef.current = 0;
    baselineRmsRef.current = 0;
    baselineSamplesRef.current = [];
    captureInfoRef.current = undefined;
    try {
      await loadModel();
      resetClassifier();
      const modelProperties = getModelProperties();
      loopActiveRef.current = true;
      await startCapture((samples, sampleRate) => {
        if (!loopActiveRef.current) return;
        frameCountRef.current++;
        try {
          const features = getAudioFeatures(samples);
          // オーディオレベル更新（毎フレーム）
          const normalizedLevel = Math.min(1, features.rms / 0.08);
          setAudioLevel(normalizedLevel);
          const isSilentInput = features.peak < SILENT_PEAK;
          if (isSilentInput) {
            const activeRms = Math.max(MIN_ACTIVE_RMS, baselineRmsRef.current * BASELINE_MULTIPLIER);
            setDebugInfo({
              scores: [],
              sampleRate,
              frameCount: frameCountRef.current,
              topLabel: "",
              topValue: 0,
              modelFrequency: modelProperties?.frequency,
              sliceSize: modelProperties?.slice_size,
              rms: features.rms,
              peak: features.peak,
              baselineRms: baselineRmsRef.current,
              activeRms,
              reason: "INPUT_SILENT",
              pendingState: pendingRef.current.state,
              pendingCount: pendingRef.current.count,
              captureInfo: captureInfoRef.current,
              error: "",
            });
            if (noiseReadyRef.current) {
              setWeakSignal(true);
              setNoOil(false);
              setCurrentZone(null);
            }
            return;
          }

          const modelSampleRate = modelProperties?.frequency ?? sampleRate;
          const modelSamples = resampleLinear(samples, sampleRate, modelSampleRate);
          const { results } = classifyContinuous(modelSamples);
          if (results.length === 0) throw new Error("分類結果が空です");

          const top = results.reduce((a, b) => (a.value > b.value ? a : b));
          const label = top.label as EILabel;
          const activeRms = Math.max(MIN_ACTIVE_RMS, baselineRmsRef.current * BASELINE_MULTIPLIER);

          const updateDebugInfo = (reason: string) => {
            setDebugInfo({
              scores: results,
              sampleRate,
              frameCount: frameCountRef.current,
              topLabel: top.label,
              topValue: top.value,
              modelFrequency: modelProperties?.frequency,
              sliceSize: modelProperties?.slice_size,
              rms: features.rms,
              peak: features.peak,
              baselineRms: baselineRmsRef.current,
              activeRms,
              reason,
              pendingState: pendingRef.current.state,
              pendingCount: pendingRef.current.count,
              captureInfo: captureInfoRef.current,
              error: "",
            });
          };

          // ── キャリブレーション: 換気扇・環境音の音量ベースラインを測る ──
          if (!noiseReadyRef.current) {
            baselineSamplesRef.current.push(features.rms);
            calibCountRef.current++;
            if (frameCountRef.current % 3 === 0) updateDebugInfo("CALIBRATING");

            if (calibCountRef.current >= CALIBRATE_FRAMES) {
              const sorted = [...baselineSamplesRef.current].sort((a, b) => a - b);
              baselineRmsRef.current = sorted[Math.floor(sorted.length / 2)] ?? 0;
              noiseReadyRef.current = true;
              pendingRef.current = { state: "", count: 0 };
              updateDebugInfo("READY");
              setActivity("listening");
            }
            return;
          }

          // ── 測定フェーズ ──────────────────────────────────────
          if (features.rms < activeRms) {
            pendingRef.current = { state: "noise", count: pendingRef.current.state === "noise" ? pendingRef.current.count + 1 : 1 };
            if (frameCountRef.current % 3 === 0) updateDebugInfo("BELOW_GATE");
            if (pendingRef.current.count >= COMMIT_FRAMES) {
              setNoOil(true);
              setWeakSignal(false);
              setCurrentZone(null);
            }
            return;
          }

          const threshold = THRESHOLD[label] ?? 0.60;
          const candidate =
            top.value < threshold        ? "weak"
            : label === "noise"          ? "noise"
            : label;

          if (pendingRef.current.state === candidate) {
            pendingRef.current.count++;
          } else {
            pendingRef.current = { state: candidate, count: 1 };
          }

          if (frameCountRef.current % 3 === 0) updateDebugInfo(`CANDIDATE:${candidate}`);
          if (pendingRef.current.count < COMMIT_FRAMES) return;

          if (candidate === "weak") {
            setWeakSignal(true);
            setNoOil(false);
            setCurrentZone(null);
          } else if (candidate === "noise") {
            setNoOil(true);
            setWeakSignal(false);
            setCurrentZone(null);
          } else {
            const zone = candidate as EIZone;
            setNoOil(false);
            setWeakSignal(false);
            // 多数決: 直近VOTE_WINDOWコミットの最多ゾーンを表示
            zoneQueueRef.current = [...zoneQueueRef.current, zone].slice(-VOTE_WINDOW);
            const counts: Partial<Record<EIZone, number>> = {};
            for (const z of zoneQueueRef.current) counts[z] = (counts[z] ?? 0) + 1;
            const voted = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as EIZone;
            if (voted === "MID" && prevZoneRef.current !== "MID") {
              setOnTargetFlash(true);
              if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
              flashTimerRef.current = setTimeout(() => setOnTargetFlash(false), 1500);
            }
            prevZoneRef.current = voted;
            setCurrentZone(voted);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setDebugInfo(prev => prev ? { ...prev, error: msg } : {
            scores: [],
            sampleRate: 0,
            frameCount: frameCountRef.current,
            topLabel: "",
            topValue: 0,
            modelFrequency: modelProperties?.frequency,
            sliceSize: modelProperties?.slice_size,
            rms: 0,
            peak: 0,
            baselineRms: baselineRmsRef.current,
            activeRms: Math.max(MIN_ACTIVE_RMS, baselineRmsRef.current * BASELINE_MULTIPLIER),
            error: msg,
            reason: "ERROR",
            pendingState: pendingRef.current.state,
            pendingCount: pendingRef.current.count,
            captureInfo: captureInfoRef.current,
          });
        }
      }, (info) => {
        captureInfoRef.current = info;
      });
      setActivity("calibrating");
    } catch (error) {
      loopActiveRef.current = false;
      stopCapture();
      setActivity("error");
      setErrorMessage(error instanceof Error ? error.message : "判定に失敗しました。");
    }
  }

  function pause() {
    loopActiveRef.current = false;
    stopCapture();
    noiseReadyRef.current = false;
    setAudioLevel(0);
    setActivity("paused");
  }

  function goBack() {
    loopActiveRef.current = false;
    stopCapture();
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setOnTargetFlash(false);
    setActivity("idle");
    setCurrentZone(null);
    setNoOil(false);
    setWeakSignal(false);
    setErrorMessage("");
    setDebugInfo(null);
    setScreen("guide");
  }

  if (screen === "guide") {
    return (
      <GuideScreen
        onStart={() => {
          setScreen("measure");
          setActivity("idle");
          setCurrentZone(null);
          setNoOil(false);
          setErrorMessage("");
        }}
      />
    );
  }

  return (
    <MeasureScreen
      zone={currentZone}
      noOil={noOil}
      weakSignal={weakSignal}
      activity={activity}
      errorMessage={errorMessage}
      onTargetFlash={onTargetFlash}
      debugInfo={debugInfo}
      audioLevel={audioLevel}
      onBack={goBack}
      onStart={() => void startRecording()}
      onPause={pause}
      onResume={() => void startRecording()}
      onRetry={() => void startRecording()}
    />
  );
}
