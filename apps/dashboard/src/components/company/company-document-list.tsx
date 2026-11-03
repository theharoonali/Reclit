"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Chip, type ChipTone } from "@/components/common/chip";
import {
  type DocumentStatusKey,
  documentStatusKey,
  isDocumentBusy,
} from "@/lib/company/documents";
import { formatFileSize } from "@/lib/format-file-size";
import type { CompanyDocumentRow } from "./use-company-documents";

const TONES: Record<DocumentStatusKey, ChipTone> = {
  uploading: "muted",
  processing: "muted",
  ready: "success",
  failed: "destructive",
};

type CompanyDocumentListProps = {
  items: CompanyDocumentRow[];
  onRemove: (id: string) => void;
  /** The row whose removal is in flight: its button spins. */
  removingId: string | null;
};

/**
 * The company's documents, oldest first, then the uploads on their way: the
 * name, the size, a status chip (uploading, reading, ready, failed — the
 * failure's reason as its tooltip) and a remove button. An upload cannot be
 * removed until it is stored.
 */
export function CompanyDocumentList({
  items,
  onRemove,
  removingId,
}: CompanyDocumentListProps) {
  const t = useTranslations("company.documents");

  if (items.length === 0) {
    return <p className="text-caption text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {items.map((item) => {
        const key = documentStatusKey(item.status);
        const isRemoving = removingId === item.id;
        return (
          <li className="flex items-center gap-3 px-3 py-2" key={item.id}>
            <FileText
              aria-hidden="true"
              className="size-icon shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-label">{item.name}</p>
              <p className="text-caption text-muted-foreground">
                {formatFileSize(item.size)}
              </p>
            </div>
            <span title={item.error ?? undefined}>
              <Chip tone={TONES[key]}>
                {isDocumentBusy(item.status) && <Spinner size="sm" />}
                {t(`status.${key}`)}
              </Chip>
            </span>
            <Button
              aria-label={t("remove", { name: item.name })}
              disabled={item.status === "UPLOADING" || isRemoving}
              onClick={() => onRemove(item.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {isRemoving ? <Spinner size="sm" /> : <X />}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
