import type { ChatMessage as ChatMessageData } from "@/lib/chat/types";
import { ChatMessageActions } from "./chat-message-actions";

type ChatMessageProps = {
  message: ChatMessageData;
  onRetry?: () => void;
};

/**
 * One turn. The user's words sit in a muted bubble on the right; a reply is
 * plain text across the column with its action row underneath — the claude.ai
 * reading layout. Plain text only: line breaks are kept, nothing is parsed.
 */
export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-chat-bubble whitespace-pre-wrap break-words rounded-sm bg-muted px-4 py-2.5 text-body text-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-wrap break-words text-body text-foreground">
        {message.content}
      </p>
      <ChatMessageActions content={message.content} onRetry={onRetry} />
    </div>
  );
}
