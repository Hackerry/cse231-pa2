export type Program<A> = { a?: A, varDef: Array<VarDef<A>>, funDef: Array<FunDef<A>>, stmts: Array<Stmt<A>> }

export type VarDef<A> = { a?: A, typedVar: TypedVar<A>, literal: Literal<A> }
export type TypedVar<A> = { a?: A, name: string, type: Type }
export type Literal<A> = 
  | { a?: A, tag: "num", value: number }
  | { a?: A, tag: "bool", value: boolean }
  | { a?: A, tag: "none" }

export type FunDef<A> = { a?: A, name: string, params: Array<Parameter<A>>, retType: Type, varDef: Array<VarDef<A>>, body: Array<Stmt<A>> }

export type Parameter<A> =
  | { a?: A, name: string, type: Type }

export type Stmt<A> =
  | { a?: A, tag: "assign", name: string, value: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "define", name: string, params: Array<Parameter<A>>, ret: Type, body: Array<Stmt<A>> }
  | { a?: A, tag: "return", value: Expr<A> }

// export type Stmt<A> =
//   | { a?: A, tag: "if", cond: Expr<A>, ifExpr: Expr<A>, elif?: Expr<A>, elifExpr?: Expr<A>, else?: Expr<A>, elseExpr: Expr<A> }
//   | { a?: A, tag: "while", cond: Expr<A>, body: Expr<A> }
//   | { a?: A, tag: "pass" }
//   | { a?: A, tag: "assign", name: string, value: Expr<A> }
//   | { a?: A, tag: "return", retExpr: Expr<A> }
//   | { a?: A, tag: "expr", expr: Expr<A> }

export type Expr<A> = 
  | { a?: A, tag: "literal", value: Literal<A> }
  | { a?: A, tag: "id", name: string }
  | { a?: A, tag: "unop", expr: Expr<A> }
  | { a?: A, tag: "biop", left: Expr<A>, right: Expr<A> }
  | { a?: A, tag: "paren", expr: Expr<A> }
  | { a?: A, tag: "call", name: string, args: Array<Expr<A>> }

export enum UnOp { Not = "not", Neg = "-" }
export enum BiOp { Add = "+", Sub = "-", Mult = "*", Div = "//", Rem = "%", Eq = "==", Ne = "!=", Le = "<=", Ge = ">=", Lt = "<", Gt = ">", Is = "is" }

export enum Type { Int="int", Bool="boolean", None="none" }