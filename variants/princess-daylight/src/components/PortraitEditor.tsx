import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PRINCESS, portraitFor, savePortrait } from '../opponent/player-portraits';
import { COMPANIONS } from '../opponent/companions';
import { containRoyalDialogTab } from './royal-dialog-focus';

const defaultCrop = { x: .5, y: .5, zoom: 1 };

export function PortraitEditor({ id, close }: { id: string; close: () => void }) {
  const base = COMPANIONS.find(c => c.id === id);
  const original = base?.avatar ?? DEFAULT_PRINCESS;
  const stored = portraitFor(id);
  const [name, setName] = useState(stored.name ?? base?.name ?? '');
  const [photo, setPhoto] = useState(stored.avatar || original);
  const [crop, setCrop] = useState(defaultCrop);
  const [changed, setChanged] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const srcImage = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const request = useRef(0);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
    return () => { request.current++; };
  }, []);
  useEffect(() => {
    let active = true;
    setReady(false);
    const img = new Image(); img.onload = () => { if (active) { srcImage.current = img; setReady(true); } };
    img.onerror = () => { if (active) setError('这张图片打不开，请换一张。'); };
    img.src = photo;
    return () => { active = false; };
  }, [photo]);
  useEffect(() => {
    const img = srcImage.current, ctx = canvas.current?.getContext('2d');
    if (!img || !ctx || !ready) return;
    const side = Math.min(img.naturalWidth, img.naturalHeight) / crop.zoom;
    ctx.fillStyle = '#f5f1e4'; ctx.fillRect(0,0,192,192);
    ctx.drawImage(img, (img.naturalWidth-side)*crop.x, (img.naturalHeight-side)*crop.y, side,side,0,0,192,192);
  }, [ready, crop, photo]);
  function choose(file?: File) {
    if (!file) return;
    const token = ++request.current;
    if (file.type && !file.type.startsWith('image/')) { setError('请选择一张图片。'); return; }
    const reader = new FileReader();
    setError(''); setReady(false);
    reader.onload = () => { if (request.current === token) {setChanged(true); setCrop({x:.5,y:.5,zoom:1}); const src=String(reader.result); if(src===photo)setReady(true); else setPhoto(src);} };
    reader.onerror = () => { if (request.current === token) {setError('读取失败，请重新选图。');setReady(true);} };
    reader.readAsDataURL(file);
  }
  async function save() {
    if (saving || !ready) return;
    setSaving(true);
    setError('');
    try {
      let avatar = stored.avatar;
      if (changed && canvas.current) {
        if (photo === original && crop.zoom === defaultCrop.zoom && crop.x === defaultCrop.x && crop.y === defaultCrop.y) avatar = undefined;
        else {
          const cut = document.createElement('canvas');
          cut.width = cut.height = canvas.current.width;
          const ctx = cut.getContext('2d');
          if (!ctx) throw Error('裁剪失败');
          const r = cut.width / 2;
          ctx.beginPath(); ctx.arc(r, r, r, 0, 2 * Math.PI); ctx.clip();
          ctx.drawImage(canvas.current, 0, 0);
          avatar = cut.toDataURL('image/webp', .84);
        }
      }
      const nextName = name.trim();
      await savePortrait(id, { avatar, name: nextName && nextName !== base?.name ? nextName : undefined });
      close();
    } catch {
      setError('资料暂未保存，请再试一次。');
      setSaving(false);
    }
  }
  return <div className="portrait-mask" role="dialog" aria-modal="true" aria-labelledby="portrait-title" onKeyDown={e=>{containRoyalDialogTab(e);if(e.key==='Escape' && !saving)close();e.stopPropagation();}}>
    <section className="portrait-editor" aria-busy={saving}><header><button ref={back} onClick={close} disabled={saving}>取消</button><h2 id="portrait-title">{base?'球友资料':'编辑个人资料'}</h2><button onClick={() => void save()} disabled={saving || !ready || (!!base && !name.trim())}>{saving ? '保存中' : '保存'}</button></header>
    <label className="portrait-name">昵称<input value={name} placeholder={base ? base.name : '默认显示「你」'}
      disabled={saving} maxLength={12} onChange={e=>setName(e.target.value)}/></label>
    <canvas width="192" height="192" ref={canvas} aria-label="圆形头像裁剪预览" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId); drag.current={x:e.clientX,y:e.clientY,cx:crop.x,cy:crop.y};}}
      onPointerMove={e=>{const d=drag.current,img=srcImage.current;if(!d||!img||!ready)return;const side=Math.min(img.width,img.height)/crop.zoom, scale=side/e.currentTarget.clientWidth;
        const pan=(start:number,delta:number,room:number)=> room>0?Math.max(0,Math.min(1,start-delta*scale/room)):.5;
        setCrop({...crop,x:pan(d.cx,e.clientX-d.x,img.width-side),y:pan(d.cy,e.clientY-d.y,img.height-side)});setChanged(true);}}
      onLostPointerCapture={()=>{drag.current=null;}} />
    <input type="range" aria-label="缩放头像" min="1" max="3" step=".02" value={crop.zoom} disabled={saving} onChange={e=>{setCrop({...crop,zoom:Number(e.target.value)});setChanged(true);}}/>
    <div className="portrait-choices"><label>选一张照片<input type="file" accept="image/*" disabled={saving} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/></label><button disabled={saving} onClick={()=>{++request.current;setPhoto(original);setCrop(defaultCrop);setChanged(true);setError('');if(photo===original)setReady(true);}}>恢复默认头像</button></div>
    {error && <p role="alert">{error}</p>}</section></div>;
}
