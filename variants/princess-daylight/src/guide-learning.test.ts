import { describe, it, expect } from 'vitest';
import { createGuideLearning, GUIDE_LEARNING_KEY, GUIDE_ACTIONS } from './guide-learning';
function memory() { const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}}; }
describe('two successful interactions retire each lesson',()=>{
  it.each(GUIDE_ACTIONS)('%s counts one pointer stream only once and survives re-entry', action=>{
    const storage=memory(), learning=createGuideLearning(storage);
    expect(learning.learned(action)).toBe(false);
    learning.record(action,1); learning.record(action,1); learning.record(action,1);
    expect(learning.count(action)).toBe(1);
    expect(learning.learned(action)).toBe(false);
    learning.record(action,2);
    expect(learning.learned(action)).toBe(true);
    expect(createGuideLearning(storage).learned(action)).toBe(true);
  });
  it('keeps cue placement independent of an experienced shooter',()=>{
    const storage=memory();storage.setItem('princess-billiards:first-match-guide:v1','done');
    const learning=createGuideLearning(storage);
    expect(learning.learned('power')).toBe(true);
    expect(learning.learned('place')).toBe(false);
    learning.record('place',1); expect(learning.learned('place')).toBe(false);
    learning.record('place',2); expect(learning.learned('place')).toBe(true);
  });
  it('rejects malformed counts and retains progress if storage writes fail',()=>{
    const storage=memory();storage.setItem(GUIDE_LEARNING_KEY,JSON.stringify({power:'2',aim:-1,ghost:99}));
    const learning=createGuideLearning({...storage,setItem:()=>{throw Error('quota');}});
    expect(learning.count('power')).toBe(0);expect(learning.count('aim')).toBe(0);expect(learning.count('ghost')).toBe(2);
    learning.record('place',10);learning.record('place',11);expect(learning.learned('place')).toBe(true);
  });
});
