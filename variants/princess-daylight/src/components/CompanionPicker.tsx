import { useCallback, useEffect, useRef, useState, type PointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { COMPANIONS, ORIGINAL_COMPANIONS, STORYBOOK_ROSTER, companionFor } from '../opponent/companions';
import {
  COMPANION_LINE_LABELS, readCompanionPreferences, saveCompanionPreferences,
  type CompanionLine, type CompanionPreferences, type CustomCompanion,
} from '../opponent/companion-preferences';
import { companionVoice } from '../opponent/companion-voices';
import { containRoyalDialogTab } from './royal-dialog-focus';
import '../styles/companion-picker.css';

const styles = ['温和有礼','认真直接','爱接梗','清冷少言','傲娇嘴硬','耐心教练','争强好胜','冷幽默','热情捧场','轻声温柔'];
const availableFriends = [...STORYBOOK_ROSTER, ...ORIGINAL_COMPANIONS];
const lineKeys = Object.keys(COMPANION_LINE_LABELS) as CompanionLine[];
const first = (line: string | readonly string[] | undefined) => typeof line === 'string' ? line : line?.[0] ?? '';

function example(voiceId: string, line: CompanionLine) {
  const voice = companionVoice(voiceId);
  if (line === 'win') return voice?.result.win ?? '';
  return first(voice?.scenes[({ opening: 'OPEN_PLAYER', pot: 'P_ONE', miss: 'P_EMPTY_1' } as const)[line]]);
}
function cropPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.type && !file.type.startsWith('image/')) { reject(Error('请选择一张照片。')); return; }
    if (file.size > 12_000_000) { reject(Error('照片太大，请选择 12 MB 以内的图片。')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(Error('照片读取失败。'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(Error('照片打不开，请换一张。'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 192;
        const ctx = canvas.getContext('2d');
        if (!ctx || !image.naturalWidth || !image.naturalHeight) { reject(Error('照片裁剪失败。')); return; }
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
        resolve(canvas.toDataURL('image/webp', .84));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type Drag = { id: string; pointer: number; input: 'mouse' | 'touch'; x: number; y: number; timer: number; lifted: boolean };
export function CompanionPicker({ close, preferredId }: { close: () => void; preferredId?: string }) {
  const [data, setData] = useState(readCompanionPreferences);
  const [draft, setDraft] = useState<CustomCompanion | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<Drag>();
  const committing = useRef(false);
  const photoRequest = useRef(0);
  const suppressClick = useRef(false);
  const panel = useRef<HTMLElement>(null);
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
    if (press.lifted) setGhost({ id: press.id, x, y });
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

  async function commit(next: CompanionPreferences, complete?: () => void) {
    if (committing.current) return;
    committing.current = true;
    setSaving(true);
    setError('');
    try {
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
  const saved = data.saved.filter(id => COMPANIONS.some(friend => friend.id === id) || data.custom.some(friend => friend.id === id));
  const selectedCount = saved.filter(id => data.selected.includes(id)).length;
  const add = (id: string) => {
    if (saved.includes(id)) return;
    void commit({ ...data, saved: [...saved, id], selected: [...data.selected, id] });
  };
  const toggle = (id: string) => void commit({ ...data,
    selected: data.selected.includes(id) ? data.selected.filter(value => value !== id) : [...data.selected, id] });
  const newFriend = () => {
    suppressClick.current = false;
    setError('');
    setDraft({ id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), name: '',
      avatarId: COMPANIONS[0].id, voiceId: COMPANIONS[0].id, lines: {} });
  };
  function startPress(id: string, input: Drag['input'], pointer: number, x: number, y: number) {
    if (saving || drag.current) return false;
    suppressClick.current = false;
    const timer = window.setTimeout(() => {
      if (!drag.current || drag.current.pointer !== pointer) return;
      drag.current.lifted = true;
      suppressClick.current = true;
      setGhost({ id, x, y });
    }, 420);
    drag.current = { id, input, pointer, x, y, timer, lifted: false };
    return true;
  }
  function begin(event: PointerEvent, id: string) {
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
    if (startPress(id, 'mouse', event.pointerId, event.clientX, event.clientY)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function endPress(press: Drag, x: number, y: number, cancelled: boolean) {
    finishPress(cancelled);
    const rect = collection.current?.getBoundingClientRect();
    if (!cancelled && press.lifted && rect && x >= rect.left && x <= rect.right &&
      y >= rect.top && y <= rect.bottom) add(press.id);
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
    setError('');
    setDraft(null);
  };
  const portrait = (id: string) => {
    const profile = data.custom.find(friend => friend.id === id);
    const fallback = companionFor(profile?.avatarId ?? id);
    return profile ? { name: profile.name, avatar: profile.avatar || fallback.avatar } : fallback;
  };

  return <div className="companion-picker-mask" role="dialog" aria-modal="true" aria-labelledby="companion-picker-title"
    onKeyDown={event => { containRoyalDialogTab(event); if (event.key === 'Escape') cancel(); event.stopPropagation(); }}>
    <section className="companion-picker" ref={panel} data-dragging={ghost ? 'true' : undefined}>
      <header><button type="button" onClick={cancel} ref={back} disabled={saving}>‹ 返回</button>
        <h2 id="companion-picker-title">{draft ? '定制球友' : '选球友'}</h2></header>
      {error && <p className="companion-picker-error" role="alert">{error}</p>}
      {draft ? <form className="companion-custom" onSubmit={event => {
        event.preventDefault();
        const name = draft.name.trim();
        if (!name || photoLoading) return;
        const existing = data.custom.some(friend => friend.id === draft.id);
        const lines: CustomCompanion['lines'] = {};
        for (const key of lineKeys) {
          const text = draft.lines[key]?.trim();
          if (text) lines[key] = text;
        }
        const next = { ...draft, name, lines };
        void commit({
          saved: saved.includes(next.id) ? saved : [...saved, next.id],
          selected: existing ? data.selected : [...data.selected, next.id],
          custom: existing ? data.custom.map(friend => friend.id === next.id ? next : friend) : [...data.custom, next],
        }, () => setDraft(null));
      }}>
        <label>名字<input name="companion-name" value={draft.name} maxLength={12} required
          onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="给球友起个名字"/></label>
        <div className="companion-photo"><span>照片</span>
          <img alt="球友头像预览" src={draft.avatar || companionFor(draft.avatarId).avatar} draggable={false}/>
          <label className="companion-file">{photoLoading ? '照片读取中…' : '选择本地照片'}
            <input type="file" accept="image/*" aria-label="选择球友照片" onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const ticket = ++photoRequest.current;
              setError('');
              setPhotoLoading(true);
              try {
                const avatar = await cropPhoto(file);
                if (photoRequest.current === ticket) setDraft(current => current && { ...current, avatar });
              } catch (error) {
                if (photoRequest.current === ticket) setError(error instanceof Error ? error.message : '照片读取失败。');
              } finally {
                if (photoRequest.current === ticket) setPhotoLoading(false);
              }
            }}/>
          </label>
          <select aria-label="使用内置头像" value={draft.avatar ? '' : draft.avatarId} onChange={event => {
            const avatarId = event.target.value;
            photoRequest.current++;
            setPhotoLoading(false);
            setDraft({ ...draft, avatarId, avatar: undefined });
          }}>
            {draft.avatar && <option value="" disabled>使用已选照片</option>}
            {COMPANIONS.map(friend => <option key={friend.id} value={friend.id}>{friend.name}</option>)}
          </select>
        </div>
        <label>个性描述<select aria-label="说话风格" value={draft.personality !== undefined ? 'custom' : draft.voiceId}
          onChange={event => setDraft(event.target.value === 'custom' ? { ...draft, personality: '' } :
            { ...draft, voiceId: event.target.value, personality: undefined })}>
          {COMPANIONS.map((friend, index) => <option key={friend.id} value={friend.id}>{styles[index] ?? companionVoice(friend.id)?.personality ?? friend.name}</option>)}
          <option value="custom">自定义</option>
        </select></label>
        {draft.personality !== undefined ? <textarea aria-label="自定义个性" value={draft.personality} maxLength={120}
          onChange={event => setDraft({ ...draft, personality: event.target.value })} placeholder="写几句他的说话习惯"/>
          : <p className="companion-picker-note">{companionVoice(draft.voiceId)?.personality}</p>}
        <fieldset><legend>对话示例</legend>
          {lineKeys.map(key => <label key={key}>{COMPANION_LINE_LABELS[key]}
            <textarea aria-label={COMPANION_LINE_LABELS[key] + '台词'} maxLength={30}
              value={draft.lines[key] ?? example(draft.voiceId, key)}
              onChange={event => setDraft({ ...draft, lines: { ...draft.lines, [key]: event.target.value } })}/>
            {draft.lines[key] !== undefined && <button type="button" onClick={() => {
              const lines = { ...draft.lines }; delete lines[key]; setDraft({ ...draft, lines });
            }}>恢复默认</button>}
          </label>)}
        </fieldset>
        <button type="submit" className="companion-save" disabled={saving || photoLoading || !draft.name.trim()}>{saving ? '保存中…' : '保存球友'}</button>
      </form> : <>
        <div className="companion-columns">
          <section><h3>内置球友</h3><div className="companion-list">
            {availableFriends.map(({ id }) => {
              const friend = portrait(id);
              return <button key={id} type="button" className="companion-item companion-drag" aria-label={'加入' + friend.name}
                onPointerDown={event => begin(event, id)}
                onPointerMove={event => {
                  const press = drag.current;
                  if (press?.input === 'mouse' && press.pointer === event.pointerId) movePress(press, event.clientX, event.clientY);
                }}
                onPointerUp={event => {
                  const press = drag.current;
                  if (press?.input === 'mouse' && press.pointer === event.pointerId) endPress(press, event.clientX, event.clientY, false);
                }}
                onLostPointerCapture={event => {
                  if (drag.current?.input === 'mouse' && drag.current.pointer === event.pointerId) finishPress(true);
                }}
                onTouchStart={event => {
                  const touch = event.changedTouches[0];
                  if (event.touches.length === 1 && touch) startPress(id, 'touch', touch.identifier, touch.clientX, touch.clientY);
                  else if (drag.current?.input === 'touch') finishPress(true);
                }}
                onTouchEnd={event => endTouch(event)} onTouchCancel={event => endTouch(event, true)}
                onContextMenu={event => event.preventDefault()}
                onClick={event => { if (!suppressClick.current || event.detail === 0) add(id); suppressClick.current = false; }}
                disabled={saving}>
                <img src={friend.avatar} alt="" draggable={false} loading="lazy"/>
                <span>{friend.name}</span>
              </button>;
            })}
          </div></section>
          <section ref={collection} className={ghost ? 'companion-drop' : ''}><h3>我的球友</h3>
            <div className="companion-list">
              {saved.map(id => {
                const profile = data.custom.find(friend => friend.id === id);
                const friend = portrait(id);
                return <div className="companion-item" key={id}>
                  <label><input type="checkbox" checked={data.selected.includes(id)} aria-label={friend.name + '参与匹配'} disabled={saving}
                    onChange={() => toggle(id)}/><img src={friend.avatar} alt="" draggable={false}/><span>{friend.name}</span></label>
                  {profile && <button className="companion-edit" type="button" disabled={saving} onClick={() => { setError(''); setDraft(profile); }}>编辑</button>}
                </div>;
              })}
              {!saved.length && <p className="companion-picker-note">长按左栏球友，拖到这里</p>}
            </div>
            <button type="button" className="companion-add" disabled={saving} onClick={newFriend}>＋ 定制球友</button>
          </section>
        </div>
        <p className="companion-picker-note companion-pool" role="status">{selectedCount ? `下一局从已选的 ${selectedCount} 位球友中随机匹配` : preferredId ? `下一局和${companionFor(preferredId).name}打球` : '下一局从内置球友中随机匹配'}</p>
      </>}
    </section>
    {ghost && <img className="companion-drag-ghost" src={portrait(ghost.id).avatar} alt="" style={{ left: ghost.x, top: ghost.y }}/>}
  </div>;
}
