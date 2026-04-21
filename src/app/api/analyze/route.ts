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
    zone: {
      type: "string",
      enum: ["ぬるい", "適温", "熱すぎ"],
      description: "油温ゾーン。",
    },
    estimated_temp_range: {
      type: "string",
      description: "推定温度帯。例: 170-180℃",
    },
    confidence: {
      type: "number",
      description: "0から1の確信度。",
    },
    advice: {
      type: "string",
      description: "天ぷら職人風の短い助言。",
    },
  },
  required: ["zone", "estimated_temp_range", "confidence", "advice"],
} as const;

const SYSTEM_PROMPT = `あなたは「TempuraTune」という油温判定アプリのAIです。
日本の天ぷら職人の技を再現する役割を持ちます。

ユーザーが油に濡れた箸を入れた時の音を録音して送ってきます。
その音から、3つのゾーンに分類してください:

- ぬるい (150℃以下): バブルが少なく静か、油の熱対流音が主。揚げ物には冷たい。
- 適温 (160-200℃): 安定したバブル音、揚げ物に最適。天ぷら・唐揚げ・トンカツの標準温度。
- 熱すぎ (210℃以上): 激しい破裂音、煙の発生リスク、油劣化加速。

判定根拠:
- バブルの大きさと数(高温ほど大きく多い)
- 音の高周波成分(高温ほど高音域が増える)
- 音の鋭さ・破裂感(高温ほど鋭い)

必ずJSONだけを返してください。`;

const USER_PROMPT =
  "この音声を解析して、油温ゾーン・推定温度帯・確信度・次の一手をJSONで返してください。";

type AnalysisResult = {
  zone: "ぬるい" | "適温" | "熱すぎ";
  estimated_temp_range: string;
  confidence: number;
  advice: string;
};

export const runtime = "nodejs";

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot).toLowerCase();
}

function resolveMimeType(file: File): string | null {
  const extensionMime = SUPPORTED_AUDIO_TYPES.get(getExtension(file.name));
  if (extensionMime) {
    return extensionMime;
  }

  for (const mimeType of SUPPORTED_AUDIO_TYPES.values()) {
    if (file.type === mimeType) {
      return mimeType;
    }
  }

  return null;
}

function parseAnalysisResult(rawText: string | undefined): AnalysisResult {
  if (!rawText) {
    throw new Error("empty AI response");
  }

  const parsed = JSON.parse(rawText) as Partial<AnalysisResult>;

  if (
    parsed.zone !== "ぬるい" &&
    parsed.zone !== "適温" &&
    parsed.zone !== "熱すぎ"
  ) {
    throw new Error("invalid zone");
  }

  if (
    typeof parsed.estimated_temp_range !== "string" ||
    !parsed.estimated_temp_range.trim()
  ) {
    throw new Error("invalid estimated_temp_range");
  }

  if (
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence)
  ) {
    throw new Error("invalid confidence");
  }

  if (typeof parsed.advice !== "string" || !parsed.advice.trim()) {
    throw new Error("invalid advice");
  }

  return {
    zone: parsed.zone,
    estimated_temp_range: parsed.estimated_temp_range.trim(),
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
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
      return NextResponse.json(
        { error: "audio file required" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "audio file required" },
        { status: 400 },
      );
    }

    const mimeType = resolveMimeType(audio);
    if (!mimeType) {
      return NextResponse.json(
        { error: "unsupported format" },
        { status: 400 },
      );
    }

    if (audio.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "server misconfigured" },
        { status: 500 },
      );
    }

    const audioBuffer = await audio.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { text: USER_PROMPT },
        {
          inlineData: {
            data: audioBase64,
            mimeType,
          },
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: ANALYSIS_RESPONSE_SCHEMA,
      },
    });

    return NextResponse.json(parseAnalysisResult(response.text));
  } catch (error) {
    console.error("POST /api/analyze failed", error);

    if (isAiServiceError(error)) {
      return NextResponse.json(
        { error: "AI service error" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
