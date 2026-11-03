"use client";

import { Button } from "@reclit/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@reclit/ui/dialog";
import { Input } from "@reclit/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@reclit/ui/table";
import { Textarea } from "@reclit/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { JsonObject } from "@/lib/ai-spreadsheet/types";

type Entry = { id: string; key: string; value: string };

/** Object → draft rows. String values pass through raw; the rest as JSON. */
function toEntries(value: JsonObject | null): Entry[] {
  if (value === null) return [];
  return Object.entries(value).map(([key, raw], index) => ({
    id: `${index}`,
    key,
    value: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2),
  }));
}

/** Draft rows → object. Blank keys are dropped; JSON values parse, the rest stay text. */
function toJson(entries: Entry[]): JsonObject | null {
  const result: JsonObject = {};
  let keys = 0;
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key === "") continue;
    keys++;
    try {
      result[key] = JSON.parse(entry.value) as JsonObject[string];
    } catch {
      result[key] = entry.value;
    }
  }
  return keys === 0 ? null : result;
}

/**
 * The modal cell editor a JSON or Mail cell opens on double-click: the
 * object as a key/value table — for a Mail cell, recipient → sent email or
 * FAILED — edited as a draft and written once on Save. Unlike the side
 * panel's live-writing editors, a modal has a cancel, so nothing touches
 * the cell until the draft is confirmed.
 */
export function AiSpreadsheetCellDialog(props: {
  title: string;
  value: JsonObject | null;
  labels: {
    key: string;
    value: string;
    add: string;
    remove: string;
    empty: string;
    save: string;
    cancel: string;
  };
  onSave: (value: JsonObject | null) => void;
  onClose: () => void;
}) {
  const { title, labels, onSave, onClose } = props;
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(props.value));
  const idBase = useId();
  const [nextId, setNextId] = useState(entries.length);

  const update = (id: string, patch: Partial<Entry>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-cell-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-subtitle text-muted-foreground">{labels.empty}</p>
        ) : (
          <div className="max-h-cell-dialog-body overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">{labels.key}</TableHead>
                  <TableHead>{labels.value}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="align-top">
                      <Input
                        aria-label={labels.key}
                        id={`${idBase}-${entry.id}-key`}
                        onChange={(event) =>
                          update(entry.id, { key: event.target.value })
                        }
                        value={entry.key}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        aria-label={labels.value}
                        onChange={(event) =>
                          update(entry.id, { value: event.target.value })
                        }
                        rows={Math.min(
                          10,
                          Math.max(3, entry.value.split("\n").length),
                        )}
                        value={entry.value}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        aria-label={labels.remove}
                        onClick={() =>
                          setEntries((current) =>
                            current.filter((it) => it.id !== entry.id),
                          )
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            onClick={() => {
              setEntries((current) => [
                ...current,
                { id: `new-${nextId}`, key: "", value: "" },
              ]);
              setNextId((n) => n + 1);
            }}
            type="button"
            variant="outline"
          >
            <Plus />
            {labels.add}
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="ghost">
              {labels.cancel}
            </Button>
            <Button
              onClick={() => onSave(toJson(entries))}
              type="button"
              variant="default"
            >
              {labels.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
