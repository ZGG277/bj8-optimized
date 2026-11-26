import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { CORE_ROSTER, companionFor } from '../opponent/companions';
import { coreCompanion } from '../opponent/core-companions';
import {
  readCompanionPreferences, saveCompanionPreferences,
  type CompanionPreferences, type CustomCompanion,
} from '../opponent/companion-preferences';
import { localPersonalityLabel, summarizeCompanionPersonality } from '../minitool/table-chat';
import { defaultCrop, restoreCrop, type Crop } from '../input/portrait-crop';
import { exportPortraitCrop, loadPortraitImage, PortraitCropCanvas, readPortraitPhoto } from './PortraitCropCanvas';
import { containRoyalDialogTab } from './royal-dialog-focus';
import '../styles/companion-picker.css';

const personalityExample = '例如：他平时说话温和，偶尔会接梗。开局爱开个小玩笑，看到好球会说出哪里打得漂亮。遇到失误先安慰一句，玩家开口问时再耐心给一个具体建议。到了赛点就认真起来，少说几句，留时间给对方瞄准。';
function compactPhotoSource(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('照片读取失败。');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', .76);
  return webp.startsWith('data:image/webp,') || webp.startsWith('data:image/webp;')
    ? webp : canvas.toDataURL('image/jpeg', .76);
}

type DragAction = 'add' | 'remove';
type Drag = { id: string; action: DragAction; pointer: number; input: 'mouse' | 'touch'; x: number; y: number; timer: number; lifted: boolean };
export function CompanionPicker({ close, forRack }: {
  close: () => void;
  forRack?: { currentId?: string; choose: (id: string) => void };
}) {
  const [data, setData] = useState(readCompanionPreferences);
  const [selected, setSelected] = useState(forRack?.currentId);
  const [draft, setDraft] = useState<CustomCompanion | null>(null);
  const [photo, setPhoto] = useState<{ image: HTMLImageElement; source: string }>();
  const [photoCrop, setPhotoCrop] = useState(defaultCrop);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [ghost, setGhost] = useState<{ id: string; action: DragAction; x: number; y: number } | null>(null);
  const drag = useRef<Drag>();
  const committing = useRef(false);
  const photoRequest = useRef(0);
  const suppressClick = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const featured = useRef<HTMLElement>(null);
  const collection = useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const finishPress = useCallback((cancelled: boolean) => {
    const press = drag.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    drag.current = undefined;
    if (cancelled) suppressClick.current = true;
    setGhost(null);
  }, []);
  const movePress = useCallback((press: Drag, x: number, y: number) => {
    if (press.lifted) setGhost({ id: press.id, action: press.action, x, y });
    else if (Math.hypot(x - press.x, y - press.y) > 10) finishPress(true);
  }, [finishPress]);

  useEffect(() => {
    const picker = panel.current;
    // Let a swipe scroll the roster until its long press has started a drag.
    const moveTouch = (event: TouchEvent) => {
      const press = drag.current;
      if (press?.input !== 'touch') return;
      const touch = Array.from(event.changedTouches).find(point => point.identifier === press.pointer);
      if (!touch) return;
      if (press.lifted && event.cancelable) event.preventDefault();
      movePress(press, touch.clientX, touch.clientY);
    };
    picker?.addEventListener('touchmove', moveTouch, { passive: false });
    back.current?.focus();
    return () => {
      picker?.removeEventListener('touchmove', moveTouch);
      window.clearTimeout(drag.current?.timer);
      photoRequest.current++;
    };
  }, [movePress]);

  async function commit(update: CompanionPreferences | (() => Promise<CompanionPreferences>), complete?: () => void) {
    if (committing.current) return;
    committing.current = true;
    setSaving(true);
    setError('');
    try {
      const next = typeof update === 'function' ? await update() : update;
      await saveCompanionPreferences(next);
      setData(next);
      complete?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }
  const saved = data.saved.filter(id => coreCompanion(id) || data.custom.some(friend => friend.id === id));
  const add = (id: string) => {
    if (saved.includes(id)) return;
    void commit({ ...data, saved: [...data.saved, id] });
  };
  const remove = (id: string) => {
    if (!coreCompanion(id) || !saved.includes(id)) return;
    void commit({ ...data, saved: data.saved.filter(friend => friend !== id) });
  };
  const newFriend = () => {
    suppressClick.current = false;
    setError('');
    setDraft({ id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), name: '',
      avatarId: CORE_ROSTER[0].id, voiceId: CORE_ROSTER[0].id, lines: {} });
  };
  function startPress(id: string, action: DragAction, input: Drag['input'], pointer: number, x: number, y: number) {
    if (saving || drag.current) return false;
    suppressClick.current = false;
    if (action === 'add' && saved.includes(id)) return false;
    const timer = window.setTimeout(() => {
      if (!drag.current || drag.current.pointer !== pointer) return;
      drag.current.lifted = true;
      suppressClick.current = true;
      setGhost({ id, action, x, y });
    }, 420);
    drag.current = { id, action, input, pointer, x, y, timer, lifted: false };
    return true;
  }
  function endPress(press: Drag, x: number, y: number, cancelled: boolean) {
    finishPress(cancelled);
    if (cancelled || !press.lifted) return;
    const target = press.action === 'add' ? collection : featured;
    const rect = target.current?.getBoundingClientRect();
    const dropped = rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (press.action === 'remove') {
      if (dropped) remove(press.id);
    } else if (dropped || (forRack && Math.hypot(x - press.x, y - press.y) <= 12)) {
      add(press.id);
    }
  }
  function pressHandlers(id: string, action: DragAction) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
        if (startPress(id, action, 'mouse', event.pointerId, event.clientX, event.clientY)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const press = drag.current;
        if (press?.input === 'mouse' && press.pointer === event.pointerId) movePress(press, event.clientX, event.clientY);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const press = drag.current;
        if (press?.input === 'mouse' && press.pointer === event.pointerId) endPress(press, event.clientX, event.clientY, false);
      },
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
        if (drag.current?.input === 'mouse' && drag.current.pointer === event.pointerId) finishPress(true);
      },
      onTouchStart: (event: ReactTouchEvent<HTMLButtonElement>) => {
        const touch = event.changedTouches[0];
        if (event.touches.length === 1 && touch) startPress(id, action, 'touch', touch.identifier, touch.clientX, touch.clientY);
        else if (drag.current?.input === 'touch') finishPress(true);
      },
      onTouchEnd: (event: ReactTouchEvent<HTMLButtonElement>) => endTouch(event),
      onTouchCancel: (event: ReactTouchEvent<HTMLButtonElement>) => endTouch(event, true),
      onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    };
  }
  function afterPress(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    if (!suppressClick.current || event.detail === 0) action();
    suppressClick.current = false;
  }
  function endTouch(event: ReactTouchEvent, cancelled = false) {
    const press = drag.current;
    if (press?.input !== 'touch') return;
    const touch = Array.from(event.changedTouches).find(point => point.identifier === press.pointer);
    if (touch) endPress(press, touch.clientX, touch.clientY, cancelled);
  }
  const cancel = () => {
    if (saving) return;
    if (!draft) { close(); return; }
    photoRequest.current++;
    setPhotoLoading(false);
    setPhoto(undefined);
    setError('');
    setDraft(null);
  };
  const portrait = (id: string) => {
    const profile = data.custom.find(friend => friend.id === id);
    const fallback = companionFor(profile?.avatarId ?? id);
    return profile ? { name: profile.name, avatar: profile.avatar || fallback.avatar } : fallback;
  };

  async function editPhoto(load: () => Promise<HTMLImageElement>, source?: string, crop?: Crop) {
    const ticket = ++photoRequest.current;
    setError('');
    setPhotoLoading(true);
    try {
      const image = await load();
      if (photoRequest.current !== ticket) return;
      setPhoto({ image, source: source || compactPhotoSource(image) });
      setPhotoCrop(restoreCrop(crop));
    } catch {
      if (photoRequest.current === ticket) setError('照片打不开，请换一张。');
    } finally {
      if (photoRequest.current === ticket) setPhotoLoading(false);
    }
  }

  function choosePhoto(file?: File) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) { setError('请选择一张照片。'); return; }
    if (file.size > 12_000_000) { setError('照片太大，请选择 12 MB 以内的图片。'); return; }
    void editPhoto(() => readPortraitPhoto(file));
  }

  function adjustPhoto(friend: CustomCompanion) {
    const source = typeof friend.avatarEdit?.source === 'string' && friend.avatarEdit.source || friend.avatar;
    if (source) void editPhoto(() => loadPortraitImage(source), source, friend.avatarEdit?.crop);
  }

  function saveCustom(friend: CustomCompanion) {
    const name = friend.name.trim();
    if (!name || photoLoading) return;
    const personality = friend.personality?.trim() || undefined;
    const existing = data.custom.find(item => item.id === friend.id);
    void commit(async () => {
      const avatar = photo ? exportPortraitCrop(photo.image, photoCrop) : friend.avatar;
      const avatarEdit = photo ? { source: photo.source, crop: photoCrop } : friend.avatarEdit;
      const oldLabel = existing?.personality === personality ? existing?.personalityLabel : undefined;
      const personalityLabel = oldLabel ?? await summarizeCompanionPersonality(personality ?? '');
      const next = { ...friend, name, personality, personalityLabel, avatar, avatarEdit };
      return {
        ...data,
        saved: saved.includes(next.id) ? data.saved : [...data.saved, next.id],
        custom: existing ? data.custom.map(item => item.id === next.id ? next : item) : [...data.custom, next],
      };
    }, () => { setPhoto(undefined); setDraft(null); });
  }

  return <div className="companion-picker-mask" role="dialog" aria-modal="true" aria-labelledby="companion-picker-title"
    onKeyDown={event => { containRoyalDialogTab(event); if (event.key === 'Escape') cancel(); event.stopPropagation(); }}>
    <section className="companion-picker" ref={panel} data-dragging={ghost?.action}>
      <header><h2 id="companion-picker-title">{draft ? '定制球友' : forRack ? '换一位球友' : '选球友'}</h2></header>
      {error && <p className="companion-picker-error" role="alert">{error}</p>}
      {draft ? <><form id="companion-custom-form" className="companion-custom" onSubmit={event => {
        event.preventDefault();
        saveCustom(draft);
      }}>
        <div className="companion-photo" data-cropping={Boolean(photo) || undefined}>
          <span>照片</span>
          {photo ? <div className="companion-photo-crop">
            <PortraitCropCanvas className="portrait-preview" image={photo.image} crop={photoCrop} onCrop={setPhotoCrop}
              disabled={saving || photoLoading}/>
            <p className="portrait-crop-hint">双指缩放 · 拖动调整</p>
          </div> : <img alt="球友头像预览" src={draft.avatar || companionFor(draft.avatarId).avatar} draggable={false}/>}
          <div className="companion-photo-actions">
            <label className="companion-file">{photoLoading ? '照片读取中…' : '更换照片'}
              <input type="file" accept="image/*" disabled={saving || photoLoading} aria-label="选择球友照片" onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                choosePhoto(file);
              }}/>
            </label>
            {!photo && draft.avatar && <button type="button" className="companion-photo-adjust" disabled={saving || photoLoading}
              onClick={() => adjustPhoto(draft)}>调整照片</button>}
          </div>
        </div>
        <label>名字<input name="companion-name" value={draft.name} maxLength={12} required disabled={saving}
          onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="给球友起个名字"/></label>
        <label>个性描述<textarea value={draft.personality ?? ''} maxLength={1200} rows={5}
          disabled={saving} placeholder="写下球友的性格、说话方式和打球时的反应"
          aria-describedby="companion-personality-example"
          onChange={event => setDraft({ ...draft, personality: event.target.value })}/></label>
        <p id="companion-personality-example" className="companion-personality-example">{personalityExample}</p>
      </form><footer className="profile-dialog-actions">
        <button type="button" onClick={cancel} disabled={saving}>取消</button>
        <button type="submit" form="companion-custom-form" className="profile-dialog-save"
          disabled={saving || photoLoading || !draft.name.trim()}>{saving ? '保存中…' : '保存球友'}</button>
      </footer></> : <>
        <div className="companion-columns">
          <section ref={featured} className={ghost?.action === 'remove' ? 'companion-drop' : ''}>
            <h3>精选球友</h3><div className="companion-list">
            {CORE_ROSTER.map(({ id, label }) => {
              const friend = portrait(id);
              return <button key={id} type="button"
                className={forRack ? 'companion-item companion-rack-option companion-movable' : 'companion-item companion-drag'}
                aria-label={forRack ? undefined : '加入' + friend.name} aria-pressed={forRack ? selected === id : undefined}
                {...pressHandlers(id, 'add')}
                onClick={event => afterPress(event, () => forRack ? setSelected(id) : add(id))}
                disabled={saving || (!forRack && saved.includes(id))}>
                <img src={friend.avatar} alt="" draggable={false} loading="lazy"/>
                <span className="companion-name">{friend.name}</span>
                <small className="companion-trait">{label}</small>
              </button>;
            })}
          </div>{!forRack && <button type="button" className="companion-add" disabled={saving} onClick={newFriend}>＋ 定制球友</button>}</section>
          <section ref={collection} className={ghost?.action === 'add' ? 'companion-drop' : ''}><h3>我的球友</h3>
            {forRack && <p className="companion-picker-note">长按左栏头像加入，精选球友可长按拖回</p>}
            {!forRack && saved.some(id => coreCompanion(id)) && <p className="companion-picker-note">长按右栏的精选球友，拖回左栏移出</p>}
            <div className="companion-list">
              {saved.map(id => {
                const profile = data.custom.find(friend => friend.id === id);
                const friend = portrait(id);
                return profile && !forRack ? <button className="companion-item companion-edit" key={id} type="button" disabled={saving}
                  aria-label={`编辑球友 ${friend.name}`} onClick={() => { setError(''); setDraft(profile); }}>
                  <img src={friend.avatar} alt="" draggable={false}/>
                  <span className="companion-custom-identity">
                    <span className="companion-name">{friend.name}</span>
                    <small className="companion-trait">{profile.personalityLabel ?? localPersonalityLabel(profile.personality ?? '')}</small>
                  </span>
                </button> : <button className="companion-item companion-rack-option companion-movable" key={id}
                  type="button" disabled={saving}
                  aria-label={forRack ? undefined : `将${friend.name}移回精选球友`}
                  aria-pressed={forRack ? selected === id : undefined}
                  {...(!profile ? pressHandlers(id, 'remove') : {})}
                  onClick={event => {
                    if (forRack) {
                      if (profile) setSelected(id);
                      else afterPress(event, () => setSelected(id));
                    } else if (event.detail === 0) remove(id);
                  }}>
                  <img src={friend.avatar} alt="" draggable={false}/><span className="companion-name">{friend.name}</span>
                </button>;
              })}
              {!saved.length && !forRack && <p className="companion-picker-note">长按左栏球友，拖到这里</p>}
            </div>
          </section>
        </div>
        <footer className="profile-dialog-actions">
          <button type="button" onClick={cancel} ref={back} disabled={saving}>返回</button>
          <button type="button" onClick={forRack ? () => { if (selected) forRack.choose(selected); } : close}
            className="profile-dialog-save" disabled={saving || (Boolean(forRack) && !selected)}>确认</button>
        </footer>
      </>}
    </section>
    {ghost && <img className="companion-drag-ghost" src={portrait(ghost.id).avatar} alt="" style={{ left: ghost.x, top: ghost.y }}/>}
  </div>;
}
