"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { ArrowRight, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode, RefObject } from "react";
import { ASSISTANT_PROMPT_MAX } from "@/config/assistant";
import type { IslandMode } from "@/lib/assistant/island-state";

/**
 * The capsule's field. At rest (`compact`) it is a short pill reading
 * "Reclit AI"; as the capsule widens the same element grows into the full field
 * with one control inside its right end — the mic while the field is empty
 * (hidden when the browser cannot record), Stop while recording, Send once
 * there is text, a spinner while the audio is transcribed or the prompt is on
 * its way. Enter submits the form around it. Transcribed text lands in the
 * field; it is never sent by itself.
 */
export function AssistantComposer({
  mode,
  draft,
  onDraftChange,
  inputRef,
  voice,
}: {
  mode: Extract<
    IslandMode,
    "idle" | "open" | "typing" | "recording" | "transcribing" | "submitting"
  >;
  draft: string;
  onDraftChange: (draft: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  voice: { supported: boolean; onStart: () => void; onStop: () => void };
}) {
  const t = useTranslations("assistant");
  const compact = mode === "idle";
  const isBusy = mode === "transcribing" || mode === "submitting";
  const placeholder = compact
    ? t("askAi")
    : mode === "recording"
      ? t("listening")
      : mode === "transcribing"
        ? t("transcribing")
        : mode === "submitting"
          ? t("submitting")
          : t("placeholder");

  let control: ReactNode;
  if (isBusy) {
    control = (
      <span className="flex size-control-sm shrink-0 items-center justify-center">
        <Spinner size="sm" />
      </span>
    );
  } else if (mode === "recording") {
    control = (
      <Button
        aria-label={t("stop")}
        onClick={voice.onStop}
        size="icon-sm"
        type="button"
        variant="island"
      >
        <Square aria-hidden="true" />
      </Button>
    );
  } else if (draft.trim() !== "") {
    control = (
      <Button
        aria-label={t("send")}
        size="icon-sm"
        type="submit"
        variant="island"
      >
        <ArrowRight aria-hidden="true" />
      </Button>
    );
  } else if (voice.supported) {
    control = (
      <Button
        aria-label={t("mic")}
        onClick={voice.onStart}
        size="icon-sm"
        tabIndex={compact ? -1 : undefined}
        type="button"
        variant="island-plain"
      >
        <Mic aria-hidden="true" />
      </Button>
    );
  } else control = null;

  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <Input
        aria-label={t("label")}
        autoComplete="off"
        // At rest the label is centred in the pill. Open, the control sits
        // inside the field's right end.
        className={cn(
          compact && "text-center",
          control && !compact && "pr-control-sm",
        )}
        disabled={isBusy}
        enterKeyHint="send"
        maxLength={ASSISTANT_PROMPT_MAX}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        value={draft}
        variant="pill"
      />
      {control && (
        // Fades in as the pill grows; at rest it is neither seen nor reachable.
        <span
          aria-hidden={compact}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center transition-opacity duration-smooth ease-smooth motion-reduce:transition-none",
            compact && "pointer-events-none opacity-0",
          )}
        >
          {control}
        </span>
      )}
    </span>
  );
}
