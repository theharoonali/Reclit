import { describe, expect, test } from "bun:test";
import { companyErrorKey } from "@/lib/company/api";

describe("companyErrorKey", () => {
  test("update: a refused payload is a validation error", () => {
    expect(companyErrorKey("update", "BAD_REQUEST")).toBe("validation");
  });

  test("setWebsite: each tRPC code is its own failure", () => {
    expect(companyErrorKey("setWebsite", "BAD_REQUEST")).toBe("websiteInvalid");
    expect(companyErrorKey("setWebsite", "SERVICE_UNAVAILABLE")).toBe(
      "aiUnavailable",
    );
    expect(companyErrorKey("setWebsite", "BAD_GATEWAY")).toBe("scrapeFailed");
  });

  test("recrawl: CONFLICT means there is no website", () => {
    expect(companyErrorKey("recrawl", "CONFLICT")).toBe("websiteMissing");
  });

  test("addDocument: CONFLICT is the limit, BAD_REQUEST the type", () => {
    expect(companyErrorKey("addDocument", "CONFLICT")).toBe("documentLimit");
    expect(companyErrorKey("addDocument", "BAD_REQUEST")).toBe("documentType");
  });

  test("removeDocument: NOT_FOUND means it is already gone", () => {
    expect(companyErrorKey("removeDocument", "NOT_FOUND")).toBe(
      "documentNotFound",
    );
  });

  test("a code the procedure does not name is the generic error", () => {
    expect(companyErrorKey("update", "INTERNAL_SERVER_ERROR")).toBe("error");
    expect(companyErrorKey("setWebsite", "CONFLICT")).toBe("error");
    expect(companyErrorKey("recrawl", "BAD_REQUEST")).toBe("error");
    expect(companyErrorKey("addDocument", "NOT_FOUND")).toBe("error");
    expect(companyErrorKey("removeDocument", "BAD_REQUEST")).toBe("error");
    expect(companyErrorKey("update", undefined)).toBe("error");
  });
});
