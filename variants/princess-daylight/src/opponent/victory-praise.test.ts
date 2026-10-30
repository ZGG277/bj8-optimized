import { describe, expect, it } from 'vitest';
import { drawVictoryPraise, nextVictoryPraise, VICTORY_PRAISES, VICTORY_PRAISE_KEY, type PraiseDeck } from './victory-praise';
describe('win encouragement rotation', () => {
  it('uses all 50 independent lines before reshuffling, without a boundary repeat', () => {
    expect(VICTORY_PRAISES).toHaveLength(50);expect(new Set(VICTORY_PRAISES).size).toBe(50);
    expect(VICTORY_PRAISES.every(text=>!text.includes('公主赢了')&&Array.from(text).length<=10&&!/[\n\r]/.test(text))).toBe(true);
    let deck: PraiseDeck = { remaining: [], last: null };const texts:string[]=[];
    for(let i=0;i<150;i++){const result=drawVictoryPraise(deck,()=>.5);deck=result.deck;texts.push(result.text);}
    for(let i=0;i<150;i+=50)expect(new Set(texts.slice(i,i+50)).size).toBe(50);
    for(let i=1;i<150;i++)expect(texts[i]).not.toBe(texts[i-1]);
  });
  it('persists the remaining deck and tolerates a damaged or unavailable save', () => {
    const data=new Map<string,string>();const store={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    const first=nextVictoryPraise(store);expect(JSON.parse(data.get(VICTORY_PRAISE_KEY)!).remaining).toHaveLength(49);
    expect(nextVictoryPraise(store)).not.toBe(first);
    data.set(VICTORY_PRAISE_KEY,'{bad');expect(VICTORY_PRAISES).toContain(nextVictoryPraise(store));
    expect(()=>nextVictoryPraise({getItem(){throw Error('denied');},setItem(){throw Error('full');}})).not.toThrow();
  });
});
