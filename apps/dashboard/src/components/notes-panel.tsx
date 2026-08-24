"use client";

import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";
import { Button } from "@reclit/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTRPC } from "@/trpc/client";

type Note = RouterOutputs["note"]["list"][number];

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const fieldClasses =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The full Note CRUD in one client component: a form that serves both create
 * (no `editing` note) and edit (`editing` set), plus the list with per-row
 * Edit/Delete. Every mutation invalidates `note.list`.
 */
export function NotesPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const titleId = useId();
  const contentId = useId();

  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const {
    data: notes,
    isLoading,
    error,
  } = useQuery(trpc.note.list.queryOptions());

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.note.list.queryKey() });

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setContent("");
  };

  const onSaved = async () => {
    await invalidateList();
    resetForm();
  };

  const create = useMutation(
    trpc.note.create.mutationOptions({ onSuccess: onSaved }),
  );
  const update = useMutation(
    trpc.note.update.mutationOptions({ onSuccess: onSaved }),
  );
  const remove = useMutation(
    trpc.note.remove.mutationOptions({ onSuccess: invalidateList }),
  );

  const pending = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;
  const trimmed = title.trim();

  function startEdit(note: Note) {
    setEditing(note);
    setTitle(note.title);
    setContent(note.content);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || pending) return;

    if (editing) {
      update.mutate({ id: editing.id, title: trimmed, content });
    } else {
      create.mutate({ title: trimmed, content });
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-sm font-medium">
          {editing ? `Editing "${editing.title}"` : "New note"}
        </h2>

        <div className="space-y-2">
          <label htmlFor={titleId} className="text-sm font-medium">
            Title
          </label>
          <input
            id={titleId}
            className={fieldClasses}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Something worth remembering"
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={contentId} className="text-sm font-medium">
            Content
          </label>
          <textarea
            id={contentId}
            className={fieldClasses}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Optional details"
            maxLength={10000}
            rows={3}
          />
        </div>

        {saveError && (
          <p className="text-sm text-destructive">{saveError.message}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!trimmed || pending}>
            {pending ? "Saving..." : editing ? "Save changes" : "Create note"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetForm}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card">
        {isLoading && (
          <p className="p-6 text-sm text-muted-foreground">Loading notes...</p>
        )}

        {error && (
          <p className="p-6 text-sm text-destructive">
            Could not load notes: {error.message}
          </p>
        )}

        {notes && notes.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No notes yet. Create the first one.
          </p>
        )}

        {notes && notes.length > 0 && (
          <ul className="divide-y divide-border">
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{note.title}</p>
                  {note.content && (
                    <p className="truncate text-sm text-muted-foreground">
                      {note.content}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {timestampFormatter.format(note.createdAt)} UTC
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(note)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={
                      remove.isPending && remove.variables?.id === note.id
                    }
                    onClick={() => remove.mutate({ id: note.id })}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
