export type Verb = 'LOOK' | 'TALK' | 'PICK_UP' | 'USE' | 'OPEN';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hotspot {
  id: string;
  name: string;
  description?: string;
  bounds: Rect;
  spriteBounds?: Rect;
  sprite?: HotspotSpriteConfig;
  stateFlags?: HotspotStateFlagMap;
  states?: HotspotStatesConfig;
  walkTarget: Point;
}

export interface HotspotSpriteConfig {
  defaultImageId?: string;
  flagVariants?: HotspotSpriteFlagVariant[];
}

export interface HotspotSpriteFlagVariant {
  flag: string;
  whenTrueImageId?: string;
  whenFalseImageId?: string;
}

export interface HotspotStateVariant {
  spriteImageId?: string;
  dialogue?: Partial<Record<Verb | 'DEFAULT', string>>;
}

export interface HotspotStatesConfig {
  locked?: HotspotStateVariant;
  open?: HotspotStateVariant;
  broken?: HotspotStateVariant;
  inspected?: HotspotStateVariant;
}

export interface HotspotStateFlagMap {
  locked?: string;
  open?: string;
  broken?: string;
  inspected?: string;
}

export interface RoomDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  hotspots: Hotspot[];
  scripts?: RoomScriptRule[];
  walkablePolygon?: Point[];
  perspective?: {
    farY: number;
    nearY: number;
    farScale: number;
    nearScale: number;
  };
  overlayText?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
}

export interface PendingInteraction {
  hotspotId: string;
  walkTarget: Point;
  verb: Verb | null;
  inventoryItemId: string | null;
}

export interface ScriptResult {
  dialogueLines: string[];
  setFlags?: Record<string, boolean>;
  addInventoryItem?: InventoryItem;
  removeInventoryItemId?: string;
  roomChangeTo?: string;
  clearSelectedInventory?: boolean;
}

export interface RoomScriptRule {
  hotspotId: string;
  verb: Verb;
  inventoryItemId?: string;
  requireNoInventoryItem?: boolean;
  conditions?: {
    flagsAll?: string[];
    flagsAny?: string[];
    flagsNot?: string[];
  };
  result: ScriptResult;
}



