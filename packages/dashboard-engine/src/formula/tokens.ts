/**
 * The scanner. A formula is a flat string an LLM or a person types, so every
 * failure carries the offset it happened at — the one thing a caller needs to
 * point at the problem.
 */

export type FormulaErrorCode =
  | "UNEXPECTED_CHARACTER"
  | "UNEXPECTED_TOKEN"
  | "UNEXPECTED_END"
  | "UNTERMINATED_STRING"
  | "UNTERMINATED_REF"
  | "EMPTY_REF"
  | "UNKNOWN_FUNCTION"
  | "ARITY"
  | "NESTED_AGGREGATE"
  | "REF_OUTSIDE_AGGREGATE";

export class FormulaSyntaxError extends Error {
  readonly code: FormulaErrorCode;
  readonly position: number;

  constructor(code: FormulaErrorCode, message: string, position: number) {
    super(`${message} (at ${position})`);
    this.name = "FormulaSyntaxError";
    this.code = code;
    this.position = position;
  }
}

export type Token =
  | { kind: "number"; value: number; position: number }
  | { kind: "string"; value: string; position: number }
  | { kind: "ref"; name: string; position: number }
  /** Function names and keywords, upper-cased. */
  | { kind: "ident"; value: string; position: number }
  | { kind: "op"; value: string; position: number }
  | { kind: "end"; position: number };

const TWO_CHAR_OPS = ["<=", ">=", "<>", "!=", "=="] as const;
const ONE_CHAR_OPS = "+-*/%(),=<>";

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);
const isSpace = (c: string) =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const c = text[i] as string;

    if (isSpace(c)) {
      i += 1;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(text[i + 1] ?? ""))) {
      const start = i;
      while (i < text.length && isDigit(text[i] as string)) i += 1;
      if (text[i] === "." && isDigit(text[i + 1] ?? "")) {
        i += 1;
        while (i < text.length && isDigit(text[i] as string)) i += 1;
      }
      tokens.push({
        kind: "number",
        value: Number(text.slice(start, i)),
        position: start,
      });
      continue;
    }

    if (c === '"' || c === "'") {
      const start = i;
      let value = "";
      i += 1;
      for (;;) {
        if (i >= text.length) {
          throw new FormulaSyntaxError(
            "UNTERMINATED_STRING",
            "Unterminated string",
            start,
          );
        }
        const ch = text[i] as string;
        if (ch === c) {
          // A doubled quote is a literal quote.
          if (text[i + 1] === c) {
            value += c;
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      tokens.push({ kind: "string", value, position: start });
      continue;
    }

    if (c === "{") {
      const start = i;
      const close = text.indexOf("}", i + 1);
      if (close === -1) {
        throw new FormulaSyntaxError(
          "UNTERMINATED_REF",
          "Unterminated column reference",
          start,
        );
      }
      const name = text.slice(i + 1, close).trim();
      if (name === "") {
        throw new FormulaSyntaxError(
          "EMPTY_REF",
          "Empty column reference",
          start,
        );
      }
      tokens.push({ kind: "ref", name, position: start });
      i = close + 1;
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < text.length && isIdentPart(text[i] as string)) i += 1;
      tokens.push({
        kind: "ident",
        value: text.slice(start, i).toUpperCase(),
        position: start,
      });
      continue;
    }

    const pair = text.slice(i, i + 2);
    if ((TWO_CHAR_OPS as readonly string[]).includes(pair)) {
      tokens.push({ kind: "op", value: pair, position: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.includes(c)) {
      tokens.push({ kind: "op", value: c, position: i });
      i += 1;
      continue;
    }

    throw new FormulaSyntaxError(
      "UNEXPECTED_CHARACTER",
      `Unexpected character "${c}"`,
      i,
    );
  }

  tokens.push({ kind: "end", position: text.length });
  return tokens;
}
