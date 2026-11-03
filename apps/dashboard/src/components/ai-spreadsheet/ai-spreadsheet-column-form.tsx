"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@reclit/ui/button";
import { CapsuleSelect } from "@reclit/ui/capsule-select";
import { cn } from "@reclit/ui/cn";
import { Input } from "@reclit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reclit/ui/select";
import { Textarea } from "@reclit/ui/textarea";
import { type FormEvent, useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { columnTypes } from "@/lib/ai-spreadsheet/cell-format";
import { isColumnNameTaken } from "@/lib/ai-spreadsheet/column-names";
import { NODE_ICON_ACCENT, NODE_ICONS } from "@/lib/ai-spreadsheet/node-icons";
import type {
  ColumnDraft,
  ColumnType,
  NodeType,
  SheetColumn,
} from "@/lib/ai-spreadsheet/types";

// "No node" is this sentinel inside the capsule control and `null` everywhere
// else — the wire never sees it. `api` is shown locked and is not a wire node.
const NO_NODE = "none";
const API_NODE = "api";
type NodeChoice = NodeType | typeof NO_NODE | typeof API_NODE;

/** API is a picker label only, not a wire node, so it cannot be picked. */
const LOCKED_NODES = new Set<NodeChoice>([API_NODE]);

/** Picker order. */
const NODE_CHOICES: NodeChoice[] = [
  NO_NODE,
  "ai",
  "email",
  API_NODE,
  "google_search",
];

/** The picker shows a node's icon — the same one the header paints. */
function nodeIcon(option: NodeChoice) {
  if (option === NO_NODE || option === API_NODE) return undefined;
  const icon = NODE_ICONS[option];
  return (
    icon && (
      <HugeiconsIcon
        aria-hidden="true"
        className={cn("size-icon", NODE_ICON_ACCENT[option] && "text-primary")}
        icon={icon}
      />
    )
  );
}

type AiSpreadsheetColumnFormProps = {
  /** Absent means "add a new column". One component, both jobs. */
  column?: SheetColumn;
  /** The names of every *other* column — a column may keep its own. */
  otherNames: readonly string[];
  labels: {
    name: string;
    namePlaceholder: string;
    nameTaken: string;
    type: string;
    node: string;
    prompt: string;
    promptPlaceholder: string;
    /** A Mail column's prompt is an email instruction, and it sends on Run. */
    mailPromptPlaceholder: string;
    /** Why the type select is locked on a Mail column. */
    mailTypeLocked: string;
    submit: string;
    cancel: string;
    typeNames: Record<ColumnType, string>;
    nodeNames: Record<NodeChoice, string>;
  };
  onSubmit: (draft: ColumnDraft) => void;
  onCancel: () => void;
};

/**
 * Name, type, node and — when a node is chosen — its prompt, for both adding
 * and editing a column. The prompt is a node's whole configuration: an AI
 * column answers it from the row, a Google Search column searches for it, a
 * Mail column drafts and sends the email it describes.
 * Every control is a shared `@reclit/ui` primitive — see
 * `docs/rules/FRONTEND.md`.
 */
export function AiSpreadsheetColumnForm(props: AiSpreadsheetColumnFormProps) {
  const { column, labels } = props;
  const [name, setName] = useState(column?.name ?? "");
  const [pickedType, setPickedType] = useState<ColumnType>(
    column?.type ?? "string",
  );
  const [node, setNode] = useState<NodeType | null>(column?.node ?? null);
  // A Mail column stores `{address: email | "FAILED"}`, so its type is json
  // — the API refuses anything else. The picked type survives in state, so
  // switching the node away restores it.
  const type = node === "email" ? "json" : pickedType;
  const [prompt, setPrompt] = useState(column?.prompt ?? "");
  const nameId = useId();
  const typeId = useId();
  const nodeId = useId();
  const promptId = useId();
  const nameErrorId = useId();
  const nameTaken = isColumnNameTaken(name, props.otherNames);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "" || nameTaken) return;
    const trimmedPrompt = prompt.trim();
    props.onSubmit({
      name: trimmed,
      type,
      node,
      // A prompt without a node is invalid on the wire; an empty one is null.
      prompt: node === null || trimmedPrompt === "" ? null : trimmedPrompt,
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <FormField htmlFor={nameId} label={labels.name}>
        <Input
          aria-describedby={nameTaken ? nameErrorId : undefined}
          aria-invalid={nameTaken ? true : undefined}
          autoFocus
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.namePlaceholder}
          value={name}
        />
        {nameTaken && (
          <p
            className="text-caption text-destructive"
            id={nameErrorId}
            role="alert"
          >
            {labels.nameTaken}
          </p>
        )}
      </FormField>

      <FormField htmlFor={typeId} label={labels.type}>
        <Select
          disabled={node === "email"}
          onValueChange={(value) => setPickedType(value as ColumnType)}
          value={type}
        >
          <SelectTrigger id={typeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columnTypes.map((option) => (
              <SelectItem key={option} value={option}>
                {labels.typeNames[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {node === "email" && (
          <p className="text-caption text-muted-foreground">
            {labels.mailTypeLocked}
          </p>
        )}
      </FormField>

      <FormField label={labels.node} labelId={nodeId}>
        <CapsuleSelect
          aria-labelledby={nodeId}
          onValueChange={(value) => {
            if (value === NO_NODE) {
              setNode(null);
              return;
            }
            if (
              value === "ai" ||
              value === "google_search" ||
              value === "email"
            ) {
              setNode(value);
            }
          }}
          options={NODE_CHOICES.map((option) => ({
            value: option,
            label: labels.nodeNames[option],
            locked: LOCKED_NODES.has(option),
            icon: nodeIcon(option),
          }))}
          value={node ?? NO_NODE}
        />
      </FormField>

      {node !== null && (
        <FormField htmlFor={promptId} label={labels.prompt}>
          <Textarea
            id={promptId}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              node === "email"
                ? labels.mailPromptPlaceholder
                : labels.promptPlaceholder
            }
            rows={4}
            value={prompt}
          />
        </FormField>
      )}

      <div className="flex gap-2">
        <Button
          disabled={name.trim() === "" || nameTaken}
          type="submit"
          variant="default"
        >
          {labels.submit}
        </Button>
        <Button onClick={props.onCancel} type="button" variant="ghost">
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
