"use client";

import { useEffect, useRef, useState } from "react";

type DishPreset = {
  id: string;
  name: string;
  subtitle: string;
  targetLabel: string;
  targetTemp: number;
};

type AnalysisResult = {
  zone: "ぬるい" | "適温" | "熱すぎ";
  estimated_temp_range: string;
  confidence: number;
  advice: string;
};

type ScreenState = "select" | "measure";
type ActivityState = "idle" | "permission" | "listening" | "analyzing" | "error";

const CHUNK_DURATION_MS = 2000;

const DISHES: DishPreset[] = [
  {
    id: "tempura",
    name: "天ぷら",
    subtitle: "衣を軽く、サクッと揚げる",
    targetLabel: "170°C",
    targetTemp: 170,
  },
  {
    id: "karaage",
    name: "唐揚げ",
    subtitle: "香ばしく、ジューシーに仕上げる",
    targetLabel: "180°C",
    targetTemp: 180,
  },
  {
    id: "tonkatsu",
    name: "トンカツ",
    subtitle: "低めから入り、じっくり火を通す",
    targetLabel: "160°C",
    targetTemp: 160,
  },
];

const ZONE_META: Record<
  AnalysisResult["zone"] | "unknown",
  {
    color: string;
    glow: string;
    label: string;
    meterTemp: number;
  }
> = {
  unknown: {
    color: "#f4c35f",
    glow: "rgba(244, 195, 95, 0.32)",
    label: "待機中",
    meterTemp: 160,
  },
  ぬるい: {
    color: "#47a7ff",
    glow: "rgba(71, 167, 255, 0.28)",
    label: "ぬるい",
    meterTemp: 145,
  },
  適温: {
    color: "#6dde88",
    glow: "rgba(109, 222, 136, 0.3)",
    label: "適温",
    meterTemp: 175,
  },
  熱すぎ: {
    color: "#ff6b57",
    glow: "rgba(255, 107, 87, 0.32)",
    label: "熱すぎ",
    meterTemp: 215,
  },
};

function resolveRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ""
  );
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  return "webm";
}

function extractEstimatedTemp(range: string | undefined, fallback: number): number {
  if (!range) {
    return fallback;
  }

  const matches = [...range.matchAll(/\d+/g)];
  if (matches.length === 0) {
    return fallback;
  }

  const temps = matches
    .map((match) => Number(match[0]))
    .filter((temp) => Number.isFinite(temp));

  if (temps.length === 0) {
    return fallback;
  }

  const total = temps.reduce((sum, temp) => sum + temp, 0);
  return Math.round(total / temps.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatConfidence(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return `${Math.round(value * 100)}%`;
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "判定に失敗しました。もう一度お試しください。";
}

async function recordAudioChunk(
  stream: MediaStream,
  durationMs: number,
): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("このブラウザでは録音に対応していません。");
  }

  const mimeType = resolveRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener("error", () => {
      reject(new Error("録音処理でエラーが発生しました。"));
    });

    recorder.addEventListener("stop", () => {
      const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
      resolve({
        blob: new Blob(chunks, { type: finalMimeType }),
        mimeType: finalMimeType,
      });
    });

    recorder.start();
    window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, durationMs);
  });
}

async function analyzeAudioChunk(
  blob: Blob,
  mimeType: string,
): Promise<AnalysisResult> {
  const extension = extensionForMimeType(mimeType);
  const formData = new FormData();
  formData.append("audio", blob, `chunk.${extension}`);

  const response = await fetch("/api/analyze", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as AnalysisResult | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "判定APIでエラーが発生しました。",
    );
  }

  return payload as AnalysisResult;
}

function Meter({
  targetTemp,
  result,
  activity,
}: {
  targetTemp: number;
  result: AnalysisResult | null;
  activity: ActivityState;
}) {
  const zoneKey = result?.zone ?? "unknown";
  const zoneMeta = ZONE_META[zoneKey];
  const estimatedTemp = extractEstimatedTemp(result?.estimated_temp_range, targetTemp);
  const needleTemp = clamp(estimatedTemp, 130, 230);
  const targetClamped = clamp(targetTemp, 130, 230);

  const tempToAngle = (temp: number) => -120 + ((temp - 130) / 100) * 240;
  const targetAngle = tempToAngle(targetClamped);
  const needleAngle = tempToAngle(needleTemp);
  const showPulse = activity === "listening" || activity === "analyzing";

  return (
    <div className="relative mx-auto flex h-[22rem] w-full max-w-[22rem] items-center justify-center">
      <div
        className={`absolute inset-6 rounded-full blur-3xl transition-opacity duration-500 ${
          showPulse ? "opacity-100" : "opacity-70"
        }`}
        style={{ background: zoneMeta.glow }}
      />
      <div className="relative flex h-full w-full items-center justify-center">
        <svg
          viewBox="0 0 320 320"
          className="h-full w-full drop-shadow-[0_24px_60px_rgba(0,0,0,0.48)]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="meter-track" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#2f3745" />
              <stop offset="100%" stopColor="#151922" />
            </linearGradient>
          </defs>

          <path
            d="M 60 220 A 100 100 0 0 1 260 220"
            fill="none"
            stroke="url(#meter-track)"
            strokeWidth="34"
            strokeLinecap="round"
          />
          <path
            d="M 90 220 A 70 70 0 0 1 230 220"
            fill="none"
            stroke={zoneMeta.color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray="140 500"
          />

          {[140, 160, 180, 200, 220].map((temp) => {
            const angle = tempToAngle(temp);
            const rad = (angle * Math.PI) / 180;
            const x1 = 160 + Math.cos(rad) * 84;
            const y1 = 220 + Math.sin(rad) * 84;
            const x2 = 160 + Math.cos(rad) * 101;
            const y2 = 220 + Math.sin(rad) * 101;
            return (
              <g key={temp}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(255,255,255,0.32)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <text
                  x={160 + Math.cos(rad) * 120}
                  y={220 + Math.sin(rad) * 120}
                  fill="rgba(255,255,255,0.72)"
                  fontSize="12"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {temp}
                </text>
              </g>
            );
          })}

          <g transform={`rotate(${targetAngle} 160 220)`}>
            <polygon points="160,88 150,108 170,108" fill="#ffffff" />
          </g>

          <g transform={`rotate(${needleAngle} 160 220)`}>
            <rect
              x="155"
              y="110"
              width="10"
              height="116"
              rx="5"
              fill={zoneMeta.color}
            />
          </g>

          <circle cx="160" cy="220" r="16" fill="#090c13" />
          <circle cx="160" cy="220" r="8" fill={zoneMeta.color} />
        </svg>

        <div className="absolute bottom-8 flex flex-col items-center text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">
            LIVE TEMP
          </div>
          <div className="mt-2 text-6xl font-black tracking-[-0.06em] text-white">
            {result?.estimated_temp_range ?? "--"}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/72">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: zoneMeta.color }}
            />
            目標 {targetTemp}°C
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusLabel({
  activity,
  result,
}: {
  activity: ActivityState;
  result: AnalysisResult | null;
}) {
  if (activity === "permission") {
    return "マイク許可を確認中";
  }

  if (activity === "listening") {
    return "油音を拾っています";
  }

  if (activity === "analyzing") {
    return "AIが判定中";
  }

  if (activity === "error") {
    return "判定ループ停止中";
  }

  if (result) {
    return "最新の判定を表示中";
  }

  return "待機中";
}

export default function Home() {
  const [screen, setScreen] = useState<ScreenState>("select");
  const [activity, setActivity] = useState<ActivityState>("idle");
  const [selectedDish, setSelectedDish] = useState<DishPreset | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasMicSupport] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return Boolean(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
  });

  const streamRef = useRef<MediaStream | null>(null);
  const loopActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function runAnalysisLoop(stream: MediaStream) {
    loopActiveRef.current = true;

    while (loopActiveRef.current) {
      setActivity("listening");
      const { blob, mimeType } = await recordAudioChunk(stream, CHUNK_DURATION_MS);

      if (!loopActiveRef.current) {
        break;
      }

      setActivity("analyzing");
      const nextResult = await analyzeAudioChunk(blob, mimeType);

      if (!loopActiveRef.current) {
        break;
      }

      setResult(nextResult);
      setErrorMessage("");
      setActivity("listening");
    }
  }

  async function startMeasurement(dish: DishPreset) {
    if (!hasMicSupport) {
      setScreen("measure");
      setSelectedDish(dish);
      setActivity("error");
      setErrorMessage("このブラウザではマイク録音に対応していません。");
      return;
    }

    setScreen("measure");
    setSelectedDish(dish);
    setResult(null);
    setErrorMessage("");
    setActivity("permission");

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      await runAnalysisLoop(stream);
    } catch (error) {
      loopActiveRef.current = false;
      setActivity("error");
      setErrorMessage(buildErrorMessage(error));
    }
  }

  function stopMeasurement() {
    loopActiveRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActivity("idle");
    setScreen("select");
    setErrorMessage("");
  }

  async function retryMeasurement() {
    if (!selectedDish) {
      return;
    }

    await startMeasurement(selectedDish);
  }

  const zoneKey = result?.zone ?? "unknown";
  const zoneMeta = ZONE_META[zoneKey];

  if (screen === "select") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#263042_0%,#141821_40%,#090b11_100%)] px-5 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
              TempuraTune
            </div>
            <h1 className="mt-6 text-5xl font-black tracking-[-0.08em] text-white">
              油音で、
              <br />
              温度を聴く。
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-white/66">
              キッチンにスマホを置いたまま、2秒ごとに油音を解析します。まずは料理を選んで、目標温度をセットしてください。
            </p>
          </div>

          <section className="mt-10 space-y-4">
            {DISHES.map((dish) => (
              <button
                key={dish.id}
                type="button"
                onClick={() => void startMeasurement(dish)}
                className="group flex w-full items-center justify-between rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 text-left transition hover:border-white/25 hover:bg-white/10"
              >
                <div>
                  <div className="text-2xl font-bold tracking-[-0.05em] text-white">
                    {dish.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">{dish.subtitle}</div>
                </div>
                <div className="rounded-full border border-white/12 bg-black/20 px-4 py-2 text-sm font-semibold text-white/82">
                  {dish.targetLabel}
                </div>
              </button>
            ))}
          </section>

          <div className="mt-10 rounded-[2rem] border border-white/10 bg-black/20 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
              MVP FLOW
            </div>
            <div className="mt-3 text-sm leading-7 text-white/70">
              料理選択 → マイク許可 → 2秒録音 → AI判定 → メーター更新
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2531_0%,#0b0d13_55%,#06070b_100%)] px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-md flex-col rounded-[2.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.5)] backdrop-blur">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={stopMeasurement}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/10"
          >
            戻る
          </button>
          <div className="rounded-full border border-white/12 bg-black/25 px-4 py-2 text-sm font-semibold text-white/78">
            {selectedDish?.name ?? "未選択"} · {selectedDish?.targetLabel ?? "--"}
          </div>
        </div>

        <div className="mt-5 rounded-[2rem] border border-white/10 bg-black/30 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/42">
            STATUS
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                activity === "listening" || activity === "analyzing"
                  ? "animate-pulse"
                  : ""
              }`}
              style={{ backgroundColor: zoneMeta.color }}
            />
            <span className="text-sm text-white/80">
              <StatusLabel activity={activity} result={result} />
            </span>
          </div>
        </div>

        <div className="mt-6">
          <Meter
            targetTemp={selectedDish?.targetTemp ?? 170}
            result={result}
            activity={activity}
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
              ZONE
            </div>
            <div
              className="mt-3 text-2xl font-black tracking-[-0.06em]"
              style={{ color: zoneMeta.color }}
            >
              {zoneMeta.label}
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
              CONFIDENCE
            </div>
            <div className="mt-3 text-2xl font-black tracking-[-0.06em] text-white">
              {formatConfidence(result?.confidence)}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[1.8rem] border border-white/10 bg-black/24 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
            ADVICE
          </div>
          <p className="mt-3 text-base leading-7 text-white/78">
            {errorMessage ||
              result?.advice ||
              "録音を開始すると、ここに最新の一手が表示されます。"}
          </p>
        </div>

        <div className="mt-auto pt-5">
          {activity === "error" ? (
            <button
              type="button"
              onClick={() => void retryMeasurement()}
              className="w-full rounded-[1.6rem] bg-white px-5 py-4 text-base font-bold text-black transition hover:bg-white/90"
            >
              もう一度はじめる
            </button>
          ) : (
            <div className="rounded-[1.6rem] border border-white/10 bg-white/6 px-5 py-4 text-center text-sm leading-6 text-white/68">
              2秒ごとに油音を切り出して判定しています。キッチン台にスマホを置いたまま、音の変化を見守ってください。
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
