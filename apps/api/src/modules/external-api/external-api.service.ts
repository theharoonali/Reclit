import type { Prisma } from "../../../generated/prisma/client";
import { isForeignKeyViolation } from "../../common/prisma-errors";
import { prisma, toJsonInput } from "../../db/prisma";
import {
  ExternalApiCellNotFoundError,
  ExternalApiNotFoundError,
} from "./external-api.errors";
import type {
  ExternalApi,
  ExternalApiOutput,
  FindExternalApiInput,
  SaveExternalApiInput,
} from "./external-api.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The store behind every
// external processing step: "what did service X make of `input` for this
// cell?". Nothing here knows about audio, PDFs or scraping — a processor calls
// `resolve` with a key and a function that produces the result, and gets a
// cached row or a fresh one. Deletion is the database's job: `cellId` is a
// foreign key with ON DELETE CASCADE.

const externalApiSelect = {
  id: true,
  cellId: true,
  input: true,
  output: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toExternalApi(
  record: Prisma.ExternalApiGetPayload<{ select: typeof externalApiSelect }>,
): ExternalApi {
  return {
    ...record,
    // `save` is the only writer and only accepts a validated output object.
    output: record.output as ExternalApiOutput,
  };
}

export class ExternalApiService {
  /**
   * The newest result stored for this cell and this source, or null. `input`
   * is deliberately not unique, so a race that stored two rows resolves to
   * the later one rather than failing.
   */
  async find({
    cellId,
    input,
  }: FindExternalApiInput): Promise<ExternalApi | null> {
    const record = await prisma.externalApi.findFirst({
      where: { cellId, input },
      orderBy: { createdAt: "desc" },
      select: externalApiSelect,
    });
    return record ? toExternalApi(record) : null;
  }

  /** Every result of one cell, newest first — the "fetch by cell_id" read. */
  async listByCell(cellId: string): Promise<ExternalApi[]> {
    const records = await prisma.externalApi.findMany({
      where: { cellId },
      orderBy: { createdAt: "desc" },
      select: externalApiSelect,
    });
    return records.map(toExternalApi);
  }

  async byId(id: string): Promise<ExternalApi> {
    const record = await prisma.externalApi.findUnique({
      where: { id },
      select: externalApiSelect,
    });
    if (!record) throw new ExternalApiNotFoundError(id);
    return toExternalApi(record);
  }

  /**
   * Stores a result under `(cellId, input)`: the newest matching row is
   * replaced, otherwise a row is created. Replacing rather than appending
   * keeps a re-processed source to one row while leaving the column free of a
   * unique constraint (the same cell may carry several sources, and a future
   * kind may want several results for one).
   */
  async save({
    cellId,
    input,
    output,
  }: SaveExternalApiInput): Promise<ExternalApi> {
    const existing = await this.find({ cellId, input });
    try {
      const record = existing
        ? await prisma.externalApi.update({
            where: { id: existing.id },
            data: { output: toJsonInput(output) },
            select: externalApiSelect,
          })
        : await prisma.externalApi.create({
            data: { cellId, input, output: toJsonInput(output) },
            select: externalApiSelect,
          });
      return toExternalApi(record);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ExternalApiCellNotFoundError(cellId);
      }
      throw error;
    }
  }

  /**
   * The entry point of every processor: the stored result for this cell and
   * source, or `produce()`'s result stored under that key. `reused` says which
   * one it was — a caller records it, nothing branches on it.
   *
   *   const { record, reused } = await externalApiService.resolve(
   *     { cellId, input: url },
   *     () => transcribe(url),
   *     isTranscript,
   *   );
   *
   * `accept` is what makes a stored row a *hit*: a record of another kind, or
   * of an older shape than the caller now understands, is re-produced and
   * replaced instead of being handed back. Without it any stored row wins.
   */
  async resolve(
    key: FindExternalApiInput,
    produce: () => Promise<ExternalApiOutput>,
    accept: (output: ExternalApiOutput) => boolean = () => true,
  ): Promise<{ record: ExternalApi; reused: boolean }> {
    const cached = await this.find(key);
    if (cached && accept(cached.output))
      return { record: cached, reused: true };
    const output = await produce();
    return { record: await this.save({ ...key, output }), reused: false };
  }
}

export const externalApiService = new ExternalApiService();
