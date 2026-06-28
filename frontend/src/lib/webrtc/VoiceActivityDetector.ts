export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analysers = new Map<string, AnalyserNode>();
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private wasSpeaking = new Map<string, boolean>();
  private loopId: number | null = null;

  public onSpeaking?: (peerId: string) => void;

  public trackAudio(peerId: string, trackId: string, stream: MediaStream, track: MediaStreamTrack) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const source = this.audioContext.createMediaStreamSource(new MediaStream([track]));
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const mediaKey = `${peerId}-${stream.id}-${trackId}`;
    this.sources.set(mediaKey, source);
    this.analysers.set(mediaKey, analyser);
    this.startLoop();
  }

  public untrackAudio(peerId: string, trackId: string, streamId: string) {
    const mediaKey = `${peerId}-${streamId}-${trackId}`;

    const analyser = this.analysers.get(mediaKey);
    if (analyser) {
      analyser.disconnect();
      this.analysers.delete(mediaKey);
    }

    const source = this.sources.get(mediaKey);
    if (source) {
      source.disconnect();
      this.sources.delete(mediaKey);
    }

    this.wasSpeaking.delete(mediaKey);

    if (this.analysers.size === 0 && this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.stopLoop();
    }
  }

  public untrackPeer(peerId: string) {
    for (const mediaKey of this.analysers.keys()) {
      if (mediaKey.startsWith(`${peerId}-`)) {
        const [, streamId, trackId] = mediaKey.split("-");
        this.untrackAudio(peerId, trackId, streamId);
      }
    }
  }

  private startLoop() {
    if (this.loopId) return;

    const loop = () => {
      if (this.analysers.size === 0) {
        this.loopId = null;
        return;
      }

      for (const [key, analyser] of this.analysers.entries()) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeakingNow = average > 10;
        const wasSpeaking = this.wasSpeaking.get(key) || false;

        const peerId = key.split("-")[0];
        if (isSpeakingNow && !wasSpeaking) {
          this.onSpeaking?.(peerId);
        }
        if (isSpeakingNow) {
          this.onSpeaking?.(peerId);
        }
        this.wasSpeaking.set(key, isSpeakingNow);
      }

      this.loopId = requestAnimationFrame(loop);
    };

    this.loopId = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.loopId !== null) {
      cancelAnimationFrame(this.loopId);
      this.loopId = null;
    }
  }
}
