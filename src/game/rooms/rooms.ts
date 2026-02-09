import type {
  Hotspot,
  HotspotStateFlagMap,
  HotspotStatesConfig,
  HotspotStateVariant,
  HotspotSpriteConfig,
  HotspotSpriteFlagVariant,
  RoomParallelStateChart,
  RoomParallelTransition,
  RoomInteractionChart,
  RoomInteractionChartState,
  RoomInteractionTransition,
  Point,
  Rect,
  RoomScriptRule,
  RoomDefinition,
} from '../types';

export const rooms: Record<string, RoomDefinition> = loadRoomsFromJson();
export const defaultRoomId: string = resolveDefaultRoomId(rooms);

export function isHotspotVisible(roomId: string, hotspotId: string, flags: Record<string, boolean>): boolean {
  if (roomId !== 'room1') {
    return true;
  }
  if (hotspotId === 'key' && flags.keyTaken) {
    return false;
  }
  return true;
}

function loadRoomsFromJson(): Record<string, RoomDefinition> {
  const roomModules = import.meta.glob('./*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;
  const loadedRooms: Record<string, RoomDefinition> = {};

  const sortedEntries = Object.entries(roomModules).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  for (const [modulePath, moduleValue] of sortedEntries) {
    const room = toRoomDefinition(moduleValue);
    if (loadedRooms[room.id]) {
      throw new Error(`Duplicate room id "${room.id}" in ${modulePath}`);
    }
    loadedRooms[room.id] = room;
  }

  return loadedRooms;
}

function resolveDefaultRoomId(loadedRooms: Record<string, RoomDefinition>): string {
  const roomIds = Object.keys(loadedRooms);
  if (roomIds.length === 0) {
    throw new Error('No room configuration files were loaded from src/game/rooms/*.json');
  }
  if (loadedRooms.room1) {
    return 'room1';
  }
  return roomIds[0];
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
    scripts: Array.isArray(raw.scripts) ? raw.scripts.map(toRoomScriptRule) : undefined,
    interactionChart: raw.interactionChart ? toRoomInteractionChart(raw.interactionChart) : undefined,
    parallelStateChart: raw.parallelStateChart ? toRoomParallelStateChart(raw.parallelStateChart) : undefined,
    xstateChart: isObject(raw.xstateChart) ? raw.xstateChart : undefined,
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

function toRoomParallelStateChart(raw: unknown): RoomParallelStateChart {
  if (!isObject(raw) || !isObject(raw.initialStates) || !Array.isArray(raw.transitions)) {
    throw new Error('Invalid room parallelStateChart: expected initialStates and transitions[]');
  }
  const initialStates: Record<string, string> = {};
  for (const [nodeId, stateId] of Object.entries(raw.initialStates)) {
    if (typeof nodeId !== 'string' || nodeId.trim().length === 0 || typeof stateId !== 'string' || stateId.trim().length === 0) {
      throw new Error('Invalid room parallelStateChart.initialStates entry');
    }
    initialStates[nodeId.trim()] = stateId.trim();
  }
  return {
    initialStates,
    transitions: raw.transitions.map(toRoomParallelTransition),
  };
}

function toRoomParallelTransition(raw: unknown): RoomParallelTransition {
  if (!isObject(raw) || !isString(raw.hotspotId) || !isVerb(raw.verb)) {
    throw new Error('Invalid room parallelStateChart transition: expected hotspotId and verb');
  }
  if (!isObject(raw.result) || !Array.isArray(raw.result.dialogueLines)) {
    throw new Error(`Invalid room parallelStateChart transition (${raw.hotspotId}): result.dialogueLines must be an array`);
  }
  const dialogueLines = raw.result.dialogueLines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => line.trim());

  const whenNodeStatesAll = isObject(raw.when) && isObject(raw.when.nodeStatesAll)
    ? toNodeStateRecord(raw.when.nodeStatesAll)
    : undefined;

  const setNodeStates = isObject(raw.setNodeStates) ? toNodeStateRecord(raw.setNodeStates) : undefined;

  return {
    hotspotId: raw.hotspotId,
    verb: raw.verb,
    inventoryItemId: toOptionalNonEmptyString(raw.inventoryItemId),
    requireNoInventoryItem: raw.requireNoInventoryItem === true,
    when: isObject(raw.when)
      ? {
          nodeStatesAll: whenNodeStatesAll,
          flagsAll: toStringArray(raw.when.flagsAll),
          flagsAny: toStringArray(raw.when.flagsAny),
          flagsNot: toStringArray(raw.when.flagsNot),
        }
      : undefined,
    setNodeStates,
    result: {
      dialogueLines,
      setFlags: isObject(raw.result.setFlags) ? toBooleanRecord(raw.result.setFlags) : undefined,
      addInventoryItem: isObject(raw.result.addInventoryItem)
        ? toInventoryItem(raw.result.addInventoryItem)
        : undefined,
      removeInventoryItemId: toOptionalNonEmptyString(raw.result.removeInventoryItemId),
      roomChangeTo: toOptionalNonEmptyString(raw.result.roomChangeTo),
      clearSelectedInventory: raw.result.clearSelectedInventory === true,
    },
  };
}

function toNodeStateRecord(raw: Record<string, unknown>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [nodeId, stateId] of Object.entries(raw)) {
    if (typeof nodeId !== 'string' || nodeId.trim().length === 0 || typeof stateId !== 'string' || stateId.trim().length === 0) {
      continue;
    }
    next[nodeId.trim()] = stateId.trim();
  }
  return next;
}

function toRoomInteractionChart(raw: unknown): RoomInteractionChart {
  if (!isObject(raw) || !isString(raw.initialState) || !Array.isArray(raw.states)) {
    throw new Error('Invalid room interactionChart: expected initialState and states[]');
  }
  const states = raw.states.map(toRoomInteractionChartState);
  if (!states.some((state) => state.id === raw.initialState)) {
    throw new Error(`Invalid room interactionChart: missing initial state "${raw.initialState}"`);
  }
  return {
    initialState: raw.initialState,
    states,
  };
}

function toRoomInteractionChartState(raw: unknown): RoomInteractionChartState {
  if (!isObject(raw) || !isString(raw.id) || !Array.isArray(raw.transitions)) {
    throw new Error('Invalid room interactionChart state: expected id and transitions[]');
  }
  return {
    id: raw.id,
    transitions: raw.transitions.map(toRoomInteractionTransition),
  };
}

function toRoomInteractionTransition(raw: unknown): RoomInteractionTransition {
  if (!isObject(raw) || !isString(raw.hotspotId) || !isVerb(raw.verb)) {
    throw new Error('Invalid room interactionChart transition: expected hotspotId and verb');
  }
  if (!isObject(raw.result) || !Array.isArray(raw.result.dialogueLines)) {
    throw new Error(`Invalid room interactionChart transition (${raw.hotspotId}): result.dialogueLines must be an array`);
  }
  const dialogueLines = raw.result.dialogueLines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => line.trim());
  return {
    hotspotId: raw.hotspotId,
    verb: raw.verb,
    inventoryItemId: toOptionalNonEmptyString(raw.inventoryItemId),
    requireNoInventoryItem: raw.requireNoInventoryItem === true,
    conditions: isObject(raw.conditions)
      ? {
          flagsAll: toStringArray(raw.conditions.flagsAll),
          flagsAny: toStringArray(raw.conditions.flagsAny),
          flagsNot: toStringArray(raw.conditions.flagsNot),
        }
      : undefined,
    toState: toOptionalNonEmptyString(raw.toState),
    result: {
      dialogueLines,
      setFlags: isObject(raw.result.setFlags) ? toBooleanRecord(raw.result.setFlags) : undefined,
      addInventoryItem: isObject(raw.result.addInventoryItem)
        ? toInventoryItem(raw.result.addInventoryItem)
        : undefined,
      removeInventoryItemId: toOptionalNonEmptyString(raw.result.removeInventoryItemId),
      roomChangeTo: toOptionalNonEmptyString(raw.result.roomChangeTo),
      clearSelectedInventory: raw.result.clearSelectedInventory === true,
    },
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
    targetRoomId: toOptionalNonEmptyString(raw.targetRoomId),
    targetRoomEntryPoint: raw.targetRoomEntryPoint ? toPoint(raw.targetRoomEntryPoint) : undefined,
    walkPrompt: toOptionalNonEmptyString(raw.walkPrompt),
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

function toRoomScriptRule(raw: unknown): RoomScriptRule {
  if (!isObject(raw) || !isString(raw.hotspotId)) {
    throw new Error('Invalid room script rule: expected hotspotId');
  }
  if (!isVerb(raw.verb)) {
    throw new Error(`Invalid room script rule (${raw.hotspotId}): invalid verb`);
  }
  if (!isObject(raw.result) || !Array.isArray(raw.result.dialogueLines)) {
    throw new Error(`Invalid room script rule (${raw.hotspotId}): result.dialogueLines must be an array`);
  }
  const dialogueLines = raw.result.dialogueLines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => line.trim());
  return {
    hotspotId: raw.hotspotId,
    verb: raw.verb,
    inventoryItemId: toOptionalNonEmptyString(raw.inventoryItemId),
    requireNoInventoryItem: raw.requireNoInventoryItem === true,
    conditions: isObject(raw.conditions)
      ? {
          flagsAll: toStringArray(raw.conditions.flagsAll),
          flagsAny: toStringArray(raw.conditions.flagsAny),
          flagsNot: toStringArray(raw.conditions.flagsNot),
        }
      : undefined,
    result: {
      dialogueLines,
      setFlags: isObject(raw.result.setFlags) ? toBooleanRecord(raw.result.setFlags) : undefined,
      addInventoryItem: isObject(raw.result.addInventoryItem)
        ? toInventoryItem(raw.result.addInventoryItem)
        : undefined,
      removeInventoryItemId: toOptionalNonEmptyString(raw.result.removeInventoryItemId),
      roomChangeTo: toOptionalNonEmptyString(raw.result.roomChangeTo),
      clearSelectedInventory: raw.result.clearSelectedInventory === true,
    },
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

function isVerb(value: unknown): value is 'LOOK' | 'TALK' | 'PICK_UP' | 'USE' | 'OPEN' {
  return value === 'LOOK' || value === 'TALK' || value === 'PICK_UP' || value === 'USE' || value === 'OPEN';
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const next = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return next.length > 0 ? next : undefined;
}

function toBooleanRecord(value: Record<string, unknown>): Record<string, boolean> | undefined {
  const next: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean' && key.trim().length > 0) {
      next[key] = entry;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function toInventoryItem(raw: unknown): { id: string; name: string } | undefined {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.name)) {
    return undefined;
  }
  if (raw.id.trim().length === 0 || raw.name.trim().length === 0) {
    return undefined;
  }
  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
  };
}

function toOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
