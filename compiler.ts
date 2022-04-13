import wabt from 'wabt';
import {Stmt, Expr, Type, VarDef} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';

export async function run(watSource : string) : Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, {});

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function codeGenExpr(expr : Expr<Type>) : Array<string> {
  switch(expr.tag) {
    case "literal":
      let literalVal = expr.value
      // console.log("Code gen literal:", literalVal);
      switch(literalVal.tag) {
        case "num": return [`(i32.const ${literalVal.value})`];
        case "bool": return literalVal.value? [`(i32.const 1)`]: [`(i32.const 0)`];
        case "none": return [`(i32.const -1)`];
        default: return [];   // Do nothing for None
      }
    case "id": return [`(local.get $${expr.name})`];
    case "call":
      const valStmts = expr.args.map(codeGenExpr).flat();
      valStmts.push(`(call $${expr.name})`);
      return valStmts;
  }
}
export function codeGenStmt(stmt : Stmt<Type>) : Array<string> {
  switch(stmt.tag) {
    case "define":
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const stmts = stmt.body.map(codeGenStmt).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr);
      result.push("(local.set $scratch)");
      return result;
  }
}

export function codeGenVarDef(varDef: VarDef<Type>): string {
  var value = -1;
  switch(varDef.literal.tag) {
    case "num":
      value = varDef.literal.value;
      break;
    case "bool":
      value = varDef.literal.value ? 1: 0;
      break;
  }
  console.log("Code gen:", varDef, value);
  return `(global $${varDef.typedVar.name} i32 (i32.const ${value}))`;
}

export function compile(source : string) : string {
  const ast = parseProgram(source);
  let program = tcProgram(ast);

  // Generate global variables for variable declarations
  const vars : Array<string> = [];
  program.varDef.forEach(v => vars.push(codeGenVarDef(v)));

  // Generate functions
  const funs : Array<string> = [];
  program.funDef.forEach(f => {
    // if(stmt.tag === "define") { funs.push(codeGenStmt(stmt).join("\n")); }
  });

  // Putting things together
  const allVarDefs = vars.join("\n");
  const allFuns = funs.join("\n\n");
  const allStmts = "";

  // const allStmts = stmts.map(codeGenStmt).flat();
  // const ourCode = varDecls.concat(allStmts).join("\n");

  const code = `
  (module
    ${allVarDefs}
    ${allFuns}
    (func (export "_start")
      ${allStmts}
    )
  ) 
`
  console.log("Generated code:", code);

  // const lastStmt = ast[ast.length - 1];
  // const isExpr = lastStmt.tag === "expr";
  // var retType = "";
  // var retVal = "";
  // if(isExpr) {
  //   retType = "(result i32)";
  //   retVal = "(local.get $scratch)"
  // }

  return code;
}
