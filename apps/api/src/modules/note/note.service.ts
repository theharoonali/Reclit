import { DomainError } from "../../common/errors";
import { prisma } from "../../db/prisma";
import type { CreateNoteInput, Note, UpdateNoteInput } from "./note.schema";

// Framework-free: no @nestjs/* imports, no decorators — src/trpc/** imports the
// `noteService` singleton below, and that graph must stay decorator-free.

/** Thrown when an id does not resolve. Mapped to 404 / NOT_FOUND at the edges. */
export class NoteNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "NOTE_NOT_FOUND";
  constructor(id: string) {
    super(`Note ${id} not found`);
    this.name = "NoteNotFoundError";
  }
}

// Explicit projection: what the API returns is decided here, not by the model.
const noteSelect = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PRISMA_RECORD_NOT_FOUND = "P2025";

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PRISMA_RECORD_NOT_FOUND
  );
}

export class NoteService {
  async list(): Promise<Note[]> {
    return prisma.note.findMany({
      select: noteSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async byId(id: string): Promise<Note> {
    return this.getOrThrow(id);
  }

  async create(input: CreateNoteInput): Promise<Note> {
    return prisma.note.create({
      data: { title: input.title, content: input.content },
      select: noteSelect,
    });
  }

  async update({ id, ...data }: UpdateNoteInput): Promise<Note> {
    try {
      return await prisma.note.update({
        where: { id },
        data,
        select: noteSelect,
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NoteNotFoundError(id);
      throw error;
    }
  }

  async remove(id: string): Promise<{ id: string }> {
    try {
      await prisma.note.delete({ where: { id } });
      return { id };
    } catch (error) {
      if (isRecordNotFound(error)) throw new NoteNotFoundError(id);
      throw error;
    }
  }

  private async getOrThrow(id: string): Promise<Note> {
    const note = await prisma.note.findUnique({
      where: { id },
      select: noteSelect,
    });
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }
}

export const noteService = new NoteService();
