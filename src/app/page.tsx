"use client";

import { useEffect, useRef, useState } from "react";
import { loadModel, classifyContinuous, EILabel } from "@/lib/localInference";
import { startCapture, stopCapture } from "@/lib/audioCapture";

// ─── Types ────────────────────────────────────────────────────
type EIZone = "LOW" | "MID" | "HIGH";
type ActivityState = "idle" | "permission" | "listening" | "paused" | "error";

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
      desc: "Tune Up! を押してから箸の先を油に静かに入れ、音を聞かせる。",
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
          Tune Up! →
        </button>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ activity }: { activity: ActivityState }) {
  const config: Record<string, { text: string; color: string; dot?: boolean }> = {
    permission: { text: "Getting mic...", color: "rgba(255,255,255,0.5)" },
    listening:  { text: "LISTENING",     color: "oklch(0.78 0.17 145)", dot: true },
    paused:     { text: "PAUSED",        color: "rgba(255,255,255,0.35)" },
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
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const isActive = activity === "listening" || activity === "permission";
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
        {cfg ? (
          <>
            <div
              style={{
                fontSize: 80,
                fontWeight: 900,
                color: cfg.color,
                textShadow: `0 0 80px ${cfg.color}`,
                letterSpacing: -2,
                transition: "color 400ms ease, text-shadow 400ms ease",
              }}
            >
              {cfg.text}
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
                transition: "all 300ms",
              }}
            >
              {cfg.judgment}
            </div>
          </>
        ) : weakSignal && isActive ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.2)", marginBottom: 20 }}>
              ─ ─ ─ ─ ─ ─ ─ ─ ─
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
              換気扇、切れてる?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
              換気扇をつけてから測定してみて
            </div>
          </div>
        ) : noOil && isActive ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🫕</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
              油が静かです
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
              箸を油に入れてください
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

  const loopActiveRef = useRef(false);
  const prevZoneRef = useRef<EIZone | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ state: string; count: number }>({ state: "", count: 0 });
  const COMMIT_FRAMES = 3; // 3フレーム（約750ms）連続で一致したら確定

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
    prevZoneRef.current = null;
    pendingRef.current = { state: "", count: 0 };
    try {
      await loadModel();
      loopActiveRef.current = true;
      await startCapture((samples) => {
        if (!loopActiveRef.current) return;
        try {
          const { results } = classifyContinuous(samples);
          const top = results.reduce((a, b) => (a.value > b.value ? a : b));
          const label = top.label as EILabel;

          // 候補ステートを決定
          const candidate =
            top.value < THRESHOLD[label] ? "weak"
            : label === "noise"          ? "noise"
            : label; // LOW / MID / HIGH

          // 連続フレーム数をカウント、変わったらリセット
          if (pendingRef.current.state === candidate) {
            pendingRef.current.count++;
          } else {
            pendingRef.current = { state: candidate, count: 1 };
          }

          // COMMIT_FRAMES 未満はまだ確定しない
          if (pendingRef.current.count < COMMIT_FRAMES) return;

          // 確定: ステートを反映
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
            if (zone === "MID" && prevZoneRef.current !== "MID") {
              setOnTargetFlash(true);
              if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
              flashTimerRef.current = setTimeout(() => setOnTargetFlash(false), 1500);
            }
            prevZoneRef.current = zone;
            setCurrentZone(zone);
          }
        } catch { /* フレーム単位のエラーは無視 */ }
      });
      setActivity("listening");
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
      onBack={goBack}
      onStart={() => void startRecording()}
      onPause={pause}
      onResume={() => void startRecording()}
      onRetry={() => void startRecording()}
    />
  );
}
