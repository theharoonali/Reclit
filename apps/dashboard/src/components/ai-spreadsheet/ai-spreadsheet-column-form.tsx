"use client";

import { Button } from "@reclit/ui/button";
import { CapsuleSelect } from "@reclit/ui/capsule-select";
import { Checkbox } from "@reclit/ui/checkbox";
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
import { parseShortColumnId } from "@/lib/ai-spreadsheet/short-ids";
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

/** The nodes whose input is a chosen set of columns rather than the whole row. */
const NEEDS_SOURCE_COLUMNS = new Set<NodeType>(["google_search"]);

type AiSpreadsheetColumnFormProps = {
  /** Absent means "add a new column". One component, both jobs. */
  column?: SheetColumn;
  /**
   * The sheet's columns, for the search-input picker. In display order; the
   * column being edited is filtered out here, not by the caller.
   */
  columns: readonly SheetColumn[];
  labels: {
    name: string;
    namePlaceholder: string;
    type: string;
    node: string;
    prompt: string;
    promptPlaceholder: string;
    sourceColumns: string;
    sourceColumnsHint: string;
    sourceColumnsEmpty: string;
    submit: string;
    cancel: string;
    typeNames: Record<ColumnType, string>;
    nodeNames: Record<NodeType | typeof NO_NODE, string>;
  };
  onSubmit: (draft: ColumnDraft) => void;
  onCancel: () => void;
};

/**
 * Name, type, node and — when a node is chosen — its prompt, plus the search
 * input for a node that reads named columns instead of the whole row, for both
 * adding and editing a column. Every control is a shared `@reclit/ui`
 * primitive — see `docs/rules/FRONTEND.md`.
 */
export function AiSpreadsheetColumnForm(props: AiSpreadsheetColumnFormProps) {
  const { column, labels } = props;
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "string");
  const [node, setNode] = useState<NodeType | null>(column?.node ?? null);
  const [prompt, setPrompt] = useState(column?.prompt ?? "");
  // Order matters: it is the order the values are read into the query, so the
  // list is kept as picked rather than sorted.
  const [sourceColumns, setSourceColumns] = useState<number[]>(
    column?.config?.sourceColumns ?? [],
  );
  const nameId = useId();
  const typeId = useId();
  const nodeId = useId();
  const promptId = useId();
  const sourceId = useId();

  /** Every column but this one, with the wire index the config stores. */
  const candidates = props.columns
    .filter((candidate) => candidate.id !== column?.id)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      index: parseShortColumnId(candidate.id),
    }))
    .filter(
      (candidate): candidate is { id: string; name: string; index: number } =>
        candidate.index !== null,
    );

  const needsSource = node !== null && NEEDS_SOURCE_COLUMNS.has(node);

  const toggleSource = (index: number) =>
    setSourceColumns((picked) =>
      picked.includes(index)
        ? picked.filter((one) => one !== index)
        : [...picked, index],
    );

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
      // Same rule for the config, and a node that does not read named columns
      // must not carry them.
      config:
        needsSource && sourceColumns.length > 0 ? { sourceColumns } : null,
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

      {needsSource && (
        <FormField label={labels.sourceColumns} labelId={sourceId}>
          <p className="text-caption text-muted-foreground">
            {labels.sourceColumnsHint}
          </p>
          {candidates.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              {labels.sourceColumnsEmpty}
            </p>
          ) : (
            <div
              aria-labelledby={sourceId}
              className="flex flex-col gap-2"
              role="group"
            >
              {candidates.map((candidate) => {
                const at = sourceColumns.indexOf(candidate.index);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 text-label"
                    htmlFor={`${sourceId}-${candidate.id}`}
                    key={candidate.id}
                  >
                    <Checkbox
                      checked={at !== -1}
                      id={`${sourceId}-${candidate.id}`}
                      onCheckedChange={() => toggleSource(candidate.index)}
                    />
                    <span className="truncate">{candidate.name}</span>
                    {/* The position is the read order, so it has to be visible. */}
                    {at !== -1 && (
                      <span className="text-caption text-muted-foreground">
                        {at + 1}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
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
