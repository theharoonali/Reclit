"use client";

import { useCallback, useEffect, useRef } from "react";

/** Which voice cell is sounding. Keyed by column *id*, like `cells`. */
export type PlayingVoice = { row: number; columnId: string };

export type SheetAudioApi = {
  playingRef: React.RefObject<PlayingVoice | null>;
  /** Starts this cell, or stops it if it is the one already playing. */
  toggle: (row: number, columnId: string, url: string) => void;
  stop: () => void;
};

/**
 * Playback for voice cells.
 *
 * One `Audio` element is reused for the whole sheet rather than one per cell:
 * a sheet has five million rows, and only one voice note plays at a time
 * anyway, so starting a second cell simply retargets the same element — which
 * also means the first stops without any bookkeeping.
 *
 * The playing cell lives in a ref and repaints the canvas, like every other
 * piece of sheet state. Holding it in React state would re-render the grid and
 * a re-rendered canvas is a blank one.
 */
export function useSheetAudio(requestPaint: () => void): SheetAudioApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef<PlayingVoice | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (playingRef.current === null) return;
    playingRef.current = null;
    requestPaint();
  }, [requestPaint]);

  const toggle = useCallback(
    (row: number, columnId: string, url: string) => {
      const current = playingRef.current;
      if (current && current.row === row && current.columnId === columnId) {
        stop();
        return;
      }

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        // Both paths clear the chip: a note that finishes, and a URL that
        // never loads. Without the error listener a broken link would leave a
        // pause icon on a cell that is not playing.
        audio.addEventListener("ended", stop);
        audio.addEventListener("error", stop);
        audioRef.current = audio;
      }

      audio.src = url;
      playingRef.current = { row, columnId };
      requestPaint();
      // `play()` rejects when the media cannot be loaded or the browser blocks
      // it, and an unhandled rejection here would be invisible in the UI.
      audio.play().catch(stop);
    },
    [requestPaint, stop],
  );

  // Leaving the page mid-note must not keep the audio running.
  useEffect(() => {
    const audio = audioRef;
    return () => audio.current?.pause();
  }, []);

  return { playingRef, toggle, stop };
}
