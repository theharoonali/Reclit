import { useTranslations } from "next-intl";
import { AssistantOrb } from "@/components/assistant/assistant-orb";

/**
 * The empty state's headline: the Reclit AI orb centred over "Reclit for
 * <workspace>". Just "Reclit" while the workspace list loads.
 */
export function ChatGreeting({ workspaceName }: { workspaceName?: string }) {
  const t = useTranslations("chat");

  return (
    <div className="flex flex-col items-center gap-4">
      <AssistantOrb className="size-orb-md" state="idle" />
      <h1 className="text-center text-display text-foreground">
        {workspaceName
          ? t("greeting", { workspace: workspaceName })
          : t("greetingNoWorkspace")}
      </h1>
    </div>
  );
}
