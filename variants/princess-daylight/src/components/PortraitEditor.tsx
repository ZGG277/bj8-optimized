import { useEffect, useRef, useState } from 'react';
import { defaultCrop } from '../input/portrait-crop';
import { PLAYER_AVATARS, PLAYER_AVATAR_PAIRS, portraitFor, savePortrait, type PlayerAvatar } from '../opponent/player-portraits';
import { exportPortraitCrop, PortraitCropCanvas, readPortraitPhoto } from './PortraitCropCanvas';
import { containRoyalDialogTab } from './royal-dialog-focus';

const nicknamePresets = ['帅哥', '美女', '宝宝', '团子', '糖糖', '小柚子'];
type AvatarChoice = { preset: PlayerAvatar['id'] } | { photo: number };

function rememberNickname(names: string[], name: string) {
  return !name || name === '你' || nicknamePresets.includes(name) || names.includes(name) ? names : [name, ...names];
}

function initialPortrait() {
  const saved = portraitFor('player');
  let photos = Array.isArray(saved.photos) ? saved.photos : [];
  const preset = PLAYER_AVATARS.find(option => option.id === saved.avatarPreset);
  let photo = photos.indexOf(saved.avatar ?? '');
  // Older versions saved only the active photo. Keep it when switching to a preset.
  if (!preset && saved.avatar && photo < 0) {
    photo = photos.length;
    photos = [...photos, saved.avatar];
  }
  const choice: AvatarChoice = preset ? { preset: preset.id } : photo >= 0 ? { photo } : { preset: 'classic' };
  const name = saved.name ?? '';
  return {
    choice, photos, name,
    nicknames: rememberNickname(Array.isArray(saved.nicknames) ? saved.nicknames : [], name),
    customized: Boolean(saved.avatar || saved.avatarPreset),
  };
}

export function PortraitEditor({ close }: { close: () => void }) {
  const [initial] = useState(initialPortrait);
  const [name, setName] = useState(initial.name);
  const [nicknames, setNicknames] = useState(initial.nicknames);
  const [nameInput, setNameInput] = useState('');
  const [choice, setChoice] = useState(initial.choice);
  const [photos, setPhotos] = useState(initial.photos);
  const [image, setImage] = useState<HTMLImageElement>();
  const [crop, setCrop] = useState(defaultCrop);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const preset = 'preset' in choice && !image ? choice.preset : undefined;
  const activePhoto = 'photo' in choice && !image ? choice.photo : undefined;
  const preview = 'preset' in choice ? PLAYER_AVATARS.find(option => option.id === choice.preset)?.image : photos[choice.photo];

  useEffect(() => {
    cancelButton.current?.focus({ preventScroll: true });
    return () => { request.current++; };
  }, []);

  function archiveCrop() {
    if (!image) return { photos, choice };
    const avatar = exportPortraitCrop(image, crop, true);
    const existing = photos.indexOf(avatar);
    return existing < 0 ? { photos: [...photos, avatar], choice: { photo: photos.length } }
      : { photos, choice: { photo: existing } };
  }

  function selectAvatar(next: AvatarChoice) {
    request.current++;
    setLoading(false);
    try { setPhotos(archiveCrop().photos); }
    catch { setError('照片暂未裁剪，请再试一次。'); return; }
    setImage(undefined);
    setChoice(next);
    setError('');
  }

  async function choosePhoto(file?: File) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) { setError('请选择一张图片。'); return; }
    const token = ++request.current;
    setLoading(true);
    setError('');
    try {
      const photo = await readPortraitPhoto(file);
      if (request.current !== token) return;
      setPhotos(archiveCrop().photos);
      setImage(photo);
      setCrop(defaultCrop);
    } catch {
      if (request.current === token) setError('这张图片打不开，请换一张。');
    } finally {
      if (request.current === token) setLoading(false);
    }
  }

  function selectNickname(value: string) {
    setNicknames(names => rememberNickname(names, nameInput.trim()));
    setName(value === '你' ? '' : value);
    setNameInput('');
  }

  async function save() {
    if (loading || saving) return;
    setSaving(true);
    setError('');
    try {
      const album = archiveCrop();
      const avatarPreset = 'preset' in album.choice ? album.choice.preset : undefined;
      const nextName = nameInput.trim() || name;
      const savedNames = rememberNickname(nicknames, nextName);
      await savePortrait('player', {
        avatarPreset: avatarPreset === 'classic' && !initial.customized ? undefined : avatarPreset,
        avatarPhoto: 'photo' in album.choice ? album.choice.photo : undefined,
        photos: album.photos.length ? album.photos : undefined,
        name: nextName && nextName !== '你' ? nextName : undefined,
        nicknames: savedNames.length ? savedNames : undefined,
      });
      close();
    } catch {
      setError('资料暂未保存，请再试一次。');
      setSaving(false);
    }
  }

  return <div className="portrait-mask" role="dialog" aria-modal="true" aria-labelledby="portrait-title"
    onKeyDown={event => {
      containRoyalDialogTab(event);
      if (event.key === 'Escape' && !saving) close();
      event.stopPropagation();
    }}>
    <section className="portrait-editor" aria-busy={saving || loading}>
      <header><h2 id="portrait-title">编辑个人资料</h2></header>
      <div className="portrait-editor-body">
        <div className="portrait-avatar-section">
          <h3>头像</h3>
          <div className="portrait-avatar-board">
            <div className="portrait-avatar-current">
              {image ? <PortraitCropCanvas className="portrait-preview" image={image} crop={crop} onCrop={setCrop}
                disabled={saving || loading}/> : <img className="portrait-preview" width="192" height="192" src={preview}
                alt="当前头像预览" draggable={false}/>}
              {image ? <p className="portrait-crop-hint">双指缩放 · 拖动调整</p> :
                <button type="button" className="portrait-default" aria-pressed={preset === 'classic'} disabled={saving}
                  onClick={() => selectAvatar({ preset: 'classic' })}>默认头像</button>}
            </div>
            <div className="portrait-preset-list" role="group" aria-label="内置头像">
              {PLAYER_AVATAR_PAIRS.map(pair => <div className="portrait-avatar-pair" key={pair.style}
                role="group" aria-label={pair.style}>
                <span className="portrait-pair-name" aria-hidden="true">{pair.style}</span>
                {pair.avatars.map(id => {
                  const option = PLAYER_AVATARS.find(avatar => avatar.id === id)!;
                  return <button key={id} type="button" aria-label={option.name} aria-pressed={id === preset}
                    disabled={saving} onClick={() => selectAvatar({ preset: id })}>
                    <img src={option.image} alt="" draggable={false}/>
                  </button>;
                })}
              </div>)}
            </div>
          </div>
          <div className="portrait-photo-actions" role="group" aria-label="我的照片">
            <label className="portrait-upload" title="上传自己的照片">
              <span aria-hidden="true">{loading ? '…' : '+'}</span>
              <input type="file" accept="image/*" aria-label="上传自己的照片" disabled={saving || loading} onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void choosePhoto(file);
              }}/>
            </label>
            {image && <span className="portrait-pending-photo" title="正在裁剪的照片"><img src={image.src} alt="正在裁剪的照片"/></span>}
            {photos.map((photo, index) => <button className="portrait-photo-option" key={index} type="button"
              aria-label={`个人头像 ${index + 1}`} aria-pressed={activePhoto === index} disabled={saving}
              onClick={() => selectAvatar({ photo: index })}><img src={photo} alt="" draggable={false}/></button>)}
          </div>
        </div>
        <div className="portrait-name">
          <h3>昵称</h3>
          <div className="portrait-name-options" role="group" aria-label="常用昵称">
            {['你', ...nicknamePresets].map(option => <button type="button" key={option} disabled={saving}
              aria-pressed={(name || '你') === option} onClick={() => selectNickname(option)}>{option}</button>)}
          </div>
          {nicknames.length > 0 && <div className="portrait-nickname-shelf" role="group" aria-label="自定义昵称">
            {nicknames.map(option => <button type="button" key={option} disabled={saving}
              aria-pressed={name === option} onClick={() => selectNickname(option)}>{option}</button>)}
          </div>}
          <div className="portrait-name-field">
            <input id="portrait-nickname" aria-label="添加自定义昵称" value={nameInput} placeholder="添加自定义昵称"
              disabled={saving} maxLength={12} onChange={event => setNameInput(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || !nameInput.trim()) return;
                event.preventDefault();
                selectNickname(nameInput.trim());
              }}/>
            <button type="button" disabled={saving || !nameInput.trim()} onClick={() => selectNickname(nameInput.trim())}>添加</button>
          </div>
        </div>
        {error && <p className="portrait-error" role="alert">{error}</p>}
      </div>
      <footer className="profile-dialog-actions">
        <button type="button" ref={cancelButton} onClick={close} disabled={saving}>取消</button>
        <button type="button" className="profile-dialog-save" onClick={() => void save()}
          disabled={saving || loading}>{saving ? '保存中…' : '保存'}</button>
      </footer>
    </section>
  </div>;
}
