import type { GameEvent } from '../game/stateMachine';
import type { Hotspot, Point } from '../game/types';

interface InputControllerOptions {
  canvas: HTMLCanvasElement;
  getHotspots: () => Hotspot[];
  sendEvent: (event: GameEvent) => void;
  canProcessInteraction?: () => boolean;
  onCanvasClick?: (point: Point, hotspot: Hotspot | null, event: MouseEvent) => void;
  onPointerMove?: (point: Point | null, hotspot: Hotspot | null) => void;
}

export interface InputController {
  destroy: () => void;
  getHoveredHotspotId: () => string | null;
}

export function createInputController(options: InputControllerOptions): InputController {
  let hoveredHotspotId: string | null = null;

  const onPointerMove = (event: PointerEvent): void => {
    const point = toCanvasPoint(event, options.canvas);
    const hotspot = point ? hitTestHotspot(point, options.getHotspots()) : null;
    options.onPointerMove?.(point, hotspot);
    const nextHoveredId = hotspot?.id ?? null;

    if (nextHoveredId !== hoveredHotspotId) {
      hoveredHotspotId = nextHoveredId;
      options.sendEvent({ type: 'HOTSPOT_HOVERED', hotspotId: hoveredHotspotId });
    }
  };

  const onPointerLeave = (): void => {
    options.onPointerMove?.(null, null);
    if (hoveredHotspotId !== null) {
      hoveredHotspotId = null;
      options.sendEvent({ type: 'HOTSPOT_HOVERED', hotspotId: null });
    }
  };

  const onClick = (event: MouseEvent): void => {
    const point = toCanvasPoint(event, options.canvas);
    if (!point) {
      return;
    }

    const hotspot = hitTestHotspot(point, options.getHotspots());
    options.onCanvasClick?.(point, hotspot, event);

    if (options.canProcessInteraction && !options.canProcessInteraction()) {
      return;
    }

    if (!hotspot) {
      return;
    }

    options.sendEvent({
      type: 'HOTSPOT_CLICKED',
      hotspotId: hotspot.id,
      walkTarget: hotspot.walkTarget,
    });
  };

  options.canvas.addEventListener('pointermove', onPointerMove);
  options.canvas.addEventListener('pointerleave', onPointerLeave);
  options.canvas.addEventListener('click', onClick);

  return {
    destroy: (): void => {
      options.canvas.removeEventListener('pointermove', onPointerMove);
      options.canvas.removeEventListener('pointerleave', onPointerLeave);
      options.canvas.removeEventListener('click', onClick);
    },
    getHoveredHotspotId: (): string | null => hoveredHotspotId,
  };
}

function toCanvasPoint(event: MouseEvent | PointerEvent, canvas: HTMLCanvasElement): Point | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    return null;
  }

  return { x, y };
}

function hitTestHotspot(point: Point, hotspots: Hotspot[]): Hotspot | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const hotspot = hotspots[i];
    const { x, y, w, h } = hotspot.bounds;
    const inside = point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
    if (inside) {
      return hotspot;
    }
  }

  return null;
}
