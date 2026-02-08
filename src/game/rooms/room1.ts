import room1Json from './room1.json';
import room2Json from './room2.json';
import type {
  Hotspot,
  HotspotStateFlagMap,
  HotspotStatesConfig,
  HotspotStateVariant,
  HotspotSpriteConfig,
  HotspotSpriteFlagVariant,
  Point,
  Rect,
  RoomDefinition,
} from '../types';

export const room1: RoomDefinition = toRoomDefinition(room1Json);
export const room2: RoomDefinition = toRoomDefinition(room2Json);

export const rooms: Record<string, RoomDefinition> = {
  room1,
  room2,
};

export function isHotspotVisible(roomId: string, hotspotId: string, flags: Record<string, boolean>): boolean {
  if (roomId !== 'room1') {
    return true;
  }
  if (hotspotId === 'key' && flags.keyTaken) {
    return false;
  }
  return true;
}

function toRoomDefinition(raw: unknown): RoomDefinition {
  if (!isObject(raw)) {
    throw new Error('Invalid room config: expected object');
  }
  if (!isString(raw.id) || !isString(raw.name) || !isString(raw.backgroundColor)) {
    throw new Error('Invalid room config: id/name/backgroundColor must be strings');
  }
  if (!isNumber(raw.width) || !isNumber(raw.height)) {
    throw new Error(`Invalid room config (${raw.id}): width/height must be numbers`);
  }
  if (!Array.isArray(raw.hotspots)) {
    throw new Error(`Invalid room config (${raw.id}): hotspots must be an array`);
  }

  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    backgroundColor: raw.backgroundColor,
    hotspots: raw.hotspots.map(toHotspot),
    walkablePolygon: Array.isArray(raw.walkablePolygon) ? raw.walkablePolygon.map(toPoint) : undefined,
    perspective: isObject(raw.perspective)
      ? {
          farY: toNumber(raw.perspective.farY, 'perspective.farY'),
          nearY: toNumber(raw.perspective.nearY, 'perspective.nearY'),
          farScale: toNumber(raw.perspective.farScale, 'perspective.farScale'),
          nearScale: toNumber(raw.perspective.nearScale, 'perspective.nearScale'),
        }
      : undefined,
    overlayText: isString(raw.overlayText) ? raw.overlayText : undefined,
  };
}

function toHotspot(raw: unknown): Hotspot {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.name)) {
    throw new Error('Invalid hotspot: expected id and name');
  }
  return {
    id: raw.id,
    name: raw.name,
    description: isString(raw.description) ? raw.description : undefined,
    bounds: toRect(raw.bounds, 'bounds'),
    spriteBounds: raw.spriteBounds ? toRect(raw.spriteBounds, 'spriteBounds') : undefined,
    sprite: raw.sprite ? toHotspotSpriteConfig(raw.sprite) : undefined,
    stateFlags: raw.stateFlags ? toHotspotStateFlagMap(raw.stateFlags) : undefined,
    states: raw.states ? toHotspotStatesConfig(raw.states) : undefined,
    walkTarget: toPoint(raw.walkTarget),
  };
}

function toHotspotSpriteConfig(raw: unknown): HotspotSpriteConfig {
  if (!isObject(raw)) {
    throw new Error('Invalid hotspot sprite config: expected object');
  }
  const config: HotspotSpriteConfig = {};
  if (isString(raw.defaultImageId) && raw.defaultImageId.trim().length > 0) {
    config.defaultImageId = raw.defaultImageId;
  }
  if (Array.isArray(raw.flagVariants)) {
    config.flagVariants = raw.flagVariants.map(toHotspotSpriteFlagVariant);
  }
  return config;
}

function toHotspotSpriteFlagVariant(raw: unknown): HotspotSpriteFlagVariant {
  if (!isObject(raw) || !isString(raw.flag) || raw.flag.trim().length === 0) {
    throw new Error('Invalid hotspot sprite flag variant: expected non-empty "flag"');
  }
  return {
    flag: raw.flag,
    whenTrueImageId: isString(raw.whenTrueImageId) && raw.whenTrueImageId.trim().length > 0
      ? raw.whenTrueImageId
      : undefined,
    whenFalseImageId: isString(raw.whenFalseImageId) && raw.whenFalseImageId.trim().length > 0
      ? raw.whenFalseImageId
      : undefined,
  };
}

function toHotspotStateFlagMap(raw: unknown): HotspotStateFlagMap {
  if (!isObject(raw)) {
    throw new Error('Invalid hotspot stateFlags: expected object');
  }
  return {
    locked: toOptionalNonEmptyString(raw.locked),
    open: toOptionalNonEmptyString(raw.open),
    broken: toOptionalNonEmptyString(raw.broken),
    inspected: toOptionalNonEmptyString(raw.inspected),
  };
}

function toHotspotStatesConfig(raw: unknown): HotspotStatesConfig {
  if (!isObject(raw)) {
    throw new Error('Invalid hotspot states: expected object');
  }
  return {
    locked: raw.locked ? toHotspotStateVariant(raw.locked) : undefined,
    open: raw.open ? toHotspotStateVariant(raw.open) : undefined,
    broken: raw.broken ? toHotspotStateVariant(raw.broken) : undefined,
    inspected: raw.inspected ? toHotspotStateVariant(raw.inspected) : undefined,
  };
}

function toHotspotStateVariant(raw: unknown): HotspotStateVariant {
  if (!isObject(raw)) {
    throw new Error('Invalid hotspot state variant: expected object');
  }
  const dialogue = isObject(raw.dialogue) ? toStateDialogue(raw.dialogue) : undefined;
  return {
    spriteImageId: toOptionalNonEmptyString(raw.spriteImageId),
    dialogue,
  };
}

function toStateDialogue(raw: Record<string, unknown>): Partial<Record<'LOOK' | 'TALK' | 'PICK_UP' | 'USE' | 'OPEN' | 'DEFAULT', string>> {
  const dialogue: Partial<Record<'LOOK' | 'TALK' | 'PICK_UP' | 'USE' | 'OPEN' | 'DEFAULT', string>> = {};
  const keys: Array<'LOOK' | 'TALK' | 'PICK_UP' | 'USE' | 'OPEN' | 'DEFAULT'> = ['LOOK', 'TALK', 'PICK_UP', 'USE', 'OPEN', 'DEFAULT'];
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      dialogue[key] = value;
    }
  }
  return dialogue;
}

function toRect(raw: unknown, field: string): Rect {
  if (!isObject(raw)) {
    throw new Error(`Invalid hotspot ${field}: expected object`);
  }
  return {
    x: toNumber(raw.x, `${field}.x`),
    y: toNumber(raw.y, `${field}.y`),
    w: toNumber(raw.w, `${field}.w`),
    h: toNumber(raw.h, `${field}.h`),
  };
}

function toPoint(raw: unknown): Point {
  if (!isObject(raw)) {
    throw new Error('Invalid point: expected object');
  }
  return {
    x: toNumber(raw.x, 'point.x'),
    y: toNumber(raw.y, 'point.y'),
  };
}

function toNumber(value: unknown, field: string): number {
  if (!isNumber(value)) {
    throw new Error(`Invalid value for ${field}: expected number`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
