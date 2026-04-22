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
      description: "5-zone oil temperature classification based on acoustic analysis.",
    },
    judgment: {
      type: "string",
      enum: ["UNDER", "PERFECT", "OVER"],
      description: "Whether the current zone is below, matching, or above the user's target.",
    },
    acoustic_reasoning: {
      type: "string",
      description: "One brief sentence explaining the acoustic features detected (e.g. frequency peaks, burst density, texture).",
    },
  },
  required: ["current_zone", "judgment", "acoustic_reasoning"],
} as const;

type TargetMode = "low" | "medium" | "high";

const MODE_TARGET_LABELS: Record<TargetMode, string> = {
  low:    "Low (160–165°C) — veggies and potatoes 🥬",
  medium: "Medium (170–175°C) — chicken karaage and tonkatsu 🍗",
  high:   "High (180–185°C) — tempura and seafood 🍤",
};

function buildSystemPrompt(mode: TargetMode): string {
  return `# Role
You are the core acoustic analysis engine for "TempuraTune". Your task is to directly analyze the audio spectrogram of frying sounds (sizzling oil) and classify the temperature into one of five specific zones based on physical acoustic properties.

# Acoustic Physics Context
Frying sound is created by the bursting of water vapor bubbles.
- Low Temp = Large bubbles, slow burst rate, lower frequencies.
- High Temp = Tiny bubbles, rapid burst rate, high-frequency energy.

# Temperature Classification (The 5-Zone System)
Classify the audio based on peak frequencies, burst density, and texture:

1. [TOO_LOW] (< 155°C):
   - Frequency: Dominant energy under 2 kHz.
   - Density & Amplitude: Low density, intermittent.
   - Texture: Slow, heavy, muffled bubbling.
   - Onomatopoeia Label: "Boko... Boko..."

2. [LOW] (160°C - 165°C):
   - Frequency: Broadband noise with peak energy around 2 - 4 kHz.
   - Density & Amplitude: Continuous but soft amplitude.
   - Texture: Gentle, expanding hiss with very few sharp attacks.
   - Onomatopoeia Label: "Shuwa-shuwa"

3. [MEDIUM] (170°C - 175°C):
   - Frequency: Broad spectrum with clear peaks emerging around 4 - 6 kHz.
   - Density & Amplitude: Steady, rhythmic, and uniform medium density.
   - Texture: Crisp, light popping sounds.
   - Onomatopoeia Label: "Pichi-pichi"

4. [HIGH] (180°C - 185°C):
   - Frequency: Significant energy shift to high band (6 - 10 kHz).
   - Density & Amplitude: Very high density, rapid-fire crackles, high amplitude.
   - Texture: Sharp, dry, and intense high-pitched sizzle.
   - Onomatopoeia Label: "Chiri-chiri" or "Kara-kara"

5. [TOO_HIGH] (> 195°C):
   - Frequency: Chaotic. Explosive low-mid spikes combined with harsh high-frequency hiss.
   - Density & Amplitude: Erratic, aggressive, with sudden loud volume spikes.
   - Texture: Violent splattering and exploding.
   - Onomatopoeia Label: "Bachi! Pan!"

# User's Target Mode
The user selected: [Target: ${MODE_TARGET_LABELS[mode]}]

# Judgment Rules
Compare current_zone to the user's target:
- UNDER   — current zone is cooler than target
- PERFECT — current zone matches target
- OVER    — current zone is hotter than target

Return JSON only.`;
}

type AnalysisResult = {
  current_zone: "TOO_LOW" | "LOW" | "MEDIUM" | "HIGH" | "TOO_HIGH";
  judgment: "UNDER" | "PERFECT" | "OVER";
  acoustic_reasoning: string;
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
  const validJudgments = ["UNDER", "PERFECT", "OVER"] as const;
  if (!validJudgments.includes(parsed.judgment as never)) {
    throw new Error("invalid judgment");
  }
  if (typeof parsed.acoustic_reasoning !== "string" || !parsed.acoustic_reasoning.trim()) {
    throw new Error("invalid acoustic_reasoning");
  }

  return {
    current_zone: parsed.current_zone!,
    judgment: parsed.judgment!,
    acoustic_reasoning: parsed.acoustic_reasoning.trim(),
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
