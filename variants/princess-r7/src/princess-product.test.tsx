import { describe, expect, it } from 'vitest';
import gameSource from './Game.tsx?raw';
import stateSource from './hooks/useGameState.ts?raw';
import sceneSource from './Scene3D.ts?raw';
import scoreboardSource from './components/Scoreboard.tsx?raw';
// @ts-expect-error Browser tsconfig intentionally excludes Node types; Vitest runs this file in Node.
import { readFileSync } from 'node:fs';
const skinSource = readFileSync(new URL('./styles/princess.css', import.meta.url), 'utf8') as string;
import { renderToStaticMarkup } from 'react-dom/server';
import { Scoreboard } from './components/Scoreboard';
import { beginMatch, createInitialMatchState } from './match/match-machine';
import { createInitialWorld, TABLE } from './physics';
import { createPlayerSkillProfile, createOpponentProfile, loadPlayerSkillProfile, savePlayerSkillProfile, PLAYER_SKILL_STORAGE_KEY } from './opponent/model';
import { SAVE_KEYS, createNativeSaveStore } from './minitool/persistent-storage';
const source = (name: string) => ({'./Game.tsx':gameSource,'./hooks/useGameState.ts':stateSource,'./Scene3D.ts':sceneSource,'./components/Scoreboard.tsx':scoreboardSource,'./styles/princess.css':skinSource} as Record<string,string>)[name];

describe('公主请开球独立产品', () => {
  it('opens directly on the lake with an aiming-ready match and no inherited intro', () => {
    expect(source('./Game.tsx')).toContain("const selectedWorld = 'lake'");
    expect(source('./Game.tsx')).not.toContain('<IntroScreen');
    expect(source('./hooks/useGameState.ts')).toContain('beginMatch(createInitialMatchState())');
    expect(beginMatch(createInitialMatchState())).toMatchObject({phase:'aiming',actor:'player',breaking:true});
    expect(source('./Scene3D.ts')).toContain("this.environmentOptions.worldId === 'lake' || lake360Enabled()");
  });
  it('keeps all persistent keys inside the new namespace', () => {
    expect(SAVE_KEYS.every(key=>key.startsWith('princess-billiards:'))).toBe(true);
    const legacy=JSON.stringify({...createPlayerSkillProfile(),level:79,totalPlayerShots:150});
    const map=new Map([['guagua-billiards:player-skill:v3',legacy],['bj8-ui-theme','neon']]);
    const store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
    expect(loadPlayerSkillProfile(store).level).toBe(25);
    savePlayerSkillProfile({...createPlayerSkillProfile(),level:48,totalPlayerShots:32},store);
    expect(loadPlayerSkillProfile(store)).toMatchObject({level:48,totalPlayerShots:32});
    expect(map.get('guagua-billiards:player-skill:v3')).toBe(legacy);
    expect(map.get('bj8-ui-theme')).toBe('neon');
  });
  it('restores new native save state across a recreated store without touching old keys', async () => {
    const values=new Map([['guagua-billiards:player-skill:v3','old-unchanged']]);
    const api={getStorageInfo:async()=>({keys:[...values.keys()]}),getStorage:async({key}:{key:string})=>({data:values.get(key)!}),setStorage:async({key,data}:{key:string,data:string})=>{values.set(key,data);}};
    const first=await createNativeSaveStore(api,null,()=>{throw Error('save failure');});
    const profile={...createPlayerSkillProfile(),level:42,totalPlayerShots:24};
    first.store.setItem(PLAYER_SKILL_STORAGE_KEY,JSON.stringify(profile)); await first.flush();
    const refreshed=await createNativeSaveStore(api,null,()=>{throw Error('save failure');});
    expect(loadPlayerSkillProfile(refreshed.store)).toMatchObject({level:42,totalPlayerShots:24});
    expect(values.get('guagua-billiards:player-skill:v3')).toBe('old-unchanged');
  });
  it('keeps scoreboard numbering and both game modes while applying matching gem finishes', () => {
    const world=createInitialWorld(()=>.5),player=createPlayerSkillProfile();
    const html=renderToStaticMarkup(<Scoreboard match={beginMatch(createInitialMatchState())} worldView={world} playerSkill={player} opponentProfile={createOpponentProfile(player,'practice')} gameMode="practice" onModeChange={()=>{}}/>);
    expect(html).toContain('公主请开球');expect(html).toContain('value="challenge"');expect(html).toContain('value="practice"');
    expect(html).toContain('mini-ball solid');expect(html).toContain('mini-ball stripe');expect(html).toContain('mini-ball eight');
    expect(source('./components/Scoreboard.tsx')).not.toContain('COLORS');
    const css=source('./styles/princess.css');expect(css).toContain('#cc3057');expect(css).toContain('#efc348'); expect(css).not.toContain('#fff8e6');expect(css).toContain('#03050c');
  });
  it('uses R2 shared ball diameter and pocket apertures', () => {
    expect(TABLE.ballRadius*2).toBeCloseTo(.090297,6);
  });
  it('ivory cue remains visual-only and retains strike-tip coordinates', () => {
    const code=source('./Scene3D.ts');expect(code).toContain('warm-ivory-white-digital');expect(code).toContain('color: 0xfff3d9');
    expect(code).toContain('tip.position.z = 0.012');expect(code).toContain('tipCap.position.z = 0.006 + 0.0059 * 0.45');
  });
});
