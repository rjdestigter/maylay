import type { AssetStore } from './assets';
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
  debugHotspots: boolean;
  flags: Record<string, boolean>;
  hoveredHotspotId: string | null;
  devEditor: {
    enabled: boolean;
    selectedHotspotId: string | null;
    editTarget: 'bounds' | 'spriteBounds' | 'walkTarget';
  };
}

export class Renderer {
  readonly width = 320;
  readonly height = 180;

  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assets: AssetStore) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to get 2D rendering context');
    }

    this.ctx = ctx;
  }

  render(params: RenderParams): void {
    const { room, actor, hotspots, debugHotspots, flags, hoveredHotspotId, devEditor } = params;
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
      this.drawDevOverlay(hotspots, devEditor.selectedHotspotId, devEditor.editTarget);
    }

    if (room.overlayText) {
      this.ctx.fillStyle = this.assets.getColor('room2Text');
      this.ctx.font = '12px monospace';
      this.ctx.fillText(room.overlayText, 18, 26);
    }
  }

  private drawActor(actor: ActorRenderState): void {
    const sprite = this.assets.getImage('actorIdle');
    const clampedWidth = Math.max(8, Math.round(actor.width));
    const clampedHeight = Math.max(8, Math.round(actor.height));

    const walkSine = actor.isWalking ? Math.sin(actor.walkCycle * Math.PI * 2) : 0;
    const bobOffsetY = actor.isWalking ? Math.round(Math.max(0, walkSine) * 2) : 0;
    const widthPulse = actor.isWalking ? Math.round(Math.sin(actor.walkCycle * Math.PI * 4) * 1.2) : 0;
    const drawWidth = Math.max(8, clampedWidth + widthPulse);
    const drawHeight = Math.max(8, clampedHeight - Math.abs(widthPulse));

    const centerX = Math.round(actor.x);
    const feetY = Math.round(actor.y) - bobOffsetY;
    const drawX = centerX - Math.floor(drawWidth / 2);
    const drawY = feetY - drawHeight;

    this.ctx.save();
    if (actor.facing === 'left') {
      this.ctx.translate(centerX, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(sprite, -Math.floor(drawWidth / 2), drawY, drawWidth, drawHeight);
    } else {
      this.ctx.drawImage(sprite, drawX, drawY, drawWidth, drawHeight);
    }
    this.ctx.restore();
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
    selectedHotspotId: string | null,
    editTarget: 'bounds' | 'spriteBounds' | 'walkTarget',
  ): void {
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
  }
}
