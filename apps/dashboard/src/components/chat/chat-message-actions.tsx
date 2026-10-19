"use client";

import { Button } from "@reclit/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reclit/ui/tooltip";
import {
  Check,
  Copy,
  type LucideIcon,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type ChatMessageActionsProps = {
  content: string;
  /** Present only on the latest reply — the one a retry replaces. */
  onRetry?: () => void;
};

const COPIED_MS = 1500;

/** The row under an assistant reply: copy, rate, retry. Rating is visual only. */
export function ChatMessageActions({
  content,
  onRetry,
}: ChatMessageActionsProps) {
  const t = useTranslations("chat.actions");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard.writeText(content).then(() => setCopied(true));
  };

  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Action
        icon={copied ? Check : Copy}
        label={copied ? t("copied") : t("copy")}
        onClick={copy}
      />
      <Action icon={ThumbsUp} label={t("good")} />
      <Action icon={ThumbsDown} label={t("bad")} />
      {onRetry && (
        <Action icon={RotateCcw} label={t("retry")} onClick={onRetry} />
      )}
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          onClick={onClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
