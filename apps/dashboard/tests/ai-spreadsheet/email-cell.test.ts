import { describe, expect, test } from "bun:test";
import {
  EMAIL_FAILED_VALUE,
  emailCellCounts,
  isEmailNode,
} from "@/lib/ai-spreadsheet/email-cell";

describe("emailCellCounts", () => {
  test("counts sent and FAILED entries of the Mail object", () => {
    expect(
      emailCellCounts({
        "ada@example.test": "Subject: Hi\n\nHello Ada",
        "grace@example.test": EMAIL_FAILED_VALUE,
        "boss@corp.test": "Subject: Hi\n\nHello Boss",
      }),
    ).toEqual({ sent: 2, failed: 1 });
  });

  test("an all-sent object has no failures", () => {
    expect(emailCellCounts({ "a@b.test": "Subject: x\n\ny" })).toEqual({
      sent: 1,
      failed: 0,
    });
  });

  test("null and non-object values are not Mail cells", () => {
    expect(emailCellCounts(null)).toBeNull();
    expect(emailCellCounts("Sent to a@b.test: Hi")).toBeNull();
    expect(emailCellCounts(3)).toBeNull();
    expect(emailCellCounts(true)).toBeNull();
  });

  test("an empty object counts nothing", () => {
    expect(emailCellCounts({})).toEqual({ sent: 0, failed: 0 });
  });
});

describe("isEmailNode", () => {
  test("only the email node qualifies", () => {
    expect(isEmailNode({ node: "email" })).toBe(true);
    expect(isEmailNode({ node: "ai" })).toBe(false);
    expect(isEmailNode({ node: null })).toBe(false);
    expect(isEmailNode(undefined)).toBe(false);
  });
});
