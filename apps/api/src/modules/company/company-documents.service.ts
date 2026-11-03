import { mediaTypeFor } from "../../ai/cell-attachments";
import { isRecordNotFound } from "../../common/prisma-errors";
import { prisma } from "../../db/prisma";
import { fileService } from "../file/file.service";
import {
  CompanyDocumentLimitError,
  CompanyDocumentNotFoundError,
  CompanyDocumentTooLargeError,
  CompanyDocumentTypeError,
  CompanyDocumentUrlInvalidError,
} from "./company.errors";
import {
  type AddCompanyDocumentInput,
  COMPANY_DOCUMENT_TYPES,
  type CompanyDocument,
  MAX_COMPANY_DOCUMENT_BYTES,
  MAX_COMPANY_DOCUMENTS,
} from "./company.schema";
import {
  companyDocumentSelect,
  companyService,
  touchCompany,
} from "./company.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The company's uploaded
// documents: the user's add / remove, and the `process-company-document`
// task's writes. The file itself was stored by `POST /files`; only URLs that
// route wrote are accepted, so the worker never fetches an arbitrary address.
// Every write also moves the company's `updatedAt` (`touchCompany`), which is
// what the compiled context is memoised by.

/** Names browsers and OSes use for an accepted type. */
const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "text/x-markdown": "text/markdown",
};

/** The declared type, or the URL's extension when none (or a generic one) was declared. */
export function companyDocumentType(url: string, declared: string): string {
  const type = mediaTypeFor(url, declared || null);
  return TYPE_ALIASES[type] ?? type;
}

const isAccepted = (type: string): boolean =>
  (COMPANY_DOCUMENT_TYPES as readonly string[]).includes(type);

export class CompanyDocumentsService {
  async add(input: AddCompanyDocumentInput): Promise<CompanyDocument> {
    const mimeType = companyDocumentType(input.url, input.mimeType);
    if (!isAccepted(mimeType)) throw new CompanyDocumentTypeError(mimeType);
    if (input.size > MAX_COMPANY_DOCUMENT_BYTES) {
      throw new CompanyDocumentTooLargeError(MAX_COMPANY_DOCUMENT_BYTES);
    }
    if (!fileService.ownsUrl(input.url)) {
      throw new CompanyDocumentUrlInvalidError(input.url);
    }
    const companyId = await companyService.currentId();
    const count = await prisma.companyDocument.count({ where: { companyId } });
    if (count >= MAX_COMPANY_DOCUMENTS) {
      throw new CompanyDocumentLimitError(MAX_COMPANY_DOCUMENTS);
    }
    const [document] = await prisma.$transaction([
      prisma.companyDocument.create({
        data: {
          companyId,
          url: input.url,
          name: input.name,
          mimeType,
          size: input.size,
        },
        select: companyDocumentSelect,
      }),
      touchCompany(companyId),
    ]);
    const dispatched = await companyService.dispatch((dispatcher) =>
      dispatcher.processDocument({ documentId: document.id }),
    );
    if (dispatched !== "failed") return document;
    // A worker that refused will never pick it up: say so instead of PENDING forever.
    await this.finish(document.id, {
      error: "the worker could not be reached",
    });
    return prisma.companyDocument.findUniqueOrThrow({
      where: { id: document.id },
      select: companyDocumentSelect,
    });
  }

  /** The row now, the stored file best effort: a file left behind costs storage, not correctness. */
  async remove(id: string): Promise<{ id: string }> {
    const companyId = await companyService.currentId();
    const document = await prisma.companyDocument.findFirst({
      where: { id, companyId },
      select: { url: true },
    });
    if (!document) throw new CompanyDocumentNotFoundError(id);
    try {
      await prisma.$transaction([
        prisma.companyDocument.delete({ where: { id }, select: { id: true } }),
        touchCompany(companyId),
      ]);
    } catch (error) {
      if (isRecordNotFound(error)) throw new CompanyDocumentNotFoundError(id);
      throw error;
    }
    await fileService.remove(document.url).catch(() => undefined);
    return { id };
  }

  /* ---------------------------------------------- document task writes */

  /** PENDING → PROCESSING; what the task fetches. Null when the document was removed. */
  async start(id: string): Promise<{
    url: string;
    name: string;
    mimeType: string;
  } | null> {
    const document = await prisma.companyDocument.findUnique({
      where: { id },
      select: { companyId: true, url: true, name: true, mimeType: true },
    });
    if (!document) return null;
    const { companyId, ...file } = document;
    await this.write(id, companyId, { status: "PROCESSING", error: null });
    return file;
  }

  /** READY with the digest, or FAILED with the reason. A removed document is ignored. */
  async finish(
    id: string,
    result: { digest: string } | { error: string },
  ): Promise<void> {
    const document = await prisma.companyDocument.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!document) return;
    await this.write(
      id,
      document.companyId,
      "digest" in result
        ? { status: "READY", digest: result.digest, error: null }
        : { status: "FAILED", error: result.error.slice(0, 1000) },
    );
  }

  private async write(
    id: string,
    companyId: string,
    data: {
      status: "PROCESSING" | "READY" | "FAILED";
      digest?: string;
      error: string | null;
    },
  ): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.companyDocument.update({
          where: { id },
          data,
          select: { id: true },
        }),
        touchCompany(companyId),
      ]);
    } catch (error) {
      // Removed while the task worked on it: nothing left to record.
      if (!isRecordNotFound(error)) throw error;
    }
  }
}

export const companyDocumentsService = new CompanyDocumentsService();
