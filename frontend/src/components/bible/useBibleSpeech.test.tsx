import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferredVoiceURI, useBibleSpeech } from "./useBibleSpeech";

class MockUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function voice(voiceURI: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    voiceURI,
    name: voiceURI,
    lang,
    default: isDefault,
    localService: true,
  };
}

describe("Bible browser speech", () => {
  let voices: SpeechSynthesisVoice[];
  let utterances: MockUtterance[];
  let voicesChanged: (() => void) | null;
  const cancel = vi.fn();
  const pause = vi.fn();
  const resume = vi.fn();
  const speak = vi.fn((utterance: MockUtterance) => {
    utterances.push(utterance);
    utterance.onstart?.();
  });
  const synth = {
    paused: false,
    speaking: false,
    getVoices: vi.fn(() => voices),
    speak,
    cancel,
    pause: vi.fn(() => {
      synth.paused = true;
      pause();
    }),
    resume: vi.fn(() => {
      synth.paused = false;
      resume();
    }),
    addEventListener: vi.fn((name: string, listener: () => void) => {
      if (name === "voiceschanged") voicesChanged = listener;
    }),
    removeEventListener: vi.fn(),
  };

  beforeEach(() => {
    voices = [voice("Spanish", "es-ES"), voice("English default", "en-US", true)];
    utterances = [];
    voicesChanged = null;
    synth.paused = false;
    cancel.mockClear();
    pause.mockClear();
    resume.mockClear();
    speak.mockClear();
    synth.getVoices.mockClear();
    synth.addEventListener.mockClear();
    synth.removeEventListener.mockClear();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: synth,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chooses requested and portable fallback voices", () => {
    expect(preferredVoiceURI(voices, "Spanish")).toBe("Spanish");
    expect(preferredVoiceURI(voices, "missing")).toBe("English default");
    expect(preferredVoiceURI([voice("English", "en-GB")], "")).toBe("English");
    expect(preferredVoiceURI([], "")).toBe("");
  });

  it("loads delayed voices and supports play, pause, resume, progression, and stop", async () => {
    voices = [];

    function Harness() {
      const [verse, setVerse] = useState(1);
      const speech = useBibleSpeech({
        text: `verse ${verse}`,
        utteranceKey: `book:1:${verse}`,
        scopeKey: "book",
        voiceURI: "",
        active: true,
        onAdvance: () => {
          if (verse >= 2) return false;
          setVerse(current => current + 1);
          return true;
        },
      });
      return (
        <>
          <span data-testid="state">{speech.state}</span>
          <span data-testid="voice">{speech.resolvedVoiceURI}</span>
          <button type="button" onClick={speech.togglePlayPause}>
            toggle
          </button>
          <button type="button" onClick={speech.stop}>
            stop
          </button>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("voice")).toHaveTextContent("");
    voices = [voice("English default", "en-US", true)];
    act(() => voicesChanged?.());
    expect(await screen.findByText("English default")).toBeInTheDocument();

    fireEvent.click(screen.getByText("toggle"));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("playing");

    fireEvent.click(screen.getByText("toggle"));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("paused");

    fireEvent.click(screen.getByText("toggle"));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("playing");

    act(() => utterances[0].onend?.());
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(utterances[1].text).toBe("verse 2");

    act(() => utterances[1].onend?.());
    expect(screen.getByTestId("state")).toHaveTextContent("idle");

    fireEvent.click(screen.getByText("toggle"));
    const stoppedUtterance = utterances[2];
    fireEvent.click(screen.getByText("stop"));
    act(() => stoppedUtterance.onend?.());
    expect(speak).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("restarts the current verse for a voice change and invalidates stale scope callbacks", async () => {
    const onAdvance = vi.fn(() => true);

    function Harness({
      scopeKey,
      voiceURI,
    }: {
      scopeKey: string;
      voiceURI: string;
    }) {
      const speech = useBibleSpeech({
        text: "current verse",
        utteranceKey: "book:1:1",
        scopeKey,
        voiceURI,
        active: true,
        onAdvance,
      });
      return (
        <>
          <span data-testid="state">{speech.state}</span>
          <button type="button" onClick={speech.play}>
            play
          </button>
        </>
      );
    }

    const { rerender, unmount } = render(<Harness scopeKey="book-one" voiceURI="" />);
    fireEvent.click(screen.getByText("play"));
    expect(speak).toHaveBeenCalledTimes(1);

    rerender(<Harness scopeKey="book-one" voiceURI="Spanish" />);
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(utterances[1].voice?.voiceURI).toBe("Spanish");

    const staleUtterance = utterances[1];
    rerender(<Harness scopeKey="book-two" voiceURI="Spanish" />);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    act(() => staleUtterance.onend?.());
    expect(onAdvance).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(2);

    const cancellationCount = cancel.mock.calls.length;
    unmount();
    expect(cancel.mock.calls.length).toBeGreaterThan(cancellationCount);
  });
});
