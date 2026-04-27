let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let captureStream: MediaStream | null = null;

export async function startCapture(onSamples: (samples: Float32Array) => void): Promise<void> {
  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1 },
  });
  audioContext = new AudioContext({ sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(captureStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    onSamples(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(audioContext.destination);
}

export function stopCapture(): void {
  processor?.disconnect();
  audioContext?.close();
  captureStream?.getTracks().forEach((t) => t.stop());
  processor = null;
  audioContext = null;
  captureStream = null;
}
