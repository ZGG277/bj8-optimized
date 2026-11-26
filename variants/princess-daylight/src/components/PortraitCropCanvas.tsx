import { useEffect, useRef, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { cropSquare, moveCrop, type Crop, type CropPoint } from '../input/portrait-crop';

const avatarSize = 192;
const center = { x: .5, y: .5 };

export function loadPortraitImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject();
    image.onerror = () => reject();
    image.src = src;
  });
}

export async function readPortraitPhoto(file: File) {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject();
    reader.readAsDataURL(file);
  });
  return loadPortraitImage(src);
}

function photoSize(image: HTMLImageElement) {
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function drawCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, crop: Crop) {
  const { left, top, side } = cropSquare(crop, photoSize(image));
  ctx.drawImage(image, left, top, side, side, 0, 0, avatarSize, avatarSize);
}

export function exportPortraitCrop(image: HTMLImageElement, crop: Crop, round = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = avatarSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('照片裁剪失败，请再试一次。');
  if (round) {
    ctx.beginPath();
    ctx.arc(96, 96, 96, 0, 2 * Math.PI);
    ctx.clip();
  }
  drawCrop(ctx, image, crop);
  return canvas.toDataURL('image/webp', .84);
}

function fingerCenter([first, second]: CropPoint[]) {
  return second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first;
}

function fingerDistance([first, second]: CropPoint[]) {
  return second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

export function PortraitCropCanvas({ image, crop, onCrop, disabled, className }: {
  image: HTMLImageElement;
  crop: Crop;
  onCrop: Dispatch<SetStateAction<Crop>>;
  disabled?: boolean;
  className: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fingers = useRef(new Map<number, CropPoint>());
  useEffect(() => { fingers.current.clear(); }, [image]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, avatarSize, avatarSize);
    drawCrop(ctx, image, crop);
  }, [image, crop]);

  function pointerPoint(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function stop(event: PointerEvent<HTMLCanvasElement>) {
    fingers.current.delete(event.pointerId);
  }

  return <canvas className={className} width={avatarSize} height={avatarSize} ref={canvas} tabIndex={0}
    aria-label="照片裁剪预览，双指缩放，拖动调整，键盘加减也可缩放"
    onPointerDown={event => {
      if (disabled || fingers.current.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
      fingers.current.set(event.pointerId, pointerPoint(event));
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (disabled || !fingers.current.has(event.pointerId)) return;
      const before = [...fingers.current.values()];
      fingers.current.set(event.pointerId, pointerPoint(event));
      const after = [...fingers.current.values()];
      const distance = fingerDistance(before);
      const ratio = distance > .04 ? fingerDistance(after) / distance : 1;
      onCrop(current => moveCrop(current, photoSize(image), fingerCenter(before), fingerCenter(after), ratio));
    }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={event => {
      if (disabled || !['+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      onCrop(current => moveCrop(current, photoSize(image), center, center, event.key === '-' ? 1 / 1.15 : 1.15));
    }}/>;
}
