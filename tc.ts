import { Program, VarDef, TypedVar, Literal, FunDef, Parameter, Stmt, Expr, Type } from "./ast";

type FunEnv = Map<string, FunDef<Type>>;
type BodyEnv = Map<string, Type>;

export function tcExpr(e : Expr<null>, functions : FunEnv, variables : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "literal":
      switch(e.value.tag) {
        case "num": return {...e, a: Type.Int};
        case "bool": return {...e, a: Type.Bool};
        case "none": return {...e, a: Type.None};
        default: throw new Error(`TypeError: unrecognized literal type ${e.value}`)
      }
    case "id": return {...e, a: variables.get(e.name)};
  //   case "call":
  //     if(!functions.has(e.name)) {
  //       throw new Error(`function ${e.name} not found`);
  //     }

  //     const [args, ret] = functions.get(e.name);
  //     if(args.length !== e.args.length) {
  //       throw new Error(`Expected ${args.length} arguments but got ${e.args.length}`);
  //     }

  //     args.forEach((a, i) => {
  //       const argtyp = tcExpr(e.args[i], functions, variables);
  //       if(a !== argtyp) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
  //     });

  //     return ret;
  }
}

export function tcStmt(s : Stmt<null>, funEnvs : FunEnv, bodyEnvs : BodyEnv, currentReturn : Type) : Stmt<Type> {
  switch(s.tag) {
    case "assign": {
      const rhs = tcExpr(s.value, funEnvs, bodyEnvs);
      
      if(bodyEnvs.has(s.name) && bodyEnvs.get(s.name) !== rhs.a) {
          // Mismatch assignment
          throwError(`Cannot assign ${rhs} to ${bodyEnvs.get(s.name)}`);
      }
      return {...s, a: rhs.a};
    }
    case "expr": return {...s, a: tcExpr(s.expr, funEnvs, bodyEnvs).a};
    // case "define": {
    //   const bodyvars = new Map<string, Type>(variables.entries());
    //   s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
    //   s.body.forEach(bs => tcStmt(bs, functions, bodyvars, s.ret));
    //   return;
    // }
    // case "return": {
    //   const valTyp = tcExpr(s.value, functions, variables);
    //   if(valTyp !== currentReturn) {
    //     throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
    //   }
    //   return;
    // }
  }
}

export function tcLiteral(l: Literal<null>) : Literal<Type> {
  switch(l.tag) {
    case "num": return {...l, a: Type.Int};
    case "bool": return {...l, a: Type.Bool};
    case "none": return {...l, a: Type.None};
  }
}
export function tcTypedVar(t: TypedVar<null>) : TypedVar<Type> {
  return {...t, a: t.type};
}
export function tcVarDefs(d: Array<VarDef<null>>) : Array<VarDef<Type>> {
  return d.map(def => {
    let literal = tcLiteral(def.literal);
    let typedVar = tcTypedVar(def.typedVar);

    // Check literal matches labeled type
    if(typedVar.a !== literal.a)
      throwError(`Expected \`${typedVar.a}\`; but got \`${literal.a}\``);
    else
      // Assignment has none type
      return {typedVar, literal, a: Type.None};
  });
}

export function tcParameter(p: Parameter<null>) : Parameter<Type> {
  return {...p, a: p.type};
}
export function tcParameters(p: Array<Parameter<null>>) : Array<Parameter<Type>> {
  return p.map(param => {
    return {...param, a: tcParameter(param).a};
  });
}
export function tcFunDef(f: FunDef<null>) : FunDef<Type> {
  // TODO
  return f;
}

export function tcProgram(p : Program<null>) : Program<Type> {
  // Collect all function names in env
  const functions = new Map<string, FunDef<Type>>();
  p.funDef.forEach(f => {
    let funDef:FunDef<Type> = {name: f.name, params: tcParameters(f.params), retType: f.retType, varDef: f.varDef, body: f.body }
    functions.set(funDef.name, funDef);
  });

  // Type check body of functions and return type
  let funDefs = p.funDef.map(tcFunDef);

  // Collect all global definitions
  let varDefs = tcVarDefs(p.varDef);
  console.log("New var defs:", varDefs);
  const globals = new Map<string, Type>();
  varDefs.forEach(v => {
    // Collect all global vars from declarations
    globals.set(v.typedVar.name, v.typedVar.a);
  });

  // Type check statements
  let stmts = p.stmts.map(s => {
    return tcStmt(s, functions, globals, Type.None);
  });

  return {varDef: varDefs, funDef: funDefs, stmts};
}

export function throwError(message: string) {
  throw new Error(`TypeError: ${message}`);
}