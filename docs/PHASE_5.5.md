# Phase 5.5: Edge Impulse WebAssembly オンデバイス推論への移行

## 目的
Gemini API（クラウド推論）を、Edge Impulse で学習した自前モデル（WebAssembly）に差し替える。
API コストゼロ・オフライン動作・環境特化の高精度を実現する。

---

## 前提（完了済み）

- [x] Edge Impulse で音声収録・学習済み
- [x] WebAssembly 形式でエクスポート済み（`browser/` フォルダ）

---

## クラス設計

| クラス名  | 録音温度帯        | UI 表示          | メモ |
|-----------|-------------------|------------------|------|
| `noise`   | 油なし・環境音    | （非表示）       | 換気扇・キッチン環境音 |
| `LOW`     | 140°C・150°C     | **低温**         | もう少し加熱を |
| `MID`     | 160°C・170°C・180°C | **適温**      | 天ぷら OK ゾーン |
| `HIGH`    | 190°C・195°C     | **高温**         | 火を弱めて |

温度数値の推定・補間表示はなし。ゾーン表示のみ。

---

## Step 1: ファイル配置

`browser/` フォルダの 2 ファイルを `public/model/` に置く。

```
public/
  model/
    edge-impulse-standalone.js    ← browser/ からコピー
    edge-impulse-standalone.wasm  ← browser/ からコピー
```

---

## Step 2: ラッパー実装

```typescript
// src/lib/localInference.ts

declare const Module: any;

type EIResult = {
  results: { label: string; value: number }[];
  anomaly: number;
};

// run-impulse.js の EdgeImpulseClassifier をそのまま移植
class EdgeImpulseClassifier {
  private static _initialized = false;

  async init(): Promise<void> {
    if (EdgeImpulseClassifier._initialized) return;
    return new Promise((resolve, reject) => {
      Module.onRuntimeInitialized = () => {
        EdgeImpulseClassifier._initialized = true;
        const ret = Module.init();
        if (typeof ret === "number" && ret !== 0) {
          return reject("init() failed: " + ret);
        }
        resolve();
      };
    });
  }

  classifyContinuous(rawData: number[]): EIResult {
    const typedArray = new Float32Array(rawData);
    const numBytes = typedArray.length * 4;
    const ptr = Module._malloc(numBytes);
    const heap = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
    heap.set(new Uint8Array(typedArray.buffer));
    const ret = Module.run_classifier_continuous(ptr, rawData.length, false, true);
    Module._free(ptr);
    if (ret.result !== 0) throw new Error("Classification failed: " + ret.result);
    const results: { label: string; value: number }[] = [];
    for (let i = 0; i < ret.size(); i++) {
      const c = ret.get(i);
      results.push({ label: c.label, value: c.value });
      c.delete();
    }
    ret.delete();
    return { anomaly: ret.anomaly ?? 0, results };
  }

  getProperties() {
    return Module.get_properties();
  }
}

let classifier: EdgeImpulseClassifier | null = null;

export async function loadModel(): Promise<void> {
  // WASM スクリプトを動的ロード
  await new Promise<void>((resolve, reject) => {
    if (document.querySelector('script[src="/model/edge-impulse-standalone.js"]')) {
      return resolve();
    }
    const script = document.createElement("script");
    script.src = "/model/edge-impulse-standalone.js";
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  classifier = new EdgeImpulseClassifier();
  await classifier.init();
}

export function classifyContinuous(samples: number[]) {
  if (!classifier) throw new Error("Model not loaded");
  return classifier.classifyContinuous(samples);
}
```

---

## Step 3: マイク → 推論ループ

Edge Impulse はフレームサイズ・サンプルレートをモデルが持っている。
`getProperties()` で確認できるが、Edge Impulse の音声モデルは通常 **16000 Hz**。

```typescript
// src/lib/audioCapture.ts
let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;

export async function startCapture(
  onSamples: (samples: number[]) => void
): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    onSamples(Array.from(data));
  };
  source.connect(processor);
  processor.connect(audioContext.destination);
}

export function stopCapture(): void {
  processor?.disconnect();
  audioContext?.close();
  processor = null;
  audioContext = null;
}
```

---

## Step 4: クラスラベル → UI マッピング

```typescript
// src/app/page.tsx に追加
type EILabel = "noise" | "LOW" | "MID" | "HIGH";

const LABEL_DISPLAY: Record<EILabel, {
  text: string;
  onomato: string;
  needleTemp: number | null; // メーター針の固定位置
}> = {
  noise: { text: "",     onomato: "",         needleTemp: null },
  LOW:   { text: "低温", onomato: "ジュ…",    needleTemp: 145  },
  MID:   { text: "適温", onomato: "ピチピチ", needleTemp: 170  },
  HIGH:  { text: "高温", onomato: "バチ！",   needleTemp: 192  },
};
```

---

## Step 5: 推論モード切替

```typescript
// src/lib/inferenceMode.ts
export const INFERENCE_MODE: "api" | "local" = "local";
```

`page.tsx` の `startRecording` 内で分岐:

```typescript
if (INFERENCE_MODE === "local") {
  await loadModel();
  setActivity("listening");
  await startCapture((samples) => {
    if (!loopActiveRef.current) return;
    const { results } = classifyContinuous(samples);
    const top = results.reduce((a, b) => a.value > b.value ? a : b);
    const label = top.label as EILabel;
    const display = LABEL_DISPLAY[label];
    if (label === "noise") {
      setResult({ label, text: "", onomato: "", needleTemp: null });
    } else {
      setResult({ label, text: display.text, onomato: display.onomato, needleTemp: display.needleTemp });
    }
  });
} else {
  await runAnalysisLoop(stream, mode.id);
}
```

---

## Step 6: UI 変更点

| 項目 | 現行（API） | ローカルモード |
|---|---|---|
| メーター中央テキスト | ゾーン名（MEDIUM等） | 低温 / 適温 / 高温 |
| 擬音語 | ZONE_DISPLAY 参照 | LABEL_DISPLAY 参照 |
| 針位置 | ZONE_NEEDLE_TEMP 固定値 | LABEL_DISPLAY.needleTemp 固定値 |
| noise 検出時 | — | "油の音が聞こえません" 表示 |

---

## 完了条件

- [ ] `public/model/` にファイル配置完了
- [ ] ローカル推論でリアルタイム判定が動く
- [ ] noise / LOW / MID / HIGH が正しく切り替わる
- [ ] API コールが完全にゼロ（オフライン動作確認）
- [ ] Vercel デプロイで本番動作確認
