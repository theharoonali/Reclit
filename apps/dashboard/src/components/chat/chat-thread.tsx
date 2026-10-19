"use client";

import { TooltipProvider } from "@reclit/ui/tooltip";
import { useTranslations } from "next-intl";
import { AssistantOrb } from "@/components/assistant/assistant-orb";
import type { ChatMessage as ChatMessageData } from "@/lib/chat/types";
import { ChatMessage } from "./chat-message";

type ChatThreadProps = {
  messages: ChatMessageData[];
  isPending: boolean;
  onRetry: () => void;
};

/** The conversation, oldest first, with the thinking mark while a reply is pending. */
export function ChatThread({ messages, isPending, onRetry }: ChatThreadProps) {
  const t = useTranslations("chat");
  const lastId = messages.at(-1)?.id;

  return (
    <TooltipProvider>
      <section aria-label={t("threadLabel")} className="flex flex-col gap-6">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onRetry={
              message.id === lastId &&
              message.role === "assistant" &&
              !isPending
                ? onRetry
                : undefined
            }
          />
        ))}
        {isPending && (
          <div aria-live="polite">
            <AssistantOrb state="running" />
            <span className="sr-only">{t("thinking")}</span>
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
