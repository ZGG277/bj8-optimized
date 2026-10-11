// Deterministic static React/CSS review artifact. No WebGL or browser screenshot claims.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]??path.join(root,'artifacts/royal-ui-review'));
await fs.mkdir(out,{recursive:true});
const bundle=path.join(out,'component-render.mjs');
await build({stdin:{contents:`export {default as React} from 'react';export {renderToStaticMarkup} from 'react-dom/server';export {default as Game} from './src/Game';export {setRoyalReviewState} from './src/hooks/useGameState';export {createInitialWorld} from './src/physics';export {createInitialMatchState} from './src/match/match-machine';export {createPlayerSkillProfile,createOpponentProfile} from './src/opponent/model';`,resolveDir:root},bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',outfile:bundle,loader:{'.webp':'dataurl','.glb':'dataurl'},plugins:[{name:'static-game-review-state',setup(b){b.onResolve({filter:/\?worker&inline$/},a=>({path:a.path,namespace:'unused-review-worker'}));b.onLoad({filter:/.*/,namespace:'unused-review-worker'},()=>({loader:'js',contents:'export default class { constructor(){ throw new Error("Static review never executes workers"); } }'}));b.onLoad({filter:/\/hooks\/useGameState\.ts$/},async args=>({loader:'ts',contents:(await fs.readFile(args.path,'utf8')).replace('export function useGameState()', 'function useGameStateReviewBase()').replace('createInitialWorld(Math.random)','createInitialWorld(()=>.5)')+`
let royalFixture={phase:'aiming',winner:null,group:'solid'};
export function setRoyalReviewState(value){royalFixture=value;}
export function useGameState(){const s=useGameStateReviewBase();const match={...s.match,phase:royalFixture.phase,winner:royalFixture.winner,playerGroup:royalFixture.group,breaking:false};s.matchRef.current=match;return {...s,match,canAim:match.phase==='aiming'};}
`}));}}],define:{'process.env.NODE_ENV':'"production"'}});
const {React,renderToStaticMarkup,Game,setRoyalReviewState}=await import(pathToFileURL(bundle));
const css=await build({stdin:{contents:['base','layout','controls','themes/index','onboarding','princess'].map(s=>`@import './src/styles/${s}.css';`).join('\n'),loader:'css',resolveDir:root},bundle:true,write:false});
const h=React.createElement;
const tableImage=process.argv[3]?`data:image/png;base64,${(await fs.readFile(path.resolve(process.argv[3]))).toString('base64')}`:null;
for(const state of ['ruby-play','topaz-play','princess-win','prince-win']){
 setRoyalReviewState({phase:state.endsWith('win')?'finished':'aiming',winner:state==='princess-win'?'player':state==='prince-win'?'opponent':null,group:state==='topaz-play'?'stripe':'solid'});
 const game=renderToStaticMarkup(h(Game));
 const html=`<!doctype html><html lang="zh-CN" data-theme="celadon"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公主请开球 R4 静态组件 · ${state}</title><style>${css.outputFiles[0].text}</style><style>body{height:100vh;background:#dce9e2}.review-label{position:absolute;bottom:0;left:0;right:0;padding:6px;z-index:1000;background:#16372ee8;color:#fff3db;font:10px sans-serif;text-align:center;pointer-events:none}.viewport{${tableImage?`background:center/contain no-repeat url(${tableImage})`:"background:#69bec1"}}</style><div id="root">${game}</div><aside class="review-label">完整Game静态组件＋离线台面 · 非游戏截图 · 无交互/动画</aside></html>`;
 await fs.writeFile(path.join(out,`${state}.html`),html);
}
await fs.writeFile(path.join(out,'README.txt'),'These HTML files use actual production Game React markup (fixture hook sets only phase, group and deterministic rack), bundled CSS and the local illustration. They are static review fixtures, not browser screenshots. No WebGL, interactive handlers or useEffect celebration is executed. Open in a permitted browser to inspect layout. Do not equate these fixtures with phone runtime acceptance.\n');
console.log(JSON.stringify({output:out,states:4,actual_components:true,browser_rendered:false}));
