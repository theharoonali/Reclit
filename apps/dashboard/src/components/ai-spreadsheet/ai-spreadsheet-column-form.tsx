"use client";

import { Button } from "@reclit/ui/button";
import { CapsuleSelect } from "@reclit/ui/capsule-select";
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
import { columnTypes, nodeTypes } from "@/lib/ai-spreadsheet/cell-format";
import type {
  ColumnDraft,
  ColumnType,
  NodeType,
  SheetColumn,
} from "@/lib/ai-spreadsheet/types";

// "No node" is this sentinel inside the capsule control and `null` everywhere
// else — the wire never sees it.
const NO_NODE = "none";
type NodeChoice = NodeType | typeof NO_NODE;

type AiSpreadsheetColumnFormProps = {
  /** Absent means "add a new column". One component, both jobs. */
  column?: SheetColumn;
  labels: {
    name: string;
    namePlaceholder: string;
    type: string;
    node: string;
    prompt: string;
    promptPlaceholder: string;
    submit: string;
    cancel: string;
    typeNames: Record<ColumnType, string>;
    nodeNames: Record<NodeType | typeof NO_NODE, string>;
  };
  onSubmit: (draft: ColumnDraft) => void;
  onCancel: () => void;
};

/**
 * Name, type, node and — when a node is chosen — its prompt, for both adding
 * and editing a column. The prompt is a node's whole configuration: an AI
 * column answers it from the row, a Google Search column searches for it.
 * Every control is a shared `@reclit/ui` primitive — see
 * `docs/rules/FRONTEND.md`.
 */
export function AiSpreadsheetColumnForm(props: AiSpreadsheetColumnFormProps) {
  const { column, labels } = props;
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "string");
  const [node, setNode] = useState<NodeType | null>(column?.node ?? null);
  const [prompt, setPrompt] = useState(column?.prompt ?? "");
  const nameId = useId();
  const typeId = useId();
  const nodeId = useId();
  const promptId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
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
          autoFocus
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.namePlaceholder}
          value={name}
        />
      </FormField>

      <FormField htmlFor={typeId} label={labels.type}>
        <Select
          onValueChange={(value) => setType(value as ColumnType)}
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
      </FormField>

      <FormField label={labels.node} labelId={nodeId}>
        <CapsuleSelect
          aria-labelledby={nodeId}
          onValueChange={(value) => setNode(value === NO_NODE ? null : value)}
          options={([NO_NODE, ...nodeTypes] as NodeChoice[]).map((option) => ({
            value: option,
            label: labels.nodeNames[option],
          }))}
          value={node ?? NO_NODE}
        />
      </FormField>

      {node !== null && (
        <FormField htmlFor={promptId} label={labels.prompt}>
          <Textarea
            id={promptId}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={labels.promptPlaceholder}
            rows={4}
            value={prompt}
          />
        </FormField>
      )}

      <div className="flex gap-2">
        <Button disabled={name.trim() === ""} type="submit" variant="default">
          {labels.submit}
        </Button>
        <Button onClick={props.onCancel} type="button" variant="ghost">
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
