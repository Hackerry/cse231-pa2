import { Expr, Stmt, Type } from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;

export function tcExpr(e : Expr, functions : FunctionsEnv, variables : BodyEnv) : Type {
  switch(e.tag) {
    case "number": return "int";
    case "id": return variables.get(e.name);
    case "call":
      if(!functions.has(e.name)) {
        throw new Error(`function ${e.name} not found`);
      }

      const [args, ret] = functions.get(e.name);
      if(args.length !== e.arguments.length) {
        throw new Error(`Expected ${args.length} arguments but got ${e.arguments.length}`);
      }

      args.forEach((a, i) => {
        const argtyp = tcExpr(e.arguments[i], functions, variables);
        if(a !== argtyp) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
      });

      return ret;
  }
}

export function tcStmt(s : Stmt, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) {
  switch(s.tag) {
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables);
      if(variables.has(s.name) && variables.get(s.name) !== rhs) {
        throw new Error(`Cannot assign ${rhs} to ${variables.get(s.name)}`);
      }
      else {
        variables.set(s.name, rhs);
      }
      return;
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.parameters.forEach(p => { bodyvars.set(p.name, p.typ)});
      s.body.forEach(bs => tcStmt(bs, functions, bodyvars, s.ret));
      return;
    }
    case "expr": {
      tcExpr(s.expr, functions, variables);
      return;
    }
    case "return": {
      const valTyp = tcExpr(s.value, functions, variables);
      if(valTyp !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return;
    }
  }
}

export function tcProgram(p : Stmt[]) {
  const functions = new Map<string, [Type[], Type]>();
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.parameters.map(p => p.typ), s.ret]);
    }
  });

  const globals = new Map<string, Type>();
  p.forEach(s => {
    if(s.tag === "assign") {
      globals.set(s.name, tcExpr(s.value, functions, globals));
    }
    else {
      tcStmt(s, functions, globals, "none");
    }
  });
}