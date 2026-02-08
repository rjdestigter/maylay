export type Verb = 'LOOK' | 'TALK' | 'PICK_UP' | 'USE';

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
  bounds: Rect;
  spriteBounds?: Rect;
  walkTarget: Point;
}

export interface RoomDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  hotspots: Hotspot[];
  overlayText?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
}

export interface PendingInteraction {
  hotspotId: string;
  walkTarget: Point;
  verb: Verb;
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
