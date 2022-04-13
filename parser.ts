import { Tree, TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import { Program, VarDef, TypedVar, Literal, FunDef, Parameter, Stmt, Expr, Type, UnOp, BiOp} from "./ast";

export function parseProgram(source : string) : Program<null> {
  const t = parser.parse(source).cursor();

  // Collect pieces of program
  t.firstChild();
  console.log("Collect var defs...");
  let varDef: Array<VarDef<null>> = collectVarDefs(source, t);
  console.log("Collect fun defs...");
  let funDef: Array<FunDef<null>> = collectFunDefs(source, t);
  console.log("Collect statements...");
  let stmts: Array<Stmt<null>> = traverseStmts(source, t);
  console.log("All var defs:", varDef);
  console.log("All fun defs:", funDef);
  console.log("All statements:", stmts);

  // Restore cursor
  t.parent();

  return { varDef, funDef, stmts };
}

export function collectVarDefs(s: string, t: TreeCursor) : Array<VarDef<null>> {
  let varDefs = [];
  let defsEnd = false;

  // Collect all var defs and check for sequence errors
  do {
    switch(t.type.name) {
      case "AssignStatement":
        t.firstChild();
        t.nextSibling();
        var renameNode = t;
        if(renameNode.type.name == "TypeDef") {
          // Var dec after statements
          if(defsEnd) throwError(`Unexpected variable declaration among statements`);

          t.prevSibling();
          varDefs.push(traverseVarDef(s, t));
        } else {
          // An assignment, ends the declaration chunk
          defsEnd = true;
        }
        t.parent();
        break;
      case "FunctionDefinition":
        break;
      default:
        defsEnd = true;
        break;
    }
  } while(t.nextSibling());

  // Restore cursor
  while(t.prevSibling());

  return varDefs;
}
export function collectFunDefs(s: string, t: TreeCursor) : Array<FunDef<null>> {
  let funDefs = [];
  let defsEnd = false;

  do {
    switch(t.type.name) {
      case "FunctionDefinition":
        if(defsEnd) throwError(`Unexpected function declaration among statements`);
        t.firstChild();                         // Go to "def"
        t.nextSibling();                        // Go to fun name
        let name = s.substring(t.from, t.to);
        t.nextSibling();                        // Go to paramlist
        let params = traverseParams(s, t);
        t.nextSibling();                        // Go to typedef
        var renameNode = t;
        var retType = Type.None;
        if(renameNode.type.name == "TypeDef") {
          // Optional return type
          retType = getType(s, t);
          t.nextSibling();
        }                                       // At body
        console.log("Body is:", s.substring(t.from, t.to));
        t.firstChild();                         // Go to :
        t.nextSibling();                        // Go to 1st body statement
        let varDef = collectVarDefs(s, t);
        t.nextSibling();                        // Skip ":"
        console.log("After var is:", s.substring(t.from, t.to));
        let body = traverseStmts(s, t);

        funDefs.push({name, params, retType, varDef, body});
        t.parent();
        t.parent();
        break;
      case "AssignStatement":
        t.firstChild();
        t.nextSibling();
        var renameNode = t;
        if(renameNode.type.name != "TypeDef") defsEnd = true;
        t.parent();
        break;
      default:
        defsEnd = true;
        break;
    }
  } while(t.nextSibling());

  // Restore cursor
  while(t.prevSibling());

  return funDefs;
}
export function traverseStmts(s: string, t: TreeCursor) : Array<Stmt<null>> {
  let stmts: Array<Stmt<null>> = [];

  do {
    console.log("Stmt:", s.substring(t.from, t.to), "[", t.type.name, "]");
    switch(t.type.name) {
      // Assignments
      case "AssignStatement":
        t.firstChild();
        var name = s.substring(t.from, t.to);
        t.nextSibling();    // Go to "assignOp" or "typeDef"
        var renameNode = t;
        if(renameNode.type.name !== "TypeDef") {
          // Not a var dec
          t.nextSibling();  // Go to expr
          var value = traverseExpr(s, t);
          stmts.push({ tag: "assign", name, value });
        }
        t.parent();
        break;
      // If statements
      case "IfStatement":
        stmts.push(traverseIf(s, t));
        break;
      // While statements
      case "WhileStatement":
        t.firstChild();     // Go to while
        t.nextSibling();    // Go to cond
        var cond = traverseExpr(s, t);
        t.nextSibling();    // Go to body
        t.firstChild();     // Go to ":"
        t.nextSibling();    // Go to first statement
        var body = traverseStmts(s, t);
        t.parent();
        t.parent();
        stmts.push({ tag: "while", cond, body });
        break;
      // Pass statement
      case "PassStatement":
        stmts.push({ tag: "pass" });
        break;
      // Return statement
      case "ReturnStatement":
        t.firstChild();
        t.nextSibling();
        if(s.substring(t.from, t.to) === "") {
          stmts.push({ tag: "return" });
        } else {
          // With return value
          var retExpr = traverseExpr(s, t);
          stmts.push({ tag: "return", retExpr });
        }
        t.parent();
        break;
      // Expressions
      case "ExpressionStatement":
        t.firstChild();
        stmts.push({ tag: "expr", expr: traverseExpr(s, t) });
        t.parent();
        break;
      default:
        break;
    }
  } while(t.nextSibling());

  // Restore cursor
  while(t.prevSibling());

  return stmts;
}

export function traverseExpr(s: string, t: TreeCursor) : Expr<null> {
  console.log("Expr:", s.substring(t.from, t.to), "[", t.type.name, "]");
  switch(t.type.name) {
    // Literals
    case "Number":
    case "Boolean":
    case "None":
      return { tag: "literal", value: traverseLiteral(s, t) };
    // Ids
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) }
    // Unary operations
    case "UnaryExpression":
      t.firstChild();       // Go to +/-/not
      var unaryOp = s.substring(t.from, t.to);
      if(unaryOp !== "-" && unaryOp !== "not")
        throwError(`Unknown unary operator "${unaryOp}"`);

      t.nextSibling();      // Go to value
      var expr = traverseExpr(s, t);
      switch(unaryOp) {
        case "-":
          t.parent();
          return { tag: "unop", op: UnOp.Neg, expr };
        case "not":
          t.parent();
          return { tag: "unop", op: UnOp.Not, expr };
        default:
          t.parent();
          return expr;
      }
    // Binary operations
    case "BinaryExpression":
      t.firstChild();       // Go to left expr
      var left = traverseExpr(s, t);
      t.nextSibling();      // Go to arithOp
      var binaryOp = s.substring(t.from, t.to);
      t.nextSibling();      // Go to right expr
      var right = traverseExpr(s, t);
      t.parent();

      switch(binaryOp) {
        case "+": return { tag: "biop", op: BiOp.Add, left, right }
        case "-": return { tag: "biop", op: BiOp.Sub, left, right }
        case "*": return { tag: "biop", op: BiOp.Mult, left, right }
        case "//": return { tag: "biop", op: BiOp.Div, left, right }
        case "%": return { tag: "biop", op: BiOp.Rem, left, right }
        case "==": return { tag: "biop", op: BiOp.Eq, left, right }
        case "!=": return { tag: "biop", op: BiOp.Ne, left, right }
        case "<=": return { tag: "biop", op: BiOp.Le, left, right }
        case ">=": return { tag: "biop", op: BiOp.Ge, left, right }
        case "<": return { tag: "biop", op: BiOp.Lt, left, right }
        case ">": return { tag: "biop", op: BiOp.Gt, left, right }
        case "is": return { tag: "biop", op: BiOp.Is, left, right }
        default:
          throwError(`Unknown binary operator "${binaryOp}"`);
      }
    // Parenthesized expressions
    case "ParenthesizedExpression":
      t.firstChild();     // Go to "("
      t.nextSibling();    // Go to expr
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "paren", expr }
    // Call expressions
    case "CallExpression":
      t.firstChild();     // Go to name
      var name = s.substring(t.from, t.to);
      t.nextSibling();    // Go to argList
      var args = traverseArgs(s, t);
      t.parent();
      return { tag: "call", name, args }
    default:
      throwError(`Could not parse expr at ${t.from}-${t.to}: ${s.substring(t.from, t.to)}`);
  }
}
export function traverseArgs(s: string, t: TreeCursor) : Array<Expr<null>> {
  var args = [];
  t.firstChild();     // Go to "("

  while(t.nextSibling()) {
    // Empty arg list
    if(s.substring(t.from, t.to) === ")") {
      t.parent();
      return args;
    }
    args.push(traverseExpr(s, t));
    t.nextSibling();  // Go to "," or ")"
  }
  t.parent();
  return args;
}
export function traverseParams(s: string, t: TreeCursor) : Array<Parameter<null>> {
  let params: Array<Parameter<null>> = [];
  t.firstChild();           // Go to "("
  while(t.nextSibling() && s.substring(t.from, t.to) !== ")") {
    // Go to 1st param name or ")"
    let name = s.substring(t.from, t.to);
    if(!t.nextSibling() || t.type.name != "TypeDef")
      throwError(`Expect type annotation for parameter ${name}`);
    let type = getType(s, t);

    // Collect parameters
    params.push({name, type});
    t.nextSibling();        // Go to "," or ")"
  }

  t.parent();

  return params;
}
export function traverseIf(s: string, t: TreeCursor) : Stmt<null> {
  t.firstChild();     // Go to "if"
  if(s.substring(t.from, t.to) !== "if") throwError(`"elif" has no matching "if"`);
  t.nextSibling();    // Go to ifCond
  var ifCond = traverseExpr(s, t);
  t.nextSibling();    // Go to ifBody
  t.firstChild();     // Go to ":"
  t.nextSibling();    // Go to ifStmt
  var ifStmt = traverseStmts(s, t);
  t.parent();

  // If ends
  if(!t.nextSibling()) {
    t.parent();
    return { tag: "if", ifCond, ifStmt };
  }

  var nextBlockName = s.substring(t.from, t.to);
  t.nextSibling();    // Go to elifCond or elseStmt
  if(nextBlockName === "elif") {
    var elifCond = traverseExpr(s, t);
    t.nextSibling();  // Go to elifBody
    t.firstChild();   // Go to ":"
    t.nextSibling();  // Go to elifStmt
    var elifStmt = traverseStmts(s, t);
    t.parent();

    // Elif ends
    if(!t.nextSibling()) {
      t.parent();
      return { tag: "if", ifCond, ifStmt, elseStmt: [{tag: "if", ifCond: elifCond, ifStmt: elifStmt}] };
    }

    t.nextSibling();  // Go to elseBody
    t.firstChild();   // Go to ":"
    t.nextSibling();  // Go to elseStmt
    var elseStmt = traverseStmts(s, t);
    t.parent();
    t.parent();

    // Elif and else
    return { tag: "if", ifCond, ifStmt, elseStmt: [{tag: "if", ifCond: elifCond, ifStmt: elifStmt, elseStmt}] };
  } else {
    // Else only
    t.firstChild();   // Go to ":"
    t.nextSibling();  // Go to elseStmt
    var elseStmt = traverseStmts(s, t);
    t.parent();
    t.parent();
    return { tag: "if", ifCond, ifStmt, elseStmt };
  }
}

export function getType(s:string, t: TreeCursor) : Type {
  t.firstChild();       // Go to :
  t.nextSibling();      // Go to type
  let typeStr = s.substring(t.from, t.to);
  let resultType = Type.None;
  switch(typeStr) {
    case "int":
      resultType = Type.Int;
      break;
    case "bool":
      resultType = Type.Bool;
      break;
    default: throw new Error(`Invalid type annotation; there is no class named: ${typeStr}`);
  }
  t.parent();           // Go to parent
  return resultType;
}
export function traverseLiteral(s: string, t: TreeCursor) : Literal<null> {
  switch(t.type.name) {
    case "Number": return { tag: "num", value: Number(s.substring(t.from, t.to)) };
    case "Boolean":
      if(s.substring(t.from, t.to) === "True") return { tag: "bool", value: true };
      else return { tag: "bool", value: false };
    case "None": return { tag: "none" };
    default: throwError(`Parse error near: ${s.substring(t.from, t.to)}`)
  }
}
export function traverseVarDef(s: string, t: TreeCursor) : VarDef<null> {
  var name = s.substring(t.from, t.to);

  // Typed var decleration
  t.nextSibling();      // Go to TypeDef
  let varTypeLabel = getType(s, t);
  
  t.nextSibling();      // Go to AssignOp

  // Focus on value node
  t.nextSibling();      // Go to value literal
  var literal = traverseLiteral(s, t);

  console.log("Parsed var def:", name, varTypeLabel);
  return { typedVar: {name, type: varTypeLabel}, literal: literal };
}

export function throwError(message: string) {
  throw new Error(`ParseError: ${message}`);
}