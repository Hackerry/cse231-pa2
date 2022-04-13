import { Tree, TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import { Program, VarDef, TypedVar, Literal, FunDef, Parameter, Stmt, Expr, Type } from "./ast";

export function parseProgram(source : string) : Program<null> {
  const t = parser.parse(source).cursor();

  // Collect pieces of program
  t.firstChild();
  let varDef: Array<VarDef<null>> = collectVarDefs(source, t);
  let funDef: Array<FunDef<null>> = collectFunDefs(source, t);
  let stmts: Array<Stmt<null>> = collectStmts(source, t);
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
    console.log("Check", t);
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
        t.firstChild();                         // Go to :
        t.nextSibling();                        // Go to 1st body statement
        let varDef = collectVarDefs(s, t);
        let body = collectStmts(s, t);

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
export function collectStmts(s: string, t: TreeCursor) : Array<Stmt<null>> {
  let stmts: Array<Stmt<null>> = [];

  do {
    switch(t.type.name) {
      default: break;
    }
  } while(t.nextSibling());

  // Restore cursor
  while(t.prevSibling());

  return stmts;
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
    default: throw new Error(`Invalid type ${typeStr}`);
  }
  t.parent();           // Go to parent
  return resultType;
}
export function traverseLiteral(s: string, t: TreeCursor) : Literal<null> {
  switch(t.type.name) {
    case "Number": return { tag: "num", value: Number(s.substring(t.from, t.to)) };
    case "Boolean": return { tag: "bool", value: Boolean(s.substring(t.from, t.to)) };
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

// export function traverseStmts(s : string, t : TreeCursor) {
//   // The top node in the program is a Script node with a list of children
//   // that are various statements
//   t.firstChild();
//   const stmts = [];
//   do {
//     stmts.push(traverseStmt(s, t));
//   } while(t.nextSibling()); // t.nextSibling() returns false when it reaches
//                             //  the end of the list of children
//   return stmts;
// }

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
// export function traverseStmt(s : string, t : TreeCursor) : Stmt<null> {
//   console.log("Curr statement:", t, t.type.name);
//   switch(t.type.name) {
//     case "AssignStatement":
//       return traverseAssignment(s, t);
//     case "ReturnStatement":
//       t.firstChild();  // Focus return keyword
//       t.nextSibling(); // Focus expression
//       var value = traverseExpr(s, t);
//       t.parent();
//       return { tag: "return", value };
//     case "ExpressionStatement":
//       t.firstChild(); // The child is some kind of expression, the
//                       // ExpressionStatement is just a wrapper with no information
//       var expr = traverseExpr(s, t);
//       t.parent();
//       return { tag: "expr", expr: expr };
//     case "FunctionDefinition":
//       t.firstChild();  // Focus on def
//       t.nextSibling(); // Focus on name of function
//       var name = s.substring(t.from, t.to);
//       t.nextSibling(); // Focus on ParamList
//       var params = traverseParameters(s, t)
//       t.nextSibling(); // Focus on Body or TypeDef
//       let ret : Type = Type.None;
//       let maybeTD = t;
//       if(maybeTD.type.name === "TypeDef") {
//         t.firstChild();
//         ret = traverseType(s, t);
//         t.parent();
//       }
//       t.nextSibling(); // Focus on single statement (for now)
//       t.firstChild();  // Focus on :
//       const body = [];
//       while(t.nextSibling()) {
//         body.push(traverseStmt(s, t));
//       }
//       t.parent();      // Pop to Body
//       t.parent();      // Pop to FunctionDefinition
//       return {
//         tag: "define",
//         name, params, body, ret
//       }
      
//   }
// }

// export function traverseType(s : string, t : TreeCursor) : Type {
//   console.log("Traverse Type:", t, t.type.name);
//   switch(t.type.name) {
//     case "VariableName":
//       const name = s.substring(t.from, t.to);
//       if(name == "int") {
//         throw new Error("Unknown type: " + name);
//       }

//       // TODO
//       return Type.None;
//     default:
//       throw new Error("Unknown type: " + t.type.name);

//   }
// }

// export function traverseParameters(s : string, t : TreeCursor) : Array<Parameter<null>> {
//   console.log("Traverse Param:", t);
//   t.firstChild();  // Focuses on open paren
//   const parameters = []
//   t.nextSibling(); // Focuses on a VariableName
//   while(t.type.name !== ")") {
//     let name = s.substring(t.from, t.to);
//     t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
//     let nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
//     if(nextTagName !== "TypeDef") { throw new Error("Missed type annotation for parameter " + name)};
//     t.firstChild();  // Enter TypeDef
//     t.nextSibling(); // Focuses on type itself
//     let typ = traverseType(s, t);
//     t.parent();
//     t.nextSibling(); // Move on to comma or ")"
//     parameters.push({name, typ});
//     t.nextSibling(); // Focuses on a VariableName
//   }
//   t.parent();       // Pop to ParamList
//   return parameters;
// }

// export function traverseExpr(s : string, t : TreeCursor) : Expr<null> {
//   console.log("Traverse Expr:", t, t.type.name);
//   switch(t.type.name) {
//     // Id expressions
//     case "AssignOp":
//       console.log(t.nextSibling());
//       console.log(t.firstChild());
//       console.log(t.nextSibling());
//       t.parent();
//     case "VariableName":
//       return { tag: "id", name: s.substring(t.from, t.to) };
//     case "CallExpression":
//       t.firstChild(); // Focus name
//       var name = s.substring(t.from, t.to);
//       t.nextSibling(); // Focus ArgList
//       t.firstChild(); // Focus open paren
//       var args = traverseArguments(t, s);
//       var result : Expr<null> = { tag: "call", name, args};
//       t.parent();
//       return result;
//   }
// }

// export function traverseArguments(c : TreeCursor, s : string) : Expr<null>[] {
//   console.log("Traverse Arg:", c);
//   c.firstChild();    // Focuses on open paren
//   const args = [];
//   c.nextSibling();
//   while(c.type.name !== ")") {
//     let expr = traverseExpr(s, c);
//     args.push(expr);
//     c.nextSibling(); // Focuses on either "," or ")"
//     c.nextSibling(); // Focuses on a VariableName
//   } 
//   c.parent();        // Pop to ArgList
//   return args;
// }

export function throwError(message: string) {
  throw new Error(`ParseError: ${message}`);
}