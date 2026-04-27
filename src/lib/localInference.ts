export type EILabel = "noise" | "LOW" | "MID" | "HIGH";

export type EIResult = {
  results: { label: string; value: number }[];
};

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function loadModel(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = _doInit();
  return initPromise;
}

async function _doInit(): Promise<void> {
  const win = window as any;

  // Pre-configure Module so Emscripten picks up our onRuntimeInitialized callback
  if (!win.Module) win.Module = {};

  await new Promise<void>((resolve, reject) => {
    win.Module.onRuntimeInitialized = resolve;
    const script = document.createElement("script");
    script.src = "/model/edge-impulse-standalone.js";
    script.onerror = () => reject(new Error("WASMモジュールの読み込みに失敗しました"));
    document.head.appendChild(script);
  });

  const ret = win.Module.init?.();
  if (typeof ret === "number" && ret !== 0) {
    throw new Error("Edge Impulse init() failed: " + ret);
  }

  initialized = true;
}

export function classifyContinuous(samples: Float32Array): EIResult {
  const Module = (window as any).Module;
  const numBytes = samples.length * 4;
  const ptr = Module._malloc(numBytes);
  const heap = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
  heap.set(new Uint8Array(samples.buffer, samples.byteOffset, numBytes));
  const ret = Module.run_classifier_continuous(ptr, samples.length, false, true);
  Module._free(ptr);
  if (ret.result !== 0) throw new Error("Classification failed: " + ret.result);
  const results: { label: string; value: number }[] = [];
  for (let i = 0; i < ret.size(); i++) {
    const c = ret.get(i);
    results.push({ label: c.label, value: c.value });
    c.delete();
  }
  ret.delete();
  return { results };
}
