/**
 * [INPUT]: 正式运行源的TS/TSX语法树、HTML标题和CSS内容。
 * [OUTPUT]: 稳定排序的UI/Canvas文字码点，用于精简字库与缺字审计。
 * [POS]: 本地字体构建输入，不扫描注释/测试，不下载字体。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chars=new Set(Array.from({length:95},(_,i)=>String.fromCodePoint(32+i)));
const add=text=>{for(const c of text)chars.add(c);};
function visitDirectory(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory()){visitDirectory(file);continue;}
    if(/\.(?:test|spec)\./.test(item.name))continue;
    const text=/\.(?:tsx?|css)$/.test(file)?fs.readFileSync(file,'utf8'):'';
    if(/\.tsx?$/.test(file)){
      const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      const visit=node=>{if(ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)||ts.isJsxText(node))add(node.text);ts.forEachChild(node,visit);};visit(source);
    }else if(file.endsWith('.css'))for(const match of text.matchAll(/content\s*:\s*(['"])(.*?)\1/gs))add(match[2]);
  }
}
visitDirectory(path.join(root,'src'));
for(const match of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<title>(.*?)<\/title>/gs))add(match[1]);
process.stdout.write(JSON.stringify([...chars].map(c=>c.codePointAt(0)).filter(n=>n>=32).sort((a,b)=>a-b))+'\n');
