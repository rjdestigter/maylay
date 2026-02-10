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
  targetRoomId?: string;
  targetRoomEntryPoint?: Point;
  walkPrompt?: string;
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
  interactionChart?: RoomInteractionChart;
  parallelStateChart?: RoomParallelStateChart;
  xstateChart?: RoomXStateChartDefinition;
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
  dialogueOptions?: DialogueOption[];
}

export interface DialogueOption {
  id: string;
  text: string;
  result: ScriptResult;
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

export interface RoomInteractionChart {
  initialState: string;
  states: RoomInteractionChartState[];
}

export interface RoomInteractionChartState {
  id: string;
  transitions: RoomInteractionTransition[];
}

export interface RoomInteractionTransition {
  hotspotId: string;
  verb: Verb;
  inventoryItemId?: string;
  requireNoInventoryItem?: boolean;
  conditions?: {
    flagsAll?: string[];
    flagsAny?: string[];
    flagsNot?: string[];
  };
  toState?: string;
  result: ScriptResult;
}

export interface RoomParallelStateChart {
  initialStates: Record<string, string>;
  transitions: RoomParallelTransition[];
}

export interface RoomParallelTransition {
  hotspotId: string;
  verb: Verb;
  inventoryItemId?: string;
  requireNoInventoryItem?: boolean;
  when?: {
    nodeStatesAll?: Record<string, string>;
    flagsAll?: string[];
    flagsAny?: string[];
    flagsNot?: string[];
  };
  setNodeStates?: Record<string, string>;
  result: ScriptResult;
}

export type RoomXStateChartDefinition = Record<string, unknown>;



