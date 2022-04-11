
export type Type =
  | "int"
  | "none"

export type Parameter =
  | { name: string, typ: Type }

export type Stmt =
  | { tag: "assign", name: string, value: Expr }
  | { tag: "expr", expr: Expr }
  | { tag: "define", name: string, parameters: Array<Parameter>, ret: Type, body: Array<Stmt> }
  | { tag: "return", value: Expr }

export type Expr = 
  | { tag: "number", value: number }
  | { tag: "id", name: string }
  | { tag: "call", name: string, arguments: Array<Expr> }



