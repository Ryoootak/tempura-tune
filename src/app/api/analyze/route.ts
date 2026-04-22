import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
const MODEL_NAME = "gemini-2.5-flash";

const SUPPORTED_AUDIO_TYPES = new Map<string, string>([
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".webm", "audio/webm"],
]);

const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    current_zone: {
      type: "string",
      enum: ["TOO_LOW", "LOW", "MEDIUM", "HIGH", "TOO_HIGH"],
      description: "5-zone oil temperature classification based on sound.",
    },
    estimated_temp: {
      type: "number",
      description: "Estimated oil temperature in °C as an integer (e.g. 170).",
    },
    judgment: {
      type: "string",
      enum: ["UNDER", "PERFECT", "OVER"],
      description: "Whether the current zone is below, matching, or above the user's target.",
    },
    advice: {
      type: "string",
      description: "Short punchy English feedback with emoji. e.g. 'Perfect! 🍤' or 'Lower the heat! 🚩'",
    },
  },
  required: ["current_zone", "estimated_temp", "judgment", "advice"],
} as const;

type TargetMode = "low" | "medium" | "high";

const MODE_DESCRIPTIONS: Record<TargetMode, string> = {
  low:    "LOW zone (155–165°C) — veggies and potatoes (🥬)",
  medium: "MEDIUM zone (165–180°C) — chicken karaage and tonkatsu (🍗)",
  high:   "HIGH zone (180–195°C) — tempura and seafood (🍤)",
};

function buildSystemPrompt(mode: TargetMode): string {
  return `You are the AI engine for "TempuraTune", a smart frying temperature app.
The user sends a 2-second audio recording of hot oil.
Classify the oil temperature based on sound characteristics: pitch, bubble density, and intensity.

## 5 Temperature Zones

- TOO_LOW  — below 155°C:  Very quiet, almost silent. Weak or no bubbling.
- LOW      — 155–165°C:    Calm, light crackling. Gentle bubbles.
- MEDIUM   — 165–180°C:    Standard rhythmic frying sound. Steady bubbles.
- HIGH     — 180–195°C:    Loud, sharp, intense frying sound. Dense rapid bubbles.
- TOO_HIGH — above 195°C:  Violent, chaotic, sputtering. Danger of burning.

## User's Target Mode
The user selected: ${MODE_DESCRIPTIONS[mode]}

## Judgment Rules
Compare current_zone to the user's target:
- UNDER   — current zone is cooler than target
- PERFECT — current zone matches target
- OVER    — current zone is hotter than target

## Advice
Write a short, energetic English phrase (max 6 words) with 1 emoji.
Examples: "Perfect! 🍤", "Heat it up! 🔥", "Lower the heat! 🧊", "Too hot! 🚩", "Almost there! ⏳"

Return JSON only.`;
}

type AnalysisResult = {
  current_zone: "TOO_LOW" | "LOW" | "MEDIUM" | "HIGH" | "TOO_HIGH";
  estimated_temp: number;
  judgment: "UNDER" | "PERFECT" | "OVER";
  advice: string;
};

export const runtime = "nodejs";

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot).toLowerCase();
}

function resolveMimeType(file: File): string | null {
  const extensionMime = SUPPORTED_AUDIO_TYPES.get(getExtension(file.name));
  if (extensionMime) return extensionMime;
  for (const mimeType of SUPPORTED_AUDIO_TYPES.values()) {
    if (file.type === mimeType) return mimeType;
  }
  return null;
}

function parseAnalysisResult(rawText: string | undefined): AnalysisResult {
  if (!rawText) throw new Error("empty AI response");

  const parsed = JSON.parse(rawText) as Partial<AnalysisResult>;

  const validZones = ["TOO_LOW", "LOW", "MEDIUM", "HIGH", "TOO_HIGH"] as const;
  if (!validZones.includes(parsed.current_zone as never)) {
    throw new Error("invalid current_zone");
  }
  if (typeof parsed.estimated_temp !== "number" || !Number.isFinite(parsed.estimated_temp)) {
    throw new Error("invalid estimated_temp");
  }
  const validJudgments = ["UNDER", "PERFECT", "OVER"] as const;
  if (!validJudgments.includes(parsed.judgment as never)) {
    throw new Error("invalid judgment");
  }
  if (typeof parsed.advice !== "string" || !parsed.advice.trim()) {
    throw new Error("invalid advice");
  }

  return {
    current_zone: parsed.current_zone!,
    estimated_temp: Math.round(parsed.estimated_temp),
    judgment: parsed.judgment!,
    advice: parsed.advice.trim(),
  };
}

function isAiServiceError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "code" in error || "details" in error)
  );
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }

    const mimeType = resolveMimeType(audio);
    if (!mimeType) {
      return NextResponse.json({ error: "unsupported format" }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const modeRaw = formData.get("mode");
    if (modeRaw !== "low" && modeRaw !== "medium" && modeRaw !== "high") {
      return NextResponse.json({ error: "invalid mode" }, { status: 400 });
    }
    const mode: TargetMode = modeRaw;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const audioBuffer = await audio.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { text: "Analyze this audio clip and return the oil temperature classification as JSON." },
        { inlineData: { data: audioBase64, mimeType } },
      ],
      config: {
        systemInstruction: buildSystemPrompt(mode),
        responseMimeType: "application/json",
        responseJsonSchema: ANALYSIS_RESPONSE_SCHEMA,
      },
    });

    return NextResponse.json(parseAnalysisResult(response.text));
  } catch (error) {
    console.error("POST /api/analyze failed", error);
    if (isAiServiceError(error)) {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
