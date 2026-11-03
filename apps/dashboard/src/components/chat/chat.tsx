"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  CHAT_MODELS,
  type ChatMessage,
  type ChatModel,
  FIXTURE_REPLY_MS,
} from "@/lib/chat/types";
import { ChatComposer } from "./chat-composer";
import { ChatGreeting } from "./chat-greeting";
import { ChatThread } from "./chat-thread";

/**
 * The chat screen. UI only: messages live in local state and every reply is a
 * canned fixture after a short pause, so the layout can be clicked through
 * before a chat API exists. Empty, the greeting and composer sit centred;
 * once a turn exists the thread fills the column and the composer docks to
 * the bottom of `<main>` (the scroll container).
 */
export function Chat() {
  const t = useTranslations("chat");
  const { activeWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<ChatModel>(CHAT_MODELS[0]);
  const [isPending, setIsPending] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(replyTimer.current), []);

  // Follow the newest turn. The sentinel sits below the docked composer, so
  // the latest message lands just above it instead of underneath it.
  const turnCount = messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turnCount, isPending]);

  const reply = () => {
    setIsPending(true);
    replyTimer.current = setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("fixtureReply"),
        },
      ]);
      setIsPending(false);
    }, FIXTURE_REPLY_MS);
  };

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content },
    ]);
    setDraft("");
    reply();
  };

  const retry = () => {
    setMessages((current) =>
      current.at(-1)?.role === "assistant" ? current.slice(0, -1) : current,
    );
    reply();
  };

  const isEmpty = messages.length === 0;

  const composer = (
    <ChatComposer
      autoFocus
      isPending={isPending}
      model={model}
      onChange={setDraft}
      onModelChange={setModel}
      onSubmit={send}
      placeholder={isEmpty ? t("placeholder") : t("replyPlaceholder")}
      value={draft}
    />
  );

  if (isEmpty) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-chat-column flex-col gap-8">
          <ChatGreeting workspaceName={activeWorkspace?.name} />
          {composer}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-chat-column flex-1 px-4 pt-8 pb-6">
        <ChatThread isPending={isPending} messages={messages} onRetry={retry} />
      </div>
      <div className="sticky bottom-0 bg-gradient-to-t from-background from-70% to-transparent px-4 pt-6 pb-3">
        <div className="mx-auto flex w-full max-w-chat-column flex-col gap-2">
          {composer}
          <p className="text-center text-caption text-muted-foreground">
            {t("disclaimer")}
          </p>
        </div>
      </div>
      <div ref={endRef} />
    </div>
  );
}
