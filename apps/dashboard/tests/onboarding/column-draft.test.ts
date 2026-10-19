import { describe, expect, test } from "bun:test";
import {
  canCreate,
  columnDraftIssues,
  fromSuggestions,
  newAiColumn,
  newPlainColumn,
  setColumnMode,
  toCreateColumns,
} from "@/lib/onboarding/column-draft";

describe("column drafts", () => {
  const suggested = fromSuggestions(
    [
      { name: "Priority", type: "string", prompt: "Rate the urgency" },
      { name: "Score", type: "number", prompt: "Score 1-10" },
    ],
    3,
  );

  test("turns suggestions into AI drafts with unique keys per seed", () => {
    expect(suggested.map((draft) => draft.key)).toEqual(["ai-3-0", "ai-3-1"]);
    expect(suggested[0]).toMatchObject({
      source: "ai",
      node: "ai",
      prompt: "Rate the urgency",
    });
  });

  test("new columns start blank, AI or plain", () => {
    expect(newAiColumn("user-1")).toMatchObject({
      source: "user",
      node: "ai",
      prompt: "",
    });
    expect(newPlainColumn("user-2")).toMatchObject({
      node: null,
      prompt: null,
    });
  });

  test("switching the kind keeps the name and drops or restores the prompt", () => {
    const plain = setColumnMode(suggested[0]!, "plain");
    expect(plain).toMatchObject({ name: "Priority", node: null, prompt: null });
    expect(setColumnMode(plain, "ai")).toMatchObject({
      node: "ai",
      prompt: "",
    });
  });

  test("flags a blank name, a taken name and a missing prompt", () => {
    const drafts = [
      ...suggested,
      { ...newAiColumn("a"), name: "  " },
      { ...newPlainColumn("b"), name: " age " },
      { ...newAiColumn("c"), name: "priority" },
      { ...newAiColumn("d"), name: "Notes", prompt: "  " },
    ];
    const issues = columnDraftIssues(drafts, ["Name", "Age"]);
    expect(issues).toEqual({
      "ai-3-0": "nameTaken", // repeated by draft "c", case-insensitively
      "ai-3-1": null,
      a: "nameRequired",
      b: "nameTaken",
      c: "nameTaken",
      d: "promptRequired",
    });
    expect(canCreate(issues)).toBe(false);
    expect(canCreate(columnDraftIssues(suggested, ["Name"]))).toBe(true);
  });

  test("serialises drafts for POST /onboarding, trimmed", () => {
    expect(
      toCreateColumns([
        { ...suggested[1]!, name: " Score ", prompt: " Score 1-10 " },
        { ...newPlainColumn("p"), name: "Notes" },
      ]),
    ).toEqual([
      { name: "Score", type: "number", node: "ai", prompt: "Score 1-10" },
      { name: "Notes", type: "string", node: null, prompt: null },
    ]);
  });
});
