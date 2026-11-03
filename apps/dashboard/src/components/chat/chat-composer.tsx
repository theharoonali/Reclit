"use client";

import { Button } from "@reclit/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@reclit/ui/dropdown-menu";
import { Textarea } from "@reclit/ui/textarea";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { CHAT_MODELS, type ChatModel } from "@/lib/chat/types";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  model: ChatModel;
  onModelChange: (model: ChatModel) => void;
  placeholder: string;
  /** A reply is on its way: typing stays open, sending waits. */
  isPending: boolean;
  autoFocus?: boolean;
};

/**
 * The claude.ai-style message box: a growing field over a row with attach on
 * the left and the model chip plus send on the right. Enter sends,
 * Shift+Enter breaks the line. Attach and the model chip are visual only.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  model,
  onModelChange,
  placeholder,
  isPending,
  autoFocus,
}: ChatComposerProps) {
  const t = useTranslations("chat");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !isPending;

  // Grow with the text; `max-h-chat-composer` caps it and the field scrolls.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  const send = () => {
    if (canSend) onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-sm border border-border bg-background p-3 focus-within:border-input"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Textarea
        aria-label={t("composerLabel")}
        autoFocus={autoFocus}
        className="max-h-chat-composer min-h-0 resize-none border-0 px-1 py-1"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={fieldRef}
        rows={1}
        value={value}
      />
      <div className="flex items-center gap-2">
        <Button
          aria-label={t("attach")}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Plus />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("model")}
                size="sm"
                type="button"
                variant="ghost"
              >
                {model}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                onValueChange={(next) => onModelChange(next as ChatModel)}
                value={model}
              >
                {CHAT_MODELS.map((name) => (
                  <DropdownMenuRadioItem key={name} value={name}>
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            aria-label={t("send")}
            disabled={!canSend}
            size="icon-sm"
            type="submit"
            variant="default"
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </form>
  );
}
