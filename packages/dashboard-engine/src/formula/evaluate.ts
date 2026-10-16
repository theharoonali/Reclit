import type { BinaryOp, Expr } from "./ast";
import { applyAggregate, applyRowFunction } from "./functions";
import {
  compare,
  equals,
  isTruthy,
  type RowScope,
  toNumber,
  type Value,
} from "./values";

/**
 * Evaluates a parsed formula. Two entry points, one walk: a row-level formula
 * reads one `RowScope`; an aggregate formula reads a group of rows, and each
 * aggregate call evaluates its argument once per row before folding.
 */

type Context = { row: RowScope | null; rows: readonly RowScope[] };

export function evaluateRow(ast: Expr, row: RowScope): Value {
  return evaluate(ast, { row, rows: [] });
}

export function evaluateAggregate(ast: Expr, rows: readonly RowScope[]): Value {
  return evaluate(ast, { row: null, rows });
}

function arithmetic(op: BinaryOp, a: Value, b: Value): Value {
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === null || y === null) return null;
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      return y === 0 ? null : x / y;
    case "%":
      return y === 0 ? null : x % y;
    default:
      return null;
  }
}

function comparison(op: BinaryOp, a: Value, b: Value): Value {
  if (op === "=" || op === "<>") {
    const same = equals(a, b);
    return same === null ? null : op === "=" ? same : !same;
  }
  const order = compare(a, b);
  if (order === null) return null;
  switch (op) {
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
    case ">":
      return order > 0;
    case ">=":
      return order >= 0;
    default:
      return null;
  }
}

function evaluate(expr: Expr, ctx: Context): Value {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
      return expr.value;
    case "null":
      return null;
    case "ref":
      return ctx.row ? ctx.row.get(expr.key) : null;
    case "unary": {
      const operand = evaluate(expr.operand, ctx);
      if (expr.op === "NOT") return !isTruthy(operand);
      const n = toNumber(operand);
      return n === null ? null : -n;
    }
    case "binary": {
      const left = evaluate(expr.left, ctx);
      const right = evaluate(expr.right, ctx);
      switch (expr.op) {
        case "AND":
          return isTruthy(left) && isTruthy(right);
        case "OR":
          return isTruthy(left) || isTruthy(right);
        case "+":
        case "-":
        case "*":
        case "/":
        case "%":
          return arithmetic(expr.op, left, right);
        default:
          return comparison(expr.op, left, right);
      }
    }
    case "call":
      return applyRowFunction(
        expr.name,
        expr.args.map((arg) => evaluate(arg, ctx)),
      );
    case "aggregate": {
      const arg = expr.arg;
      const values = arg
        ? ctx.rows.map((row) => evaluate(arg, { row, rows: [] }))
        : null;
      return applyAggregate(expr.name, values, ctx.rows.length);
    }
  }
}
