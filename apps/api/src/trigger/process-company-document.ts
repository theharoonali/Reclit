import { logger, schemaTask } from "@trigger.dev/sdk";
import { fetchFile } from "../ai/cell-attachments";
import { generateDocumentDigest } from "../ai/company-ai";
import {
  buildDocumentDigestPrompt,
  COMPANY_CONTEXT_CAPS,
  isTextDocument,
} from "../ai/company-prompt";
import { describeError } from "../common/errors";
import { processCompanyDocumentJobSchema } from "../modules/company/company.schema";
import { companyDocumentsService } from "../modules/company/company-documents.service";

// One uploaded company document → a digest, once. PROCESSING → the file
// fetched from storage (the cell attachments' fetch: 15 MB, 30 s) → a PDF or
// an image sent to Gemini as a native file part, a text file inline → the
// markdown digest, capped → READY. A file that cannot be fetched or yields
// nothing is FAILED with the reason; a transient model error is retried
// once, then `onFailure` records it. The digest, not the file, is what every
// later prompt carries (ai/company-prompt.ts `compileCompanyContext`).

export const processCompanyDocumentTask = schemaTask({
  id: "process-company-document",
  schema: processCompanyDocumentJobSchema,
  queue: { concurrencyLimit: 3 },
  maxDuration: 300,
  retry: { maxAttempts: 2, minTimeoutInMs: 10_000, maxTimeoutInMs: 60_000 },
  run: async ({ documentId }) => {
    const document = await companyDocumentsService.start(documentId);
    if (!document) {
      logger.warn("document removed before it was processed", { documentId });
      return { documentId, status: "removed" };
    }
    const file = await fetchFile(document.url);
    if ("error" in file) {
      await companyDocumentsService.finish(documentId, {
        error: `could not be fetched: ${file.error}`,
      });
      return { documentId, status: "failed" };
    }
    const asText = isTextDocument(document.mimeType);
    const generated = await generateDocumentDigest({
      ...buildDocumentDigestPrompt({
        name: document.name,
        mimeType: document.mimeType,
        text: asText ? new TextDecoder().decode(file.data) : null,
      }),
      file: asText
        ? null
        : {
            data: file.data,
            mediaType: document.mimeType,
            filename: document.name,
          },
    });
    const digest = generated.digest
      .trim()
      .slice(0, COMPANY_CONTEXT_CAPS.digest);
    await companyDocumentsService.finish(
      documentId,
      digest === "" ? { error: "the model read nothing in it" } : { digest },
    );
    logger.info("company document digested", {
      documentId,
      characters: digest.length,
      model: generated.model,
      usage: generated.usage,
    });
    return { documentId, status: digest === "" ? "failed" : "ready" };
  },
  onFailure: async ({ payload, error }) => {
    await companyDocumentsService
      .finish(payload.documentId, { error: describeError(error).message })
      .catch(() => {});
  },
});
