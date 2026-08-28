"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import type { JsonObject } from "@/lib/ai-spreadsheet/types";

/**
 * `id` exists only so React can keep the two inputs of a row mounted while its
 * key is being typed. Keying on the key itself would remount on every
 * keystroke and drop focus after one character.
 */
type Entry = { id: string; key: string; value: string };

type AiSpreadsheetJsonEditorProps = {
  value: JsonObject | null;
  labels: {
    key: string;
    value: string;
    add: string;
    remove: string;
    empty: string;
  };
  onChange: (value: JsonObject | null) => void;
};

/** Scalars survive a round trip; anything else is kept as its raw text. */
function toEntries(value: JsonObject | null): Entry[] {
  if (!value) return [];
  return Object.entries(value).map(([key, raw], index) => ({
    id: `seed-${index}`,
    key,
    value: typeof raw === "string" ? raw : JSON.stringify(raw),
  }));
}

function toJson(entries: Entry[]): JsonObject | null {
  const result: JsonObject = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key === "") continue;
    try {
      // `26` and `true` come back as a number and a boolean; `Germany` is not
      // valid JSON and falls through to the raw string, which is what we want.
      result[key] = JSON.parse(entry.value) as unknown;
    } catch {
      result[key] = entry.value;
    }
  }
  return Object.keys(result).length === 0 ? null : result;
}

/**
 * The editor behind a JSON cell's capsule. Mount it with a `key` tied to the
 * cell so switching cells re-seeds the draft.
 */
export function AiSpreadsheetJsonEditor(props: AiSpreadsheetJsonEditorProps) {
  const { labels } = props;
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(props.value));
  const nextId = useRef(0);

  const apply = (next: Entry[]) => {
    setEntries(next);
    props.onChange(toJson(next));
  };

  const update = (id: string, patch: Partial<Entry>) => {
    apply(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addEntry = () => {
    nextId.current += 1;
    apply([...entries, { id: `new-${nextId.current}`, key: "", value: "" }]);
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="text-body text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <span className="text-caption text-muted-foreground">
            {labels.key}
          </span>
          <span className="text-caption text-muted-foreground">
            {labels.value}
          </span>
          <span />
          {entries.map((entry) => (
            <Fragment key={entry.id}>
              <Input
                aria-label={labels.key}
                onChange={(event) =>
                  update(entry.id, { key: event.target.value })
                }
                value={entry.key}
              />
              <Input
                aria-label={labels.value}
                onChange={(event) =>
                  update(entry.id, { value: event.target.value })
                }
                value={entry.value}
              />
              <Button
                aria-label={labels.remove}
                onClick={() =>
                  apply(entries.filter((item) => item.id !== entry.id))
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </Fragment>
          ))}
        </div>
      )}

      <Button onClick={addEntry} type="button" variant="outline">
        <Plus />
        {labels.add}
      </Button>
    </div>
  );
}
