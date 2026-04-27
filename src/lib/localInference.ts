export type EILabel = "noise" | "LOW" | "MID" | "HIGH";

export type EIResult = {
  results: { label: string; value: number }[];
};

export type AudioFeatures = {
  rms: number;
  peak: number;
};

export type EIProperties = {
  frequency?: number;
  frame_sample_count?: number;
  interval_ms?: number;
  label_count?: number;
  labels?: string[];
  slice_size?: number;
  use_continuous_mode?: boolean;
};

type EIClassCategory = {
  label: string;
  value: number;
  delete?: () => void;
};

type EIClassificationReturn = {
  result: number;
  size: () => number;
  get: (index: number) => EIClassCategory;
  delete?: () => void;
};

type EIModule = {
  HEAPU8?: Uint8Array;
  _malloc?: (size: number) => number;
  _free?: (ptr: number) => void;
  init?: () => number | void;
  get_properties?: () => EIProperties;
  run_classifier_continuous?: (
    ptr: number,
    length: number,
    debug: boolean,
    enablePerfCal: boolean,
  ) => EIClassificationReturn;
  onRuntimeInitialized?: () => void;
};

type WindowWithEIModule = Window & { Module?: EIModule };

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function loadModel(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = _doInit().catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

async function _doInit(): Promise<void> {
  const win = window as WindowWithEIModule;

  if (!win.Module) win.Module = {};
  const eiModule = win.Module;

  await new Promise<void>((resolve, reject) => {
    eiModule.onRuntimeInitialized = resolve;
    if (document.querySelector('script[src="/model/edge-impulse-standalone.js"]')) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "/model/edge-impulse-standalone.js";
    script.onerror = () => reject(new Error("WASMモジュールの読み込みに失敗しました"));
    document.head.appendChild(script);
  });

  const initRet = win.Module?.init?.();
  if (typeof initRet === "number" && initRet !== 0) {
    throw new Error("Edge Impulse init() failed: " + initRet);
  }

  initialized = true;
}

export function resetClassifier(): void {
  const ret = (window as WindowWithEIModule).Module?.init?.();
  if (typeof ret === "number" && ret !== 0) {
    throw new Error("Edge Impulse init() failed: " + ret);
  }
}

export function getModelProperties(): EIProperties | null {
  return (window as WindowWithEIModule).Module?.get_properties?.() ?? null;
}

export function getAudioFeatures(samples: Float32Array): AudioFeatures {
  if (samples.length === 0) return { rms: 0, peak: 0 };

  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    if (abs > peak) peak = abs;
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak,
  };
}

export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (samples.length === 0 || Math.abs(fromRate - toRate) < 1) return samples;

  const outputLength = Math.max(1, Math.round(samples.length * toRate / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = (samples.length - 1) / Math.max(1, outputLength - 1);

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const fraction = sourceIndex - leftIndex;
    output[i] = samples[leftIndex] + (samples[rightIndex] - samples[leftIndex]) * fraction;
  }

  return output;
}

export function classifyContinuous(samples: Float32Array): EIResult {
  const Module = (window as WindowWithEIModule).Module;
  if (!Module) throw new Error("Edge Impulse Module が初期化されていません");

  if (
    typeof Module.run_classifier_continuous !== "function" ||
    typeof Module._malloc !== "function" ||
    typeof Module._free !== "function" ||
    !Module.HEAPU8
  ) {
    throw new Error("run_classifier_continuous が Module に存在しません。利用可能なキー: " + Object.keys(Module).filter(k => !k.startsWith("_")).slice(0, 20).join(", "));
  }

  const numBytes = samples.length * 4;
  const ptr = Module._malloc(numBytes);
  // _malloc後にHEAPU8を再参照（メモリ拡張対策）。float32 [-1,1] をそのまま渡す
  new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes).set(
    new Uint8Array(samples.buffer, samples.byteOffset, numBytes)
  );
  const ret = Module.run_classifier_continuous(ptr, samples.length, false, false);
  Module._free(ptr);

  if (typeof ret.result === "undefined") {
    throw new Error("run_classifier_continuous の戻り値が不正: " + JSON.stringify(ret));
  }
  if (ret.result !== 0) {
    ret.delete?.();
    throw new Error("Classification failed: result=" + ret.result);
  }

  const results: { label: string; value: number }[] = [];
  const size = ret.size();
  for (let i = 0; i < size; i++) {
    const c = ret.get(i);
    results.push({ label: c.label, value: c.value });
    c.delete?.();
  }
  ret.delete?.();
  return { results };
}
