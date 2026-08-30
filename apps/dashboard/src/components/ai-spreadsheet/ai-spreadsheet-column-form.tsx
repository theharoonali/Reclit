"use client";

import { Button } from "@reclit/ui/button";
import { CapsuleSelect } from "@reclit/ui/capsule-select";
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reclit/ui/select";
import { Textarea } from "@reclit/ui/textarea";
import { type FormEvent, useId, useState } from "react";
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
 * and editing a column. Every control is a shared `@reclit/ui` primitive — see
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>{labels.name}</Label>
        <Input
          autoFocus
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.namePlaceholder}
          value={name}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={typeId}>{labels.type}</Label>
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
      </div>

      <div className="flex flex-col gap-2">
        <Label id={nodeId}>{labels.node}</Label>
        <CapsuleSelect
          aria-labelledby={nodeId}
          onValueChange={(value) => setNode(value === NO_NODE ? null : value)}
          options={([NO_NODE, ...nodeTypes] as NodeChoice[]).map((option) => ({
            value: option,
            label: labels.nodeNames[option],
          }))}
          value={node ?? NO_NODE}
        />
      </div>

      {node !== null && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={promptId}>{labels.prompt}</Label>
          <Textarea
            id={promptId}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={labels.promptPlaceholder}
            rows={4}
            value={prompt}
          />
        </div>
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
