"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import { Textarea } from "@reclit/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { JsonObject } from "@/lib/ai-spreadsheet/types";

/**
 * `id` exists only so React can keep the two fields of an entry mounted while
 * its key is being typed. Keying on the key itself would remount on every
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

/**
 * Scalars survive a round trip; anything else is kept as its raw text. Nested
 * objects and arrays are pretty-printed rather than compacted — the value is a
 * full-height textarea, so the room is there, and `JSON.parse` ignores the
 * whitespace on the way back.
 */
function toEntries(value: JsonObject | null): Entry[] {
  if (!value) return [];
  return Object.entries(value).map(([key, raw], index) => ({
    id: `seed-${index}`,
    key,
    value: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2),
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
 *
 * One stacked block per entry, laid out like `ai-spreadsheet-column-form.tsx`:
 * a label above every field, the key on a single-line `Input`, the value on a
 * full-height `Textarea`. The two used to sit side by side in a three-column
 * grid, which gave each of them half the panel's width — too narrow to read a
 * value of any length, and far too narrow to edit a nested object.
 */
export function AiSpreadsheetJsonEditor(props: AiSpreadsheetJsonEditorProps) {
  const { labels } = props;
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(props.value));
  const nextId = useRef(0);
  // One base per mount; the per-entry ids hang off it, since `useId` cannot be
  // called from inside the map.
  const fieldId = useId();

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
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="text-body text-muted-foreground">{labels.empty}</p>
      ) : (
        entries.map((entry) => {
          const keyId = `${fieldId}-${entry.id}-key`;
          const valueId = `${fieldId}-${entry.id}-value`;
          return (
            <div
              className="flex flex-col gap-4 rounded-sm border border-border p-3"
              key={entry.id}
            >
              <div className="flex flex-col gap-2">
                {/* The remove button rides the key's label row: it belongs to
                    the whole entry, and this keeps it off its own line. */}
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={keyId}>{labels.key}</Label>
                  <Button
                    aria-label={labels.remove}
                    className="-my-1"
                    onClick={() =>
                      apply(entries.filter((item) => item.id !== entry.id))
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Input
                  id={keyId}
                  onChange={(event) =>
                    update(entry.id, { key: event.target.value })
                  }
                  value={entry.key}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={valueId}>{labels.value}</Label>
                <Textarea
                  id={valueId}
                  onChange={(event) =>
                    update(entry.id, { value: event.target.value })
                  }
                  rows={4}
                  value={entry.value}
                />
              </div>
            </div>
          );
        })
      )}

      <Button onClick={addEntry} type="button" variant="outline">
        <Plus />
        {labels.add}
      </Button>
    </div>
  );
}
