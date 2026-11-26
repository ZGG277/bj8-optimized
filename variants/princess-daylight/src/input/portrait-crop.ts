export type Crop = { x: number; y: number; zoom: number };
export type CropPoint = { x: number; y: number };
type ImageSize = { width: number; height: number };

export const defaultCrop: Crop = { x: .5, y: .5, zoom: 1 };

export function restoreCrop(value?: Crop): Crop {
  if (!value || ![value.x, value.y, value.zoom].every(Number.isFinite)) return defaultCrop;
  return {
    x: Math.max(0, Math.min(1, value.x)),
    y: Math.max(0, Math.min(1, value.y)),
    zoom: Math.max(1, Math.min(4, value.zoom)),
  };
}

export function cropSquare(crop: Crop, { width, height }: ImageSize) {
  const side = Math.min(width, height) / crop.zoom;
  return {
    side,
    left: Math.max(0, Math.min(width - side, crop.x * width - side / 2)),
    top: Math.max(0, Math.min(height - side, crop.y * height - side / 2)),
  };
}

/** Keep the photo point under the fingers while translating and scaling the square. */
export function moveCrop(crop: Crop, image: ImageSize, from: CropPoint, to: CropPoint, ratio = 1): Crop {
  const zoom = Math.max(1, Math.min(4, crop.zoom * ratio));
  const old = cropSquare(crop, image);
  const side = Math.min(image.width, image.height) / zoom;
  const next = cropSquare({
    x: (old.left + from.x * old.side + (.5 - to.x) * side) / image.width,
    y: (old.top + from.y * old.side + (.5 - to.y) * side) / image.height,
    zoom,
  }, image);
  return { x: (next.left + side / 2) / image.width, y: (next.top + side / 2) / image.height, zoom };
}
