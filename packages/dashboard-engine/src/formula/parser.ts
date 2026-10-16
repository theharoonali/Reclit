import { normalizeName } from "../sheet";
import type { BinaryOp, Expr } from "./ast";
import {
  AGGREGATE_FUNCTIONS,
  isAggregateFunction,
  isRowFunction,
  ROW_FUNCTIONS,
} from "./functions";
import { FormulaSyntaxError, type Token, tokenize } from "./tokens";

/**
 * Recursive descent over the token stream. Precedence, low to high:
 * `OR` → `AND` → `NOT` → comparison → `+ -` → `* / %` → unary `-` → primary.
 *
 * Besides the tree, parsing settles two facts the validator and the runner
 * need: which columns the formula reads, and whether it aggregates. An
 * aggregate formula may not read a column outside an aggregate call —
 * `SUM({A}) / {B}` has no meaning over a group — and aggregates do not nest.
 */

export type ParsedFormula = {
  ast: Expr;
  /** Distinct, as written, in order of first use. */
  columns: string[];
  isAggregate: boolean;
};

const COMPARISON: Record<string, BinaryOp> = {
  "=": "=",
  "==": "=",
  "<>": "<>",
  "!=": "<>",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
};

class Parser {
  private pos = 0;
  private aggregateDepth = 0;
  private hasAggregate = false;
  private refOutsideAggregate: number | null = null;
  private readonly columns = new Map<string, string>();

  constructor(private readonly tokens: Token[]) {}

  parse(): ParsedFormula {
    const ast = this.parseOr();
    const last = this.peek();
    if (last.kind !== "end") {
      throw new FormulaSyntaxError(
        "UNEXPECTED_TOKEN",
        `Unexpected ${describe(last)}`,
        last.position,
      );
    }
    if (this.hasAggregate && this.refOutsideAggregate !== null) {
      throw new FormulaSyntaxError(
        "REF_OUTSIDE_AGGREGATE",
        "A column reference must be inside an aggregate function here",
        this.refOutsideAggregate,
      );
    }
    return {
      ast,
      columns: [...this.columns.values()],
      isAggregate: this.hasAggregate,
    };
  }

  private peek(): Token {
    return this.tokens[this.pos] as Token;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== "end") this.pos += 1;
    return token;
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token.kind === "op" && token.value === value;
  }

  private isKeyword(value: string): boolean {
    const token = this.peek();
    return token.kind === "ident" && token.value === value;
  }

  private expectOp(value: string): void {
    const token = this.peek();
    if (token.kind === "op" && token.value === value) {
      this.pos += 1;
      return;
    }
    throw token.kind === "end"
      ? new FormulaSyntaxError(
          "UNEXPECTED_END",
          `Expected "${value}"`,
          token.position,
        )
      : new FormulaSyntaxError(
          "UNEXPECTED_TOKEN",
          `Expected "${value}" but found ${describe(token)}`,
          token.position,
        );
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKeyword("OR")) {
      this.next();
      left = { kind: "binary", op: "OR", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isKeyword("AND")) {
      this.next();
      left = { kind: "binary", op: "AND", left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKeyword("NOT")) {
      this.next();
      return { kind: "unary", op: "NOT", operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parseAdditive();
    const token = this.peek();
    if (token.kind === "op" && COMPARISON[token.value]) {
      this.next();
      const op = COMPARISON[token.value] as BinaryOp;
      return { kind: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.next() as { value: string }).value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.next() as { value: string }).value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp("-")) {
      this.next();
      return { kind: "unary", op: "-", operand: this.parseUnary() };
    }
    if (this.isOp("+")) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.next();
    switch (token.kind) {
      case "number":
        return { kind: "number", value: token.value };
      case "string":
        return { kind: "string", value: token.value };
      case "ref": {
        const key = normalizeName(token.name);
        if (!this.columns.has(key)) this.columns.set(key, token.name);
        if (this.aggregateDepth === 0 && this.refOutsideAggregate === null) {
          this.refOutsideAggregate = token.position;
        }
        return { kind: "ref", name: token.name, key };
      }
      case "ident":
        return this.parseIdent(token);
      case "op":
        if (token.value === "(") {
          const inner = this.parseOr();
          this.expectOp(")");
          return inner;
        }
        throw new FormulaSyntaxError(
          "UNEXPECTED_TOKEN",
          `Unexpected "${token.value}"`,
          token.position,
        );
      case "end":
        throw new FormulaSyntaxError(
          "UNEXPECTED_END",
          "Unexpected end of formula",
          token.position,
        );
    }
  }

  private parseIdent(token: Token & { kind: "ident" }): Expr {
    switch (token.value) {
      case "TRUE":
        return { kind: "boolean", value: true };
      case "FALSE":
        return { kind: "boolean", value: false };
      case "NULL":
        return { kind: "null" };
    }
    if (!this.isOp("(")) {
      throw new FormulaSyntaxError(
        "UNEXPECTED_TOKEN",
        `Unexpected "${token.value}" — column names go in braces: {${token.value}}`,
        token.position,
      );
    }
    const name = token.value;
    if (isAggregateFunction(name)) {
      if (this.aggregateDepth > 0) {
        throw new FormulaSyntaxError(
          "NESTED_AGGREGATE",
          `${name} cannot be nested inside another aggregate`,
          token.position,
        );
      }
      this.hasAggregate = true;
      this.aggregateDepth += 1;
      const args = this.parseArgs(name, AGGREGATE_FUNCTIONS[name], token);
      this.aggregateDepth -= 1;
      return { kind: "aggregate", name, arg: args[0] ?? null };
    }
    if (isRowFunction(name)) {
      const args = this.parseArgs(name, ROW_FUNCTIONS[name], token);
      return { kind: "call", name, args };
    }
    throw new FormulaSyntaxError(
      "UNKNOWN_FUNCTION",
      `Unknown function ${name}`,
      token.position,
    );
  }

  private parseArgs(
    name: string,
    arity: { min: number; max: number },
    at: Token,
  ): Expr[] {
    this.expectOp("(");
    const args: Expr[] = [];
    if (!this.isOp(")")) {
      args.push(this.parseOr());
      while (this.isOp(",")) {
        this.next();
        args.push(this.parseOr());
      }
    }
    this.expectOp(")");
    if (args.length < arity.min || args.length > arity.max) {
      const expected =
        arity.min === arity.max
          ? `${arity.min}`
          : arity.max === Number.POSITIVE_INFINITY
            ? `at least ${arity.min}`
            : `${arity.min} to ${arity.max}`;
      throw new FormulaSyntaxError(
        "ARITY",
        `${name} takes ${expected} argument(s), got ${args.length}`,
        at.position,
      );
    }
    return args;
  }
}

function describe(token: Token): string {
  switch (token.kind) {
    case "number":
      return `number ${token.value}`;
    case "string":
      return `string "${token.value}"`;
    case "ref":
      return `column {${token.name}}`;
    case "ident":
      return `"${token.value}"`;
    case "op":
      return `"${token.value}"`;
    case "end":
      return "end of formula";
  }
}

/** Parses a formula; throws `FormulaSyntaxError` with the offending position. */
export function parseFormula(text: string): ParsedFormula {
  return new Parser(tokenize(text)).parse();
}

export function tryParseFormula(
  text: string,
):
  | { ok: true; formula: ParsedFormula }
  | { ok: false; error: FormulaSyntaxError } {
  try {
    return { ok: true, formula: parseFormula(text) };
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return { ok: false, error };
    throw error;
  }
}
