import { describe, expect, it } from "bun:test";
import { FormulaSyntaxError, tokenize } from "../src/index";

const kinds = (text: string) => tokenize(text).map((token) => token.kind);

function failure(text: string): FormulaSyntaxError {
  try {
    tokenize(text);
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return error;
    throw error;
  }
  throw new Error(`expected "${text}" to fail`);
}

describe("tokenize", () => {
  it("reads refs with spaces, numbers and operators", () => {
    const tokens = tokenize("{Net Revenue} + 1.5");
    expect(tokens).toEqual([
      { kind: "ref", name: "Net Revenue", position: 0 },
      { kind: "op", value: "+", position: 14 },
      { kind: "number", value: 1.5, position: 16 },
      { kind: "end", position: 19 },
    ]);
  });

  it("reads strings in either quote with doubled-quote escapes", () => {
    expect(tokenize('"a""b"')[0]).toEqual({
      kind: "string",
      value: 'a"b',
      position: 0,
    });
    expect(tokenize("'x'")[0]).toEqual({
      kind: "string",
      value: "x",
      position: 0,
    });
  });

  it("upper-cases identifiers and reads two-character operators", () => {
    const tokens = tokenize("sum({a}) <> 1 and {b} != 2 or {c} <= 3 == 4 >= 5");
    expect(
      tokens
        .filter((t) => t.kind === "ident")
        .map((t) => t.kind === "ident" && t.value),
    ).toEqual(["SUM", "AND", "OR"]);
    expect(
      tokens
        .filter((t) => t.kind === "op")
        .map((t) => t.kind === "op" && t.value),
    ).toEqual(["(", ")", "<>", "!=", "<=", "==", ">="]);
  });

  it("trims a ref's name", () => {
    expect(tokenize("{ Region }")[0]).toEqual({
      kind: "ref",
      name: "Region",
      position: 0,
    });
  });

  it("reports an unterminated string with its position", () => {
    const error = failure('1 + "abc');
    expect(error.code).toBe("UNTERMINATED_STRING");
    expect(error.position).toBe(4);
  });

  it("reports an unterminated or empty ref", () => {
    expect(failure("{Region").code).toBe("UNTERMINATED_REF");
    expect(failure("{ }").code).toBe("EMPTY_REF");
  });

  it("reports an unexpected character", () => {
    const error = failure("1 # 2");
    expect(error.code).toBe("UNEXPECTED_CHARACTER");
    expect(error.position).toBe(2);
  });

  it("ends every stream with an end token", () => {
    expect(kinds("")).toEqual(["end"]);
  });
});
