import actorIdleUrl from '../assets/actor_idle.png';
import doorClosedUrl from '../assets/door_closed.png';
import doorOpenUrl from '../assets/door_open.png';
import inventoryKeyUrl from '../assets/inventory_key.png';
import keyUrl from '../assets/key.png';
import room1BgUrl from '../assets/room1_bg.png';
import signUrl from '../assets/sign.png';

export type AssetColorId = 'room2Text';

export type AssetImageId =
  | 'actorIdle'
  | 'doorClosed'
  | 'doorOpen'
  | 'inventoryKey'
  | 'key'
  | 'room1Bg'
  | 'sign';

const IMAGE_SOURCES: Record<AssetImageId, string> = {
  actorIdle: actorIdleUrl,
  doorClosed: doorClosedUrl,
  doorOpen: doorOpenUrl,
  inventoryKey: inventoryKeyUrl,
  key: keyUrl,
  room1Bg: room1BgUrl,
  sign: signUrl,
};

const SHOULD_TRIM: Record<AssetImageId, boolean> = {
  actorIdle: true,
  doorClosed: true,
  doorOpen: true,
  inventoryKey: true,
  key: true,
  room1Bg: false,
  sign: true,
};

export class AssetStore {
  private readonly palette: Record<AssetColorId, string> = {
    room2Text: '#f1faee',
  };

  constructor(private readonly images: Record<AssetImageId, HTMLImageElement | HTMLCanvasElement>) {}

  getColor(id: AssetColorId): string {
    return this.palette[id];
  }

  getImage(id: AssetImageId): HTMLImageElement | HTMLCanvasElement {
    return this.images[id];
  }

  getImageUrl(id: AssetImageId): string {
    return IMAGE_SOURCES[id];
  }
}

export async function createAssets(): Promise<AssetStore> {
  const entries = await Promise.all(
    (Object.entries(IMAGE_SOURCES) as [AssetImageId, string][]).map(async ([id, url]) => {
      const image = await loadImage(url);
      const prepared = SHOULD_TRIM[id] ? trimTransparentBounds(image) : image;
      return [id, prepared] as const;
    }),
  );

  const images = Object.fromEntries(entries) as Record<AssetImageId, HTMLImageElement | HTMLCanvasElement>;
  return new AssetStore(images);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function trimTransparentBounds(image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    return image;
  }

  sourceCtx.drawImage(image, 0, 0);
  const data = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;

  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const alpha = data[(y * sourceCanvas.width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return image;
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;

  const trimmedCtx = trimmedCanvas.getContext('2d');
  if (!trimmedCtx) {
    return image;
  }

  trimmedCtx.drawImage(
    sourceCanvas,
    minX,
    minY,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight,
  );

  return trimmedCanvas;
}
