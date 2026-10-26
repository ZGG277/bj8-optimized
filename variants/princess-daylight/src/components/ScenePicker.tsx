import { useEffect, useRef } from 'react';
import { RoyalIcon } from './RoyalIcon';
export function ScenePicker({ value, disabled, onChange, onClose }: {value:'castle'|'lake';disabled:boolean;onChange:(world:'castle'|'lake')=>void;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>previous?.focus();},[]);
  return <div className="scene-picker-mask" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="scene-picker" role="dialog" aria-modal="true" aria-labelledby="scene-title" onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}}}>
      <header><span id="scene-title" className="royal-sr-only">场景</span><button ref={close} onClick={onClose} aria-label="关闭场景"><RoyalIcon name="close"/></button></header>
      <div className="scene-cards">{(['castle','lake'] as const).map(world=><button key={world} disabled={disabled} className={`scene-card ${world} ${value===world?'selected':''}`} aria-pressed={value===world} onClick={()=>onChange(world)}>
        <span className="scene-thumb" aria-hidden="true">{world==='castle'?<svg viewBox="0 0 200 120"><path d="M24 96V28h12v68m48 0V28h12v68m48 0V28h12v68M22 26h138v9H22m12 18a28 28 0 0150 0m10 0a28 28 0 0150 0" fill="none" stroke="currentColor" strokeWidth="9"/><path d="M54 103l10-31h73l14 31z" fill="#346d52" stroke="#c2a56c" strokeWidth="4"/></svg>:<svg viewBox="0 0 200 120"><path d="M0 45q35-22 67 0t67 0t66 0v75H0z" fill="#a1c7be"/><path d="M0 69q35-12 67 0t67 0t66 0M0 93q35-12 67 0t67 0t66 0" fill="none" stroke="#e6f2e9"/><path d="M54 103l10-31h73l14 31z" fill="#346d52" stroke="#c2a56c" strokeWidth="4"/></svg>}</span>
        <strong>{world==='castle'?'城堡':'湖面'}</strong>
      </button>)}</div>
    </section>
  </div>;
}
