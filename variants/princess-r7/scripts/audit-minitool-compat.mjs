/** AST and resource gates complement (not replace) official size audit and client tests. */
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2];
if (!root) throw Error('Usage: node scripts/audit-minitool-compat.mjs <dist>');
const errors=[], base64=[];
async function scan(dir) {
  for(const item of await readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()) { await scan(file); continue; }
    if(!/\.(js|css|html|json)$/.test(file)) continue;
    const text=await readFile(file,'utf8');
    for(const match of text.matchAll(/data:[^\s"'`;,]+(?:;[^,]*)?;base64,([A-Za-z0-9+/=]{20,})/g)) {
      const bytes=Buffer.from(match[1],'base64').length;
      base64.push({file:path.relative(root,file),decodedBytes:bytes});
      if(bytes>1048576) errors.push(`${file}: Base64 exceeds 1 MiB`);
    }
    if(!file.endsWith('.js')) continue;
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.ES2017,true);
    if(source.parseDiagnostics.length) errors.push(`${file}: JS parse errors`);
    function visit(node) {
      if(node.questionDotToken || ts.isSpreadAssignment(node) || ts.isPrivateIdentifier(node) || ts.isBigIntLiteral(node)
        || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
        || (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.QuestionQuestionEqualsToken,ts.SyntaxKind.AmpersandAmpersandEqualsToken,ts.SyntaxKind.BarBarEqualsToken].includes(node.operatorToken.kind))) errors.push(`${file}: unsupported JS syntax ${ts.SyntaxKind[node.kind]}`);
      if(ts.isRegularExpressionLiteral(node) && /\(\?<([=!])|\\[pP]\{/.test(node.text)) errors.push(`${file}: modern regex`);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
await scan(root);
console.log(JSON.stringify({pass:errors.length===0,errors,base64,limitations:['Static syntax/resource checks only; Chrome 61 and native clients untested.']},null,2));
if(errors.length) process.exitCode=1;
