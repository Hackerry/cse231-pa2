import wabt from 'wabt';
import {Stmt, Expr, Type, VarDef, FunDef, BiOp} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';

export async function run(watSource : string, output?: HTMLElement) : Promise<number> {
  const wabtApi = await wabt();

  var importObject = {
    imports: {
      print_int: (arg : any) => {
        console.log("Int(", arg, ")");
        console.log("output:", output);
        if(output !== undefined) output.textContent += (arg + " ");
        return arg;
      },
      print_bool: (arg: any) => {
        console.log("Bool(", (arg == 1? true: false), ")");
        if(output !== undefined) output.textContent += ((arg == 1? true: false) + " ");
        return arg;
      },
    },
  };

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, importObject);

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

let loopCounter = 0;

export function codeGenExpr(expr : Expr<Type>, varDecEnv: string[]) : Array<string> {
  switch(expr.tag) {
    case "literal":
      let literalVal = expr.value
      console.log("Code gen literal:", literalVal);
      switch(literalVal.tag) {
        case "num": return [`(i32.const ${literalVal.value})`];
        case "bool": return literalVal.value? [`(i32.const 1)`]: [`(i32.const 0)`];
        case "none": return [`(i32.const -1)`];
        default: return [];   // Do nothing for None
      }
    case "id":
      // This is local var
      if(varDecEnv.indexOf(expr.name) > -1) return [`(local.get $${expr.name})`];
      else return [`(global.get $${expr.name})`];
    case "unop":
      var value = codeGenExpr(expr.expr, varDecEnv);
      if(expr.a === Type.Int) return [`(i32.const 0)`].concat(value.concat([`(i32.sub)`]));
      else return [`(i32.const 1)`].concat(value.concat([`(i32.sub)`]));
    case "biop":
      var arg1 = codeGenExpr(expr.left, varDecEnv);
      var arg2 = codeGenExpr(expr.right, varDecEnv);
      var op = codeGenBinOp(expr.op);
      console.log("Bin OP:", [...arg1, ...arg2, op]);
      return [...arg1, ...arg2, op]
    case "paren":
      return codeGenExpr(expr.expr, varDecEnv);
    case "call":
      var args: string[] = [];
      expr.args.forEach(arg => {
        args = args.concat(codeGenExpr(arg, varDecEnv));
      });
      return args.concat([`(call $${expr.name})`]);
  }
}
function codeGenBinOp(op : BiOp) : string {
  switch(op) {
    case "+": return "(i32.add)";
    case "-": return "(i32.sub)";
    case "*": return "(i32.mul)";
    case "//": return "(i32.div_s)";
    case "%": return "(i32.rem_s)";
    case "==": return "(i32.eq)";
    case "!=": return "(i32.ne)";
    case "<=": return "(i32.le_s)";
    case ">=": return "(i32.ge_s)";
    case "<": return "(i32.lt_s)";
    case ">": return "(i32.gt_s)";
    // Is operator
    default: return "(i32.eq)";
  }
}
export function codeGenStmt(stmt : Stmt<Type>, varDecEnv: string[]) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      console.log("assign:", stmt.name, varDecEnv);
      var value = codeGenExpr(stmt.value, varDecEnv);
      if(varDecEnv.indexOf(stmt.name) > -1) return value.concat([`(local.set $${stmt.name})`]);
      else return value.concat([`(global.set $${stmt.name})`]);
    case "return":
      console.log("Return expr:", stmt.retExpr);
      if(stmt.retExpr !== undefined) return codeGenExpr(stmt.retExpr, varDecEnv).concat(["(return)"]);
      else return [`(return)`];
    case "pass":
      return [`nop`];
    case "expr":
      // Store value to $$expr to clean up stack
      var expr = codeGenExpr(stmt.expr, varDecEnv);
      console.log("Code gen expr:", expr, stmt.expr.tag, stmt.expr.a);
      if(stmt.expr.tag !== "call" || stmt.expr.a !== Type.None) return expr.concat([`(local.set $$expr)`]);
      else return expr;
    case "if":
      console.log("If:", stmt);
      // Compute condition
      var cond = codeGenExpr(stmt.ifCond, varDecEnv);
      var ifStmt: Array<string> = [];
      stmt.ifStmt.forEach(s => {
        ifStmt = ifStmt.concat(codeGenStmt(s, varDecEnv));
      });
      if(stmt.elseStmt === undefined) {
        // Just if
        return [`${cond.join("\n")}\n(if\n(then\n${ifStmt.join("\n")}))`];
      } else {
        // With else
        var elseStmt: Array<string> = [];
        stmt.elseStmt.forEach(s => {
          elseStmt = elseStmt.concat(codeGenStmt(s, varDecEnv));
        });
        return [`${cond.join("\n")}\n(if ${stmt.allReturn? "(result i32)": ""}\n(then\n${ifStmt.join("\n")}\n)\n(else\n${elseStmt.join("\n")}))`];
      }
    case "while":
      var cond = codeGenExpr(stmt.cond, varDecEnv);
      var body: Array<string> = [];
      stmt.body.forEach(s => body = body.concat(codeGenStmt(s, varDecEnv)));
      console.log("Body:", stmt.body);
      loopCounter += 1;
      return [`${cond.join("\n")}\n(if\n(then\n(loop $my_loop_${loopCounter}\n${body.join("\n")}\n${cond.join("\n")}\n(br_if $my_loop_${loopCounter}))))`];
  }
}

export function codeGenVarDefs(varDefs: Array<VarDef<Type>>, global: boolean): string[] {
  // Global var defs
  if(global) {
    return varDefs.map(v => {
      var value;
      switch(v.literal.tag) {
        case "num":
          value = v.literal.value;
          break;
        case "bool":
          value = v.literal.value ? 1: 0;
          break;
      }
      return `(global $${v.typedVar.name} (mut i32) (i32.const ${value}))`;
    });
  }

  // Local var defs
  var varDef: string[] = [];
  var varInit: string[] = [];
  varDefs.forEach(v => {
    varDef.push(`(local $${v.typedVar.name} i32)`);

    var value = -1;
    switch(v.literal.tag) {
      case "num":
        value = v.literal.value;
        break;
      case "bool":
        value = v.literal.value ? 1: 0;
        break;
    }
    varInit.push(`(local.set $${v.typedVar.name} (i32.const ${value}))`);
  });
  
  return varDef.concat(varInit);
}
export function codeGenFunDef(funDef: FunDef<Type>): string {
  console.log("Code gen fun:", funDef);
  var name = funDef.name;
  var params = funDef.params.map(p => `(param $${p.name} i32)`);
  var varDefs = ["(local $$expr i32)"].concat(codeGenVarDefs(funDef.varDef, false));
  var varDecEnv = funDef.params.map(p => p.name).concat(funDef.varDef.map(v => v.typedVar.name));
  var body = funDef.body.map(s => codeGenStmt(s, varDecEnv).join("\n"));
  if(funDef.retType === Type.None) return `(func $${name} ${params.join(" ")}\n${varDefs.join("\n")}\n${body.join("\n")})`;
  else return `(func $${name} ${params.join(" ")} (result i32)\n${varDefs.join("\n")}\n${body.join("\n")})`;
}

export function compile(source : string) : string {
  const ast = parseProgram(source);
  let program = tcProgram(ast);

  // Generate global variables for variable declarations
  var vars = codeGenVarDefs(program.varDef, true);

  // Generate functions
  var funs : Array<string> = [];
  program.funDef.forEach(f => funs = funs.concat(codeGenFunDef(f)));

  // Putting things together
  const allVarDefs = vars.join("\n");
  const allFuns = funs.join("\n\n");
  const allStmts = program.stmts.map(s => codeGenStmt(s, []).join("\n")).join("\n");

  const code = `
  (module
    (func $print_int (import "imports" "print_int") (param i32) (result i32))
    (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
    ${allVarDefs}
    ${allFuns}
    (func (export "_start")
      (local $$expr i32)
      ${allStmts}
    )
  ) 
`
  console.log("Generated code:", code);

  return code;
}
