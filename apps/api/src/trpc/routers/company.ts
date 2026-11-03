import { idInput } from "../../common/schema";
import {
  addCompanyDocumentInput,
  setCompanyWebsiteInput,
  updateCompanyInput,
} from "../../modules/company/company.schema";
import { companyService } from "../../modules/company/company.service";
import { companyChangesService } from "../../modules/company/company-changes.service";
import { companyDocumentsService } from "../../modules/company/company-documents.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the services.
// One company per user, so nothing here takes a company id: every procedure
// works on the signed-in user's profile (docs/features/company.md).

export const companyRouter = createTRPCRouter({
  /** The profile, created empty on the first read. */
  me: protectedProcedure.query(() => companyService.me().catch(mapDomainError)),

  update: protectedProcedure
    .input(updateCompanyInput)
    .mutation(({ input }) =>
      companyService.update(input).catch(mapDomainError),
    ),

  /** Scrapes the homepage now, crawls the site in the background. */
  setWebsite: protectedProcedure
    .input(setCompanyWebsiteInput)
    .mutation(({ input }) =>
      companyService.setWebsite(input).catch(mapDomainError),
    ),

  recrawl: protectedProcedure.mutation(() =>
    companyService.recrawl().catch(mapDomainError),
  ),

  /** After `POST /files`: the upload becomes a document the worker digests. */
  addDocument: protectedProcedure
    .input(addCompanyDocumentInput)
    .mutation(({ input }) =>
      companyDocumentsService.add(input).catch(mapDomainError),
    ),

  removeDocument: protectedProcedure
    .input(idInput)
    .mutation(({ input }) =>
      companyDocumentsService.remove(input.id).catch(mapDomainError),
    ),

  /** SSE: the whole profile on connect, then again after every change. */
  onChange: protectedProcedure.subscription(async function* ({ signal }) {
    yield* companyChangesService.changes(signal);
  }),
});
