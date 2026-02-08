import type { AssetStore, CharacterAnimationId } from './assets';
import type { Hotspot, RoomDefinition } from '../game/types';

export interface ActorRenderState {
  x: number;
  y: number;
  width: number;
  height: number;
  facing: 'left' | 'right';
  isWalking: boolean;
  walkCycle: number;
}

export interface RenderParams {
  room: RoomDefinition;
  actor: ActorRenderState;
  hotspots: Hotspot[];
  walkablePolygon?: { x: number; y: number }[];
  debugHotspots: boolean;
  flags: Record<string, boolean>;
  hoveredHotspotId: string | null;
  devEditor: {
    enabled: boolean;
    selectedHotspotId: string | null;
    editTarget: 'bounds' | 'spriteBounds' | 'walkTarget' | 'walkablePolygon' | 'perspective';
    perspective?: {
      farY: number;
      nearY: number;
      farScale: number;
      nearScale: number;
    };
    actorBaseSize?: {
      width: number;
      height: number;
    };
    actorFeetY?: number;
  };
}

export class Renderer {
  readonly width = 320;
  readonly height = 180;
  private readonly lpcFrameWidth = 64;
  private readonly lpcFrameHeight = 64;
  private readonly lpcSideRow = 1;

  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assets: AssetStore) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to get 2D rendering context');
    }

    this.ctx = ctx;
  }

  render(params: RenderParams): void {
    const { room, actor, hotspots, walkablePolygon, debugHotspots, flags, hoveredHotspotId, devEditor } = params;
    this.ctx.imageSmoothingEnabled = false;

    if (room.id === 'room1') {
      this.ctx.drawImage(this.assets.getImage('room1Bg'), 0, 0, this.width, this.height);
    } else {
      this.ctx.fillStyle = room.backgroundColor;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    for (const hotspot of hotspots) {
      this.drawHotspotSprite(hotspot, flags);

      if (hoveredHotspotId === hotspot.id) {
        this.ctx.strokeStyle = '#ffe66d';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(hotspot.bounds.x, hotspot.bounds.y, hotspot.bounds.w, hotspot.bounds.h);
      }

      if (debugHotspots) {
        this.ctx.strokeStyle = '#0b0b0b';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(hotspot.bounds.x, hotspot.bounds.y, hotspot.bounds.w, hotspot.bounds.h);
      }
    }

    this.drawActor(actor);

    if (devEditor.enabled) {
      this.drawDevOverlay(
        hotspots,
        walkablePolygon,
        devEditor.selectedHotspotId,
        devEditor.editTarget,
        devEditor.perspective,
        devEditor.actorBaseSize,
        devEditor.actorFeetY,
      );
    }

    if (room.overlayText) {
      this.ctx.fillStyle = this.assets.getColor('room2Text');
      this.ctx.font = '12px monospace';
      this.ctx.fillText(room.overlayText, 18, 26);
    }
  }

  private drawActor(actor: ActorRenderState): void {
    const clampedWidth = Math.max(8, Math.round(actor.width));
    const clampedHeight = Math.max(8, Math.round(actor.height));
    const centerX = Math.round(actor.x);
    const feetY = Math.round(actor.y);
    const drawX = centerX - Math.floor(clampedWidth / 2);
    const drawY = feetY - clampedHeight;

    const animationId: CharacterAnimationId = actor.isWalking ? 'walk' : 'idle';
    const layers = this.assets.getCharacterAnimationLayers(animationId);
    if (layers.length === 0) {
      const fallback = this.assets.getImage('actorIdle');
      this.ctx.drawImage(fallback, drawX, drawY, clampedWidth, clampedHeight);
      return;
    }

    const frameCol = this.getLpcFrameColumn(animationId, actor.walkCycle);
    const frameRow = this.lpcSideRow;
    const sx = frameCol * this.lpcFrameWidth;
    const sy = frameRow * this.lpcFrameHeight;
    const shouldFlip = actor.facing === 'right';

    this.ctx.save();
    if (shouldFlip) {
      this.ctx.translate(centerX, 0);
      this.ctx.scale(-1, 1);
    }

    for (const layer of layers) {
      this.ctx.drawImage(
        layer.image,
        sx,
        sy,
        this.lpcFrameWidth,
        this.lpcFrameHeight,
        shouldFlip ? -Math.floor(clampedWidth / 2) : drawX,
        drawY,
        clampedWidth,
        clampedHeight,
      );
    }
    this.ctx.restore();
  }

  private getLpcFrameColumn(animationId: CharacterAnimationId, walkCycle: number): number {
    if (animationId === 'walk') {
      const walkFrames = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const index = Math.floor(walkCycle * walkFrames.length) % walkFrames.length;
      return walkFrames[index];
    }

    // Subtle idle loop that avoids sparse/empty LPC columns in some exports.
    const idleFrames = [0, 1, 0, 1];
    const index = Math.floor(walkCycle * idleFrames.length) % idleFrames.length;
    return idleFrames[index];
  }

  private drawHotspotSprite(hotspot: Hotspot, flags: Record<string, boolean>): void {
    const spriteBounds = hotspot.spriteBounds ?? hotspot.bounds;

    switch (hotspot.id) {
      case 'door': {
        const sprite = flags.doorOpen ? this.assets.getImage('doorOpen') : this.assets.getImage('doorClosed');
        this.ctx.drawImage(sprite, spriteBounds.x, spriteBounds.y, spriteBounds.w, spriteBounds.h);
        return;
      }
      case 'sign': {
        const sprite = this.assets.getImage('sign');
        this.ctx.drawImage(sprite, spriteBounds.x, spriteBounds.y, spriteBounds.w, spriteBounds.h);
        return;
      }
      case 'key': {
        const sprite = this.assets.getImage('key');
        this.ctx.drawImage(sprite, spriteBounds.x, spriteBounds.y, spriteBounds.w, spriteBounds.h);
        return;
      }
      default:
        return;
    }
  }

  private drawDevOverlay(
    hotspots: Hotspot[],
    walkablePolygon: { x: number; y: number }[] | undefined,
    selectedHotspotId: string | null,
    editTarget: 'bounds' | 'spriteBounds' | 'walkTarget' | 'walkablePolygon' | 'perspective',
    perspective: { farY: number; nearY: number; farScale: number; nearScale: number } | undefined,
    actorBaseSize: { width: number; height: number } | undefined,
    actorFeetY: number | undefined,
  ): void {
    if (walkablePolygon && walkablePolygon.length > 0) {
      this.ctx.beginPath();
      this.ctx.moveTo(walkablePolygon[0].x, walkablePolygon[0].y);
      for (let i = 1; i < walkablePolygon.length; i += 1) {
        this.ctx.lineTo(walkablePolygon[i].x, walkablePolygon[i].y);
      }
      if (walkablePolygon.length >= 3) {
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(126, 242, 154, 0.14)';
        this.ctx.fill();
      }
      this.ctx.strokeStyle = editTarget === 'walkablePolygon' ? '#ff5ca2' : '#7ef29a';
      this.ctx.lineWidth = editTarget === 'walkablePolygon' ? 2 : 1;
      this.ctx.stroke();
      this.ctx.lineWidth = 1;

      for (const vertex of walkablePolygon) {
        this.ctx.fillStyle = editTarget === 'walkablePolygon' ? '#ff5ca2' : '#7ef29a';
        this.ctx.fillRect(vertex.x - 1, vertex.y - 1, 3, 3);
      }
    }

    for (const hotspot of hotspots) {
      const spriteBounds = hotspot.spriteBounds ?? hotspot.bounds;

      this.ctx.strokeStyle = '#39c5ff';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(spriteBounds.x, spriteBounds.y, spriteBounds.w, spriteBounds.h);

      this.ctx.strokeStyle = '#7ef29a';
      this.ctx.beginPath();
      this.ctx.moveTo(hotspot.walkTarget.x - 3, hotspot.walkTarget.y);
      this.ctx.lineTo(hotspot.walkTarget.x + 3, hotspot.walkTarget.y);
      this.ctx.moveTo(hotspot.walkTarget.x, hotspot.walkTarget.y - 3);
      this.ctx.lineTo(hotspot.walkTarget.x, hotspot.walkTarget.y + 3);
      this.ctx.stroke();

      if (hotspot.id !== selectedHotspotId) {
        continue;
      }

      this.ctx.strokeStyle = '#ff5ca2';
      this.ctx.lineWidth = 2;
      if (editTarget === 'walkTarget') {
        this.ctx.beginPath();
        this.ctx.arc(hotspot.walkTarget.x, hotspot.walkTarget.y, 5, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        const selectedRect = editTarget === 'spriteBounds' ? spriteBounds : hotspot.bounds;
        this.ctx.strokeRect(selectedRect.x, selectedRect.y, selectedRect.w, selectedRect.h);
      }
      this.ctx.lineWidth = 1;
    }

    if (editTarget === 'perspective' && perspective && actorBaseSize && typeof actorFeetY === 'number') {
      this.drawPerspectiveOverlay(perspective, actorBaseSize, actorFeetY);
    }
  }

  private drawPerspectiveOverlay(
    perspective: { farY: number; nearY: number; farScale: number; nearScale: number },
    actorBaseSize: { width: number; height: number },
    actorFeetY: number,
  ): void {
    const farY = Math.round(perspective.farY);
    const nearY = Math.round(perspective.nearY);

    this.ctx.save();
    this.ctx.setLineDash([3, 2]);
    this.ctx.strokeStyle = '#7ec8ff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, farY);
    this.ctx.lineTo(this.width, farY);
    this.ctx.stroke();

    this.ctx.strokeStyle = '#ffd36e';
    this.ctx.beginPath();
    this.ctx.moveTo(0, nearY);
    this.ctx.lineTo(this.width, nearY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    const rulerX = this.width - 18;
    this.ctx.strokeStyle = '#f7f7f7';
    this.ctx.beginPath();
    this.ctx.moveTo(rulerX, farY);
    this.ctx.lineTo(rulerX, nearY);
    this.ctx.stroke();

    this.ctx.fillStyle = '#7ec8ff';
    this.ctx.fillRect(rulerX - 2, farY - 2, 4, 4);
    this.ctx.fillStyle = '#ffd36e';
    this.ctx.fillRect(rulerX - 2, nearY - 2, 4, 4);

    const farH = Math.round(actorBaseSize.height * perspective.farScale);
    const nearH = Math.round(actorBaseSize.height * perspective.nearScale);
    const farW = Math.round(actorBaseSize.width * perspective.farScale);
    const nearW = Math.round(actorBaseSize.width * perspective.nearScale);
    const sampleX = 14;

    this.ctx.strokeStyle = 'rgba(126, 200, 255, 0.95)';
    this.ctx.strokeRect(sampleX, farY - farH, farW, farH);
    this.ctx.strokeStyle = 'rgba(255, 211, 110, 0.95)';
    this.ctx.strokeRect(sampleX + farW + 4, nearY - nearH, nearW, nearH);

    const tRaw = (actorFeetY - perspective.farY) / ((perspective.nearY - perspective.farY) || 0.0001);
    const t = Math.max(0, Math.min(1, tRaw));
    const currentScale = perspective.farScale + (perspective.nearScale - perspective.farScale) * t;
    const currentH = Math.round(actorBaseSize.height * currentScale);
    const currentW = Math.round(actorBaseSize.width * currentScale);
    const currentX = Math.round(this.width * 0.5 - currentW * 0.5);
    const currentY = Math.round(actorFeetY);

    this.ctx.strokeStyle = 'rgba(255, 92, 162, 0.95)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(currentX, currentY - currentH, currentW, currentH);
    this.ctx.lineWidth = 1;

    this.ctx.fillStyle = '#f7f7f7';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(`farY ${farY}`, 4, Math.max(10, farY - 4));
    this.ctx.fillText(`nearY ${nearY}`, 4, Math.max(10, nearY - 4));
    this.ctx.fillText(`scale ${currentScale.toFixed(2)}x`, currentX + 2, Math.max(10, currentY - currentH - 3));
    this.ctx.restore();
  }
}
