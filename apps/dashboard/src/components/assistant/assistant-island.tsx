"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { useTranslations } from "next-intl";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { HeaderCenter } from "@/components/layout/header-actions";
import {
  isComposing,
  islandMode,
  islandWidthClass,
  isTerminalStatus,
} from "@/lib/assistant/island-state";
import { AssistantComposer } from "./assistant-composer";
import { AssistantConfirm } from "./assistant-confirm";
import { AssistantOrb, type OrbState } from "./assistant-orb";
import { useAssistant } from "./assistant-provider";
import { AssistantResult } from "./assistant-result";
import { AssistantRunAction } from "./assistant-run-action";
import { AssistantStage } from "./assistant-stage";
import { useVoiceInput } from "./use-voice-input";

/**
 * The capsule in the header. Closed it is the orb alone — plus the page's
 * action pill (the sheet's Run AI) when the page offers one; hover or focus
 * opens the field; a run replaces the field with its stage line, a
 * confirmation with its question, and the end of a run with its result.
 * Which of those shows is `islandMode` (`lib/assistant/island-state.ts`);
 * the provider owns the run and the page action, this component owns the
 * field. Hidden where `scopeForPath` is null, and below `md` by the outlet it
 * portals into.
 */
export function AssistantIsland() {
  const t = useTranslations("assistant");
  const assistant = useAssistant();
  const [draft, setDraft] = useState("");
  const [isHovered, setHovered] = useState(false);
  const [isFocused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wantsFocus = useRef(false);
  const voice = useVoiceInput((text) => {
    setDraft((current) => (current ? `${current} ${text}` : text));
    wantsFocus.current = true;
  });

  // The field mounts a render after the island opens; focus it then.
  useEffect(() => {
    if (wantsFocus.current && inputRef.current) {
      wantsFocus.current = false;
      inputRef.current.focus();
    }
  });

  if (!assistant.scope) return null;

  const { run, pageAction } = assistant;
  const mode = islandMode({
    status: run?.status ?? null,
    draft,
    isEngaged: isHovered || isFocused,
    voice: voice.state,
    lastTerminal: assistant.lastTerminal,
    isSubmitting: assistant.isSubmitting,
  });
  const atRest = mode === "idle" || isComposing(mode);
  const errorKey = assistant.errorKey ?? voice.errorKey;
  const pageError = pageAction?.errorMessage ?? null;
  const showsError = atRest && (errorKey !== null || pageError !== null);
  const showsAction = atRest && !showsError && pageAction !== null;
  const terminal =
    run && isTerminalStatus(run.status) ? run.status : assistant.lastTerminal;
  const orbState: OrbState =
    mode === "running" || mode === "awaiting" || mode === "submitting"
      ? "running"
      : mode === "recording" || mode === "transcribing"
        ? "listening"
        : "idle";

  const openField = () => {
    setFocused(true);
    wantsFocus.current = true;
  };
  const dismiss = () => {
    assistant.dismiss();
    voice.reset();
    pageAction?.onDismissError();
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || mode !== "typing") return;
    if (await assistant.start(prompt)) setDraft("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || draft !== "") return;
    inputRef.current?.blur();
    setFocused(false);
    setHovered(false);
  };
  const handleBlur = (event: FocusEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
    }
  };
  const handleClick = (event: MouseEvent<HTMLFormElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    openField();
    inputRef.current?.focus();
  };

  return (
    <HeaderCenter>
      <form
        aria-busy={mode === "running" || mode === "submitting"}
        aria-label={t("label")}
        className={cn(
          "pointer-events-auto flex h-control-lg max-w-full items-center gap-2 overflow-hidden rounded-full px-control-x-sm text-foreground",
          "transition-all duration-smooth ease-smooth motion-reduce:transition-none",
          islandWidthClass(showsError ? "open" : mode, showsAction),
        )}
        onBlur={handleBlur}
        onClick={handleClick}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onSubmit={handleSubmit}
      >
        <AssistantOrb state={orbState} />
        {mode === "idle" && !showsError && (
          // Keyboard users have no field to tab into while the capsule is
          // closed: this control, visible only to them, opens it.
          <Button
            className="sr-only"
            onClick={openField}
            onFocus={openField}
            size="icon-sm"
            type="button"
            variant="island"
          >
            {t("open")}
          </Button>
        )}
        {showsError ? (
          <AssistantResult
            errorKey={errorKey}
            message={errorKey ? null : pageError}
            onDismiss={dismiss}
            status={null}
            summary={null}
          />
        ) : isComposing(mode) ? (
          <AssistantComposer
            draft={draft}
            inputRef={inputRef}
            mode={mode}
            onDraftChange={setDraft}
            voice={{
              supported: voice.supported,
              onStart: voice.start,
              onStop: voice.stop,
            }}
          />
        ) : mode === "awaiting" && run?.pendingAction ? (
          <AssistantConfirm
            action={run.pendingAction}
            onRespond={assistant.respond}
          />
        ) : mode === "running" || mode === "awaiting" ? (
          run && <AssistantStage onCancel={assistant.cancel} run={run} />
        ) : mode === "result" ? (
          <AssistantResult
            errorKey={null}
            onDismiss={dismiss}
            status={terminal}
            summary={run?.summary ?? null}
          />
        ) : null}
        {showsAction && pageAction && (
          <AssistantRunAction action={pageAction} />
        )}
      </form>
    </HeaderCenter>
  );
}
