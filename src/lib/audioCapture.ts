let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let captureStream: MediaStream | null = null;

export type AudioCaptureInfo = {
  trackLabel?: string;
  trackMuted?: boolean;
  trackReadyState?: MediaStreamTrackState;
  settings?: MediaTrackSettings;
  audioInputs?: string[];
};

export async function startCapture(
  onSamples: (samples: Float32Array, sampleRate: number) => void,
  onInfo?: (info: AudioCaptureInfo) => void,
): Promise<void> {
  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  audioContext = new AudioContext({ sampleRate: 48000 });
  await audioContext.resume();
  const actualRate = audioContext.sampleRate;
  console.log("[AudioCapture] AudioContext.sampleRate =", actualRate);
  const [track] = captureStream.getAudioTracks();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => device.label || "(label unavailable)");
  const info: AudioCaptureInfo = {
    trackLabel: track?.label,
    trackMuted: track?.muted,
    trackReadyState: track?.readyState,
    settings: track?.getSettings(),
    audioInputs,
  };
  console.log("[AudioCapture] track =", info);
  onInfo?.(info);
  sourceNode = audioContext.createMediaStreamSource(captureStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    onSamples(new Float32Array(e.inputBuffer.getChannelData(0)), actualRate);
  };
  sourceNode.connect(processor);
  processor.connect(audioContext.destination);
}

export function stopCapture(): void {
  processor?.disconnect();
  sourceNode?.disconnect();
  audioContext?.close();
  captureStream?.getTracks().forEach((t) => t.stop());
  processor = null;
  sourceNode = null;
  audioContext = null;
  captureStream = null;
}
