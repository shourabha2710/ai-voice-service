import { useState, useRef, useCallback, useEffect } from "react";
import { generateShortAudio } from "../lib/api";
import toast from "react-hot-toast";

/**
 * useVoicePreview Hook
 * 
 * A singleton-like hook to manage voice preview playback.
 * Ensures only one preview plays at a time and handles cleanup.
 */

// Shared state across all instances of the hook
let globalAudio: HTMLAudioElement | null = null;
let globalUrl: string | null = null;
let activeAbortController: AbortController | null = null;

export const useVoicePreview = () => {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stop = useCallback(() => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
      globalAudio = null;
    }
    if (globalUrl) {
      URL.revokeObjectURL(globalUrl);
      globalUrl = null;
    }
    setPlayingVoice(null);
    setIsLoading(false);
  }, []);

  const play = useCallback(async (voiceId: string) => {
    // If already playing this voice, stop it
    if (playingVoice === voiceId) {
      stop();
      return;
    }

    // Stop any existing playback
    stop();

    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      setIsLoading(true);
      setPlayingVoice(voiceId);

      const { blob } = await generateShortAudio({
        text: "Hello! This is a preview of my voice. How do I sound?",
        voice: voiceId,
        rate: "+0%",
        pitch: "+0Hz",
      }, { signal: abortController.signal });

      if (abortController.signal.aborted) {
        return;
      }

      const url = URL.createObjectURL(blob);
      globalUrl = url;
      
      const audio = new Audio(url);
      globalAudio = audio;

      audio.onended = () => {
        stop();
      };

      audio.onerror = () => {
        if (!abortController.signal.aborted) {
          toast.error("Preview failed to play");
          stop();
        }
      };

      await audio.play();
      setIsLoading(false);
    } catch (error: any) {
      if (error?.message !== "canceled" && !abortController.signal.aborted) {
        console.error("[VoicePreview] Failed to play preview:", error);
        toast.error("Failed to generate preview");
      }
      stop();
    }
  }, [playingVoice, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    playingVoice,
    isLoading,
    play,
    stop,
  };
};
