import type { AggregateName, RowFunctionName } from "./functions";

/** A parsed formula. `ref.key` is the column's normalised name, resolved once. */
export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "ref"; name: string; key: string }
  | { kind: "unary"; op: "-" | "NOT"; operand: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "call"; name: RowFunctionName; args: Expr[] }
  /** `arg` is null only for `COUNT()`. */
  | { kind: "aggregate"; name: AggregateName; arg: Expr | null };

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "AND"
  | "OR";
