import { describe, expect, test } from "bun:test";
import {
  onboardingErrorKey,
  workspaceNameFromFile,
} from "@/lib/onboarding/complete-onboarding";
import { onboardingRedirect } from "@/lib/onboarding/route";

describe("onboardingRedirect", () => {
  const pending = { onboardingCompleted: false };
  const done = { onboardingCompleted: true };

  test("sends a user who has not onboarded from the app to /onboarding", () => {
    expect(onboardingRedirect(pending, "app")).toBe("/onboarding");
  });

  test("lets an onboarded user into the app", () => {
    expect(onboardingRedirect(done, "app")).toBeNull();
  });

  test("keeps a user who has not onboarded on /onboarding", () => {
    expect(onboardingRedirect(pending, "onboarding")).toBeNull();
  });

  test("sends an onboarded user from /onboarding to the dashboard", () => {
    expect(onboardingRedirect(done, "onboarding")).toBe("/");
  });
});

describe("workspaceNameFromFile", () => {
  test("drops only the last extension", () => {
    expect(workspaceNameFromFile("Q3 leads.final.csv")).toBe("Q3 leads.final");
    expect(workspaceNameFromFile("accounts.xlsx")).toBe("accounts");
  });

  test("keeps a name without an extension and trims it", () => {
    expect(workspaceNameFromFile("  contacts ")).toBe("contacts");
  });

  test("is blank for an extension-only name, so the server falls back", () => {
    expect(workspaceNameFromFile(".csv")).toBe("");
  });

  test("caps the name at 200 characters", () => {
    expect(workspaceNameFromFile(`${"x".repeat(250)}.csv`)).toHaveLength(200);
  });
});

describe("onboardingErrorKey", () => {
  test("maps each server code to its message key", () => {
    expect(onboardingErrorKey("SPREADSHEET_IMPORT_UNSUPPORTED_TYPE")).toBe(
      "errorType",
    );
    expect(onboardingErrorKey("SPREADSHEET_IMPORT_EMPTY")).toBe("errorEmpty");
    expect(onboardingErrorKey("SPREADSHEET_IMPORT_NO_HEADER")).toBe(
      "errorEmpty",
    );
    expect(onboardingErrorKey("SPREADSHEET_IMPORT_TOO_LARGE")).toBe(
      "errorTooLarge",
    );
    expect(onboardingErrorKey("VALIDATION_FAILED")).toBe("errorName");
  });

  test("falls back to the generic message", () => {
    expect(onboardingErrorKey("SPREADSHEET_IMPORT_UNREADABLE")).toBe("error");
    expect(onboardingErrorKey("UNKNOWN")).toBe("error");
  });
});
