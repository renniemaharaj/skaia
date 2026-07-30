import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type BibleSpeechState = "idle" | "playing" | "paused";

interface UseBibleSpeechOptions {
  text: string;
  utteranceKey: string;
  scopeKey: string;
  voiceURI: string;
  active: boolean;
  onAdvance: () => boolean;
}

export function preferredVoiceURI(
  voices: SpeechSynthesisVoice[],
  requestedVoiceURI: string
): string {
  const requested = voices.find(voice => voice.voiceURI === requestedVoiceURI);
  if (requested) return requested.voiceURI;
  return (
    voices.find(voice => voice.default && voice.lang.toLowerCase().startsWith("en"))?.voiceURI ??
    voices.find(voice => voice.lang.toLowerCase().startsWith("en"))?.voiceURI ??
    voices.find(voice => voice.default)?.voiceURI ??
    voices[0]?.voiceURI ??
    ""
  );
}

export function useBibleSpeech({
  text,
  utteranceKey,
  scopeKey,
  voiceURI,
  active,
  onAdvance,
}: UseBibleSpeechOptions) {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [state, setState] = useState<BibleSpeechState>("idle");
  const stateRef = useRef<BibleSpeechState>("idle");
  const generationRef = useRef(0);
  const continuousRef = useRef(false);
  const spokenKeyRef = useRef("");
  const spokenVoiceRef = useRef("");
  const scopeKeyRef = useRef(scopeKey);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  const resolvedVoiceURI = useMemo(() => preferredVoiceURI(voices, voiceURI), [voices, voiceURI]);

  const updateState = useCallback((next: BibleSpeechState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, [supported]);

  const stop = useCallback(() => {
    continuousRef.current = false;
    generationRef.current += 1;
    spokenKeyRef.current = "";
    spokenVoiceRef.current = "";
    if (supported) window.speechSynthesis.cancel();
    updateState("idle");
  }, [supported, updateState]);

  const speakCurrent = useCallback(() => {
    if (!supported || !active || !text.trim()) return false;
    const synth = window.speechSynthesis;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find(voice => voice.voiceURI === resolvedVoiceURI);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1;
    utterance.pitch = 1;
    spokenKeyRef.current = utteranceKey;
    spokenVoiceRef.current = resolvedVoiceURI;

    utterance.onstart = () => {
      if (generationRef.current !== generation) return;
      updateState("playing");
    };
    utterance.onend = () => {
      if (generationRef.current !== generation || !continuousRef.current) return;
      if (!onAdvanceRef.current()) {
        continuousRef.current = false;
        spokenKeyRef.current = "";
        updateState("idle");
      }
    };
    utterance.onerror = () => {
      if (generationRef.current !== generation) return;
      continuousRef.current = false;
      spokenKeyRef.current = "";
      updateState("idle");
    };

    updateState("playing");
    synth.speak(utterance);
    return true;
  }, [active, resolvedVoiceURI, supported, text, updateState, utteranceKey, voices]);

  const play = useCallback(() => {
    if (!supported || !active) return;
    if (stateRef.current === "paused" && window.speechSynthesis.paused) {
      continuousRef.current = true;
      window.speechSynthesis.resume();
      updateState("playing");
      return;
    }
    continuousRef.current = true;
    if (!speakCurrent()) continuousRef.current = false;
  }, [active, speakCurrent, supported, updateState]);

  const pause = useCallback(() => {
    if (!supported || stateRef.current !== "playing") return;
    window.speechSynthesis.pause();
    updateState("paused");
  }, [supported, updateState]);

  const togglePlayPause = useCallback(() => {
    if (stateRef.current === "playing") pause();
    else play();
  }, [pause, play]);

  useEffect(() => {
    const scopeChanged = scopeKeyRef.current !== scopeKey;
    scopeKeyRef.current = scopeKey;
    if (!active || scopeChanged) {
      stop();
      return;
    }
    if (stateRef.current === "paused" && spokenKeyRef.current !== utteranceKey) {
      stop();
      return;
    }
    if (
      continuousRef.current &&
      stateRef.current === "playing" &&
      (spokenKeyRef.current !== utteranceKey || spokenVoiceRef.current !== resolvedVoiceURI)
    ) {
      speakCurrent();
    }
  }, [active, resolvedVoiceURI, scopeKey, speakCurrent, stop, utteranceKey]);

  useEffect(() => stop, [stop]);

  return {
    supported,
    voices,
    resolvedVoiceURI,
    state,
    play,
    pause,
    stop,
    togglePlayPause,
  };
}
