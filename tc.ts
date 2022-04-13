import { Program, VarDef, TypedVar, Literal, FunDef, Parameter, Stmt, Expr, Type, UnOp, BiOp } from "./ast";

type FunEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;
type RetValue = { returned: boolean, returnType?: Type }

export function tcExpr(e : Expr<null>, funEnv : FunEnv, varEnv : BodyEnv, varDecEnv : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "literal":
      switch(e.value.tag) {
        case "num": return {...e, a: Type.Int};
        case "bool": return {...e, a: Type.Bool};
        case "none": return {...e, a: Type.None};
        default: throw new Error(`TypeError: unrecognized literal type ${e.value}`)
      }
    case "id":
      // Check variable is accessible in this scope
      if(!varEnv.has(e.name) && !varDecEnv.has(e.name)) {
        throwError(`Not a variable: ${e.name}`);
      }
      if(varDecEnv.has(e.name)) {
        console.log("Decl type:", varDecEnv.get(e.name));
        // Prioritize vars declared in this scope
        return {...e, a: varDecEnv.get(e.name)};
      } else {
        // Then read-only vars from parent scope
        return {...e, a: varEnv.get(e.name)};
      }
    case "unop":
      switch(e.op) {
        // Not
        case UnOp.Not:
          // Check value is bool
          var expr = tcExpr(e.expr, funEnv, varEnv, varDecEnv);
          if(expr.a !== Type.Bool) throwError(`Cannot apply operator "${e.op}" on type "${expr.a}" `);
          return { tag: 'unop', op: e.op, expr, a: Type.Bool };
        // Negation
        default:
          // Check value is int
          var expr = tcExpr(e.expr, funEnv, varEnv, varDecEnv);
          if(expr.a !== Type.Int) throwError(`Cannot apply operator "${e.op}" on type "${expr.a}" `);
          return { tag: 'unop', op: e.op, expr, a: Type.Int };
      }
    case "biop":
      var left = tcExpr(e.left, funEnv, varEnv, varDecEnv);
      var right = tcExpr(e.right, funEnv, varEnv, varDecEnv);
      if(e.op === BiOp.Add || e.op === BiOp.Sub || e.op === BiOp.Mult || e.op === BiOp.Div || e.op === BiOp.Rem) {
        // Check both operands are numbers
        if(left.a !== Type.Int || right.a !== Type.Int)
          throwError(`Cannot apply "${e.op}" on types "${left.a}" and "${right.a}"`);
        return { tag: "biop", op: e.op, left, right, a: Type.Int };
      } else if(e.op === BiOp.Le || e.op === BiOp.Ge || e.op === BiOp.Lt || e.op === BiOp.Gt) {
        // Check both operands are numbers
        if(left.a !== Type.Int || right.a !== Type.Int)
          throwError(`Cannot apply "${e.op}" on types "${left.a}" and "${right.a}"`);
        return { tag: "biop", op: e.op, left, right, a: Type.Bool };
      } else if(e.op === BiOp.Eq || e.op === BiOp.Ne) {
        // Check both operands are of same type
        if(left.a !== right.a || left.a == Type.None)
          throwError(`Cannot apply "${e.op}" on types "${left.a}" and "${right.a}"`);
      } else {
        // Check both operands are none
        if(left.a !== Type.None || right.a !== Type.None)
          throwError(`Cannot apply "${e.op}" on types "${left.a}" and "${right.a}"`);
        return { tag: "biop", op: e.op, left, right, a: Type.Bool };
      }
    case "paren":
      var expr = tcExpr(e, funEnv, varEnv, varDecEnv);
      return { ...expr, a: expr.a };
    case "call":
      // Check function in funEnv
      if(!funEnv.has(e.name)) throwError(`Not a function: ${e.name}`);
      
      // Check parameter length and types
      var funDef = funEnv.get(e.name);
      var args = [];
      if(e.args.length !== funDef[0].length) throwError(`Expected ${funDef[0].length} arguments; got ${e.args.length}`);
      for(var i = 0; i < e.args.length; i++) {
        var typedArg = tcExpr(e.args[i], funEnv, varEnv, varDecEnv);
        if(typedArg.a !== funDef[0][i]) throwError(`Expected type "${funDef[0][i]}"; got type "${typedArg.a}" in parameter ${i}`);

        args.push(typedArg);
      }
      
      return { tag: "call", name: e.name, args, a: funDef[1] };
  }
}

export function tcStmt(s: Stmt<null>, funEnv: FunEnv, varEnv: BodyEnv, varDecEnv: BodyEnv, expectReturnType: Type) : [Stmt<Type>, RetValue] {
  switch(s.tag) {
    case "assign": {
      if(!varDecEnv.has(s.name) && !varEnv.has(s.name)) throwError(`Not a variable: ${s.name}`);
      else if(varEnv.has(s.name)) throwError(`Cannot assign to variable that is not explicitly declared in this scope: ${s.name}`);

      var value = tcExpr(s.value, funEnv, varEnv, varDecEnv);
      var expectedType = varDecEnv.get(s.name);
      if(value.a !== expectedType) throwError(`Expected type "${expectedType}; got ${value.a}"`);

      return [{ tag: "assign", name: s.name, value, a: expectedType }, {returned: false}];
    }
    case "expr":
      var expr = tcExpr(s.expr, funEnv, varEnv, varDecEnv);
      return [{ tag: "expr", expr }, {returned: false}]
    case "pass":
      return [{ ...s, a: Type.None }, {returned: false}];
    case "return":
      if(s.retExpr !== undefined) {
        var retExpr = tcExpr(s.retExpr, funEnv, varEnv, varDecEnv);
        if(retExpr.a !== expectReturnType) throwError(`Expected type "${expectReturnType}"; got type "${retExpr.a}"`);

        return [{ tag: "return", retExpr, a: retExpr.a }, {returned: true, returnType: retExpr.a}];
      } else {
        if(expectReturnType !== Type.None) throwError(`Expected type "${expectReturnType}"; got type "${Type.None}"`);
        return [{ tag: "return", retExpr, a: Type.None }, {returned: true, returnType: Type.None}];
      }
    case "while":
      var cond = tcExpr(s.cond, funEnv, varEnv, varDecEnv);
      if(cond.a !== Type.Bool) throwError(`Condition expression cannot be of type "${cond.a}"`);

      var [body, retValue] = tcBlock(s.body, funEnv, varEnv, varDecEnv, expectReturnType);
      return [{ tag: "while", cond, body, a: Type.None }, retValue];
    case "if":
      // Check condition
      var ifCond = tcExpr(s.ifCond, funEnv, varEnv, varDecEnv);
      if(ifCond.a !== Type.Bool) throwError(`Condition expression cannot be of type "${ifCond.a}"`);

      var [ifStmt, retValue] = tcBlock(s.ifStmt, funEnv, varEnv, varDecEnv, expectReturnType);

      // If block returned expected type, check other blocks
      var curRetValue = {returned: false, returnType: Type.None};
      if(retValue.returned) curRetValue = {...retValue, returnType: retValue.returnType};

      // Check potential elif
      if(s.elifCond !== undefined) {
        var elifCond = tcExpr(s.elifCond, funEnv, varEnv, varDecEnv);
        if(elifCond.a !== Type.Bool) throwError(`Condition expression cannot be of type "${elifCond.a}"`);

        // Check elif block
        var [elifStmt, retValue] = tcBlock(s.elifStmt, funEnv, varEnv, varDecEnv, expectReturnType);

        // Elif branch doesn't return anything, reset return type to none
        if(!retValue.returned) curRetValue.returned = false;

        // Check potential else
        if(s.elseStmt !== undefined) {
          var [elseStmt, retValue] = tcBlock(s.elseStmt, funEnv, varEnv, varDecEnv, expectReturnType);
          // Else branch doesn't return anything, reset return type to none
          if(!retValue.returned) curRetValue.returned = false;

          return [{ tag: "if", ifCond, ifStmt, elifCond, elifStmt, elseStmt, a: Type.None }, curRetValue];
        }
        
        return [{ tag: "if", ifCond, ifStmt, elifCond, elifStmt, a: Type.None}, curRetValue];
      }

      // Check potential else
      if(s.elseStmt !== undefined) {
        var [elseStmt, retValue] = tcBlock(s.elseStmt, funEnv, varEnv, varDecEnv, expectReturnType);
        // Else branch doesn't return anything, reset return type to none
        if(!retValue.returned) curRetValue.returned = false;

        return [{ tag: "if", ifCond, ifStmt, elseStmt, a: Type.None }, curRetValue];
      }
      
      // Just if
      return [{ tag: "if", ifCond, ifStmt, a: Type.None}, curRetValue];
  }
}

export function tcBlock(stmts: Array<Stmt<null>>, funEnv: FunEnv, varEnv: BodyEnv, varDecEnv: BodyEnv, expectReturnType: Type) : [Array<Stmt<Type>>, RetValue] {
  // Check statements
  var typedStmts = [];
  var blockRetType = undefined;
  for(var i = 0; i < stmts.length; i++) {
    var stmt = stmts[i];
    var [typedStmt, retValue] = tcStmt(stmt, funEnv, varEnv, varDecEnv, expectReturnType);

    typedStmts.push(typedStmt);

    if(retValue.returned) {
      // Register if branch return value
      if(blockRetType === undefined) blockRetType = retValue.returnType;

      // Dead code at the end
      if(i < stmts.length-1) throwError("Unreachable code after return");
    }
  }

  if(blockRetType !== undefined) return [typedStmts, {returned: true, returnType: blockRetType}];
  else return [typedStmts, {returned: false}];
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

export function tcFunDef(f: FunDef<null>, funEnv: FunEnv, globalEnv: BodyEnv, varEnv: BodyEnv) : FunDef<Type> {
  // Type annotate parameters
  var typedParams = f.params.map(param => {
    return {...param, a: param.type};
  });

  // Add all parameters to varEnv
  typedParams.forEach(param => {
    if(varEnv.has(param.name)) throwError(`Duplicate declaration of identifier in same scope: ${param.name}`);
    varEnv.set(param.name, param.a);
  });

  // Type check all var decs
  var typedVarDec = tcVarDefs(f.varDef);

  // Add all var dec to varEnv
  typedVarDec.forEach(varDef => {
    if(varEnv.has(varDef.typedVar.name)) throwError(`Duplicate declaration of identifier in same scope: ${varDef.typedVar.name}`);
    varEnv.set(varDef.typedVar.name, varDef.typedVar.a);
  });

  // Type check statements
  var [stmts, retValue] = tcBlock(f.body, funEnv, globalEnv, varEnv, f.retType);
  if(!retValue.returned && f.retType !== Type.None) throwError(`Expected \`${f.retType}\`; but got \`${Type.None}}\``);
  else if(retValue.returned && retValue.returnType !== f.retType) throwError(`Expected \`${f.retType}\`; but got \`${retValue.returnType}}\``);

  return { ...f, params: typedParams, varDef: typedVarDec, body: stmts, a: f.retType};
}

export function tcProgram(p : Program<null>) : Program<Type> {
  // Collect all var dec
  let varDefs = tcVarDefs(p.varDef);
  var globals = new Map<string, Type>();
  varDefs.forEach(v => {
    // Collect all global vars from declarations
    globals.set(v.typedVar.name, v.typedVar.a);
  });

  var functions = new Map<string, [Type[], Type]>();
  // Add FunDef stubs for external print to funEnv
  functions.set("print_int", [[Type.Int], Type.None]);
  functions.set("print_bool", [[Type.Bool], Type.None]);

  // Collect all function names in env to allow recursive calls
  p.funDef.forEach(f => {
    var paramTypes = f.params.map(p => p.type);
    functions.set(f.name, [paramTypes, f.retType]);
  });

  // Type check body of functions
  let funDefs = p.funDef.map(f => {
    // Construct typed FunDef to check body
    var varEnv = new Map<string, Type>();
    return tcFunDef(f, functions, globals, varEnv);
  });

  // Type check statements
  let stmts = p.stmts.map(s => {
    var emptyEnv = new Map<string, Type>();
    var [stmt, retVal] = tcStmt(s, functions, emptyEnv, globals, Type.None);
    if(retVal.returned) throwError(`Return statement cannot appear at the top level`);
    return stmt;
  });

  return {varDef: varDefs, funDef: funDefs, stmts};
}

export function throwError(message: string) {
  throw new Error(`TypeError: ${message}`);
}