import { useEffect } from 'react';
type Rect = { top:number; left:number; right:number; bottom:number; width:number; height:number };
type WindowInfo = {windowWidth:number; safeArea?:Rect; menuButtons?: Partial<Record<'back'|'me'|'share'|'capsule',Rect|null>>};
export function headerGeometry(info: WindowInfo, viewport: number) {
  const buttons=info.menuButtons;
  if (!buttons || !info.windowWidth || !viewport) return null;
  const visible=(r?:Rect|null): r is Rect => !!r && r.width>0 && r.height>0 && Number.isFinite(r.left+r.right+r.top+r.bottom);
  const rects=visible(buttons.capsule)?[buttons.capsule]:[buttons.back,buttons.me,buttons.share].filter(visible);
  if (!rects.length) return null;
  const k=viewport/info.windowWidth;
  const sorted=[...rects].sort((a,b)=>a.left-b.left);
  let start=Math.max(4,(info.safeArea?.left??0)*k), bestStart=start, bestWidth=0;
  const right=Math.min(viewport-4,(info.safeArea?.right??info.windowWidth)*k);
  for(const r of sorted){
    const gap=r.left*k-4-start;
    if(gap>bestWidth){bestStart=start;bestWidth=gap;}
    start=Math.max(start,r.right*k+4);
  }
  if(right-start>bestWidth){bestStart=start;bestWidth=right-start;}
  const top=Math.min(...rects.map(r=>r.top))*k, bottom=Math.max(...rects.map(r=>r.bottom))*k;

  const height=Math.max(28,bottom-top);
  return {top:Math.max(0,(top+bottom-height)/2),height,left:bestStart,right:viewport-bestStart-bestWidth};
}
export function useScoreInset() {
  useEffect(()=>{
    type Bridge = { launchOptions?: { miniToolEnv?: { windowInfo?: WindowInfo } }; miniTool?: { getWindowInfo?: () => Promise<WindowInfo> } };
    const host = (window as Window & { xhs?: Bridge }).xhs;
    let revision = 0;
    const keys = ['top','height','left','right'] as const;
    function apply(info?: WindowInfo) {
      const g = info && headerGeometry(info, window.innerWidth);
      if (!g) return;
      for (const key of keys) document.documentElement.style.setProperty('--native-score-' + key, g[key] + 'px');
    }
    apply(host?.launchOptions?.miniToolEnv?.windowInfo);
    const refresh = async () => {
      const ticket = ++revision;
      try {
        const info = await (window as Window & { xhs?: Bridge }).xhs?.miniTool?.getWindowInfo?.();
        if (revision === ticket) apply(info);
      } catch { /* Keep the last measured row. */ }
    };
    void refresh();
    const laidOut = window.setTimeout(refresh, 450);
    window.addEventListener('resize', refresh);
    return () => {
      revision++; window.clearTimeout(laidOut); window.removeEventListener('resize', refresh);
      for (const key of keys) document.documentElement.style.removeProperty('--native-score-' + key);
    };
  },[]);
}
