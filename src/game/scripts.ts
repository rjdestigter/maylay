import fallbackJson from './dialogue/fallbacks.json';
import interactionsJson from './dialogue/interactions.json';
import { assign, createActor, setup } from 'xstate';
import type { GameContext } from './stateMachine';
import type {
  Hotspot,
  RoomDefinition,
  RoomInteractionChart,
  RoomParallelStateChart,
  RoomParallelTransition,
  RoomInteractionTransition,
  RoomScriptRule,
  ScriptResult,
  Verb,
} from './types';

type FallbackConfig = {
  lookDefault: string[];
  talkDefault: string[];
  pickUpDefault: string[];
  openDefault: string[];
  useWithoutItemDefault: string[];
  useDefault: string[];
  genericDefault: string[];
};

type InteractionLinesConfig = {
  look: {
    doorClosed: string;
    doorOpen: string;
    sign: string;
    keyPresent: string;
    keyTaken: string;
  };
  talk: {
    door: string;
    sign: string;
    key: string;
  };
  pickUp: {
    keySuccess: string;
    keyAlreadyTaken: string;
    doorFailure: string;
    signFailure: string;
  };
  use: {
    doorOpenNoItemEnter: string;
    doorNeedKeyFirst: string;
    doorAlreadyUnlocked: string;
    doorUnlockSuccess: string;
    doorKeyMisaligned: string;
    doorGeneric: string;
    signKey: string;
    signGeneric: string;
    keyGeneric: string;
    keyOnKey: string;
    genericKeyItem: string;
    doorWithoutItem: string;
    signWithoutItem: string;
    keyWithoutItem: string;
  };
  open: {
    lockedDoor: string;
    enterOpenDoor: string;
    signFailure: string;
    keyFailure: string;
  };
};

const DEFAULT_FALLBACKS: FallbackConfig = {
  lookDefault: [
    'You study it intensely. It studies right back by doing absolutely nothing.',
    'It looks important, in the way rocks sometimes look important.',
    'You squint. It remains committed to being mysterious.',
  ],
  talkDefault: [
    'You deliver a heartfelt speech. The audience remains imaginary.',
    'You try small talk. It chooses smaller silence.',
    'You ask a thoughtful question. Silence gives an equally thoughtful answer.',
  ],
  pickUpDefault: [
    "You can't pick up the {hotspot}. Physics has filed an objection.",
    "You give the {hotspot} a tug. It gives your shoulder a warning.",
    'The {hotspot} appears to be permanently employed by gravity.',
  ],
  openDefault: [
    "You can't open the {hotspot}. It has no obvious \"open\" setting.",
    'You hunt for hinges on the {hotspot}. The hinges remain mythical.',
    'You attempt the dramatic reveal. The {hotspot} declines to participate.',
  ],
  useWithoutItemDefault: [
    'Use what? Your winning personality is not in inventory.',
    'You are currently equipped with confidence and empty pockets.',
    'Great plan. Missing tool.',
  ],
  useDefault: [
    'Using {item} on {hotspot} mostly builds character.',
    '{item} and {hotspot} meet briefly, then agree to stay strangers.',
    'You combine {item} with {hotspot}. The universe remains unconvinced.',
  ],
  genericDefault: [
    'Bold strategy. Absolutely no effect.',
    'That felt important. It was not.',
    'You try it. Reality refuses the patch.',
  ],
};

const DEFAULT_INTERACTIONS: InteractionLinesConfig = {
  look: {
    doorClosed: 'A sturdy door with an old lock.',
    doorOpen: 'An open door. Adventure awaits.',
    sign: 'The sign reads: "No random behavior beyond this point."',
    keyPresent: 'A brass key lies on the ground.',
    keyTaken: 'It was here a second ago.',
  },
  talk: {
    door: 'The door remains politely silent.',
    sign: 'You greet the sign. It ignores you with confidence.',
    key: 'You ask the key for life advice. It gives you the silent treatment.',
  },
  pickUp: {
    keySuccess: 'You pick up the brass key.',
    keyAlreadyTaken: 'You already picked up the key.',
    doorFailure: "You'd need a crane, a permit, and probably a better idea.",
    signFailure: 'The sign is deeply rooted in its career.',
  },
  use: {
    doorOpenNoItemEnter: 'You step through the open door.',
    doorNeedKeyFirst: 'You need to pick up the key first.',
    doorAlreadyUnlocked: 'The door is already unlocked.',
    doorUnlockSuccess: 'The key turns with a click. The door swings open.',
    doorKeyMisaligned: 'You wave the key near the door dramatically. The lock requests actual alignment.',
    doorGeneric: 'You try {item} on the door. The door remains unconvinced.',
    signKey: 'You scratch the sign with the key. The sign files a complaint.',
    signGeneric: 'You try {item} on the sign. It still refuses to become useful.',
    keyGeneric: 'You try {item} on the key. They do not form a meaningful friendship.',
    keyOnKey: 'You tap the key with itself. A breakthrough in advanced key technology.',
    genericKeyItem: 'You poke the {hotspot} with the key. No secret mechanism reveals itself.',
    doorWithoutItem: 'Use what on the door? Your optimism jiggles the handle, but not the lock.',
    signWithoutItem: 'Use what on the sign? Stern eye contact is not a tool.',
    keyWithoutItem: 'Use what on the key? You are currently holding exactly zero useful things.',
  },
  open: {
    lockedDoor: "It's locked.",
    enterOpenDoor: 'You step through the open door.',
    signFailure: 'You try to open the sign. It remains a sign.',
    keyFailure: 'You open your hand dramatically. The key is unimpressed.',
  },
};

const FALLBACKS = loadFallbackConfig(fallbackJson);
const INTERACTIONS = loadInteractionsConfig(interactionsJson);
type RoomChartEvent = {
  type: Verb;
  hotspotId: string;
  inventoryItemId: string | null;
  flags: Record<string, boolean>;
};
type RoomChartContext = {
  lastResult: ScriptResult | null;
  emission: number;
};
type RoomChartActorRecord = {
  chartRef: Record<string, unknown>;
  actor: ReturnType<typeof createActor<any>>;
};
const roomChartActors = new Map<string, RoomChartActorRecord>();

export function resolveInteraction(context: GameContext, room: RoomDefinition, hotspot: Hotspot): ScriptResult {
  const verb = context.pendingInteraction?.verb ?? context.selectedVerb;
  const selectedItem = context.pendingInteraction?.inventoryItemId ?? context.selectedInventoryItemId;
  const isSelf = hotspot.id === '__self__';

  const xstateChartResult = resolveXStateChart(room, hotspot.id, verb, selectedItem, context.flags);
  if (xstateChartResult) {
    return xstateChartResult;
  }

  const parallelChartResult = resolveParallelStateChart(
    room.parallelStateChart,
    room.id,
    hotspot.id,
    verb,
    selectedItem,
    context.flags,
  );
  if (parallelChartResult) {
    return parallelChartResult;
  }

  const chartResult = resolveInteractionChart(room.interactionChart, room.id, hotspot.id, verb, selectedItem, context.flags);
  if (chartResult) {
    return chartResult;
  }

  const scriptedResult = resolveScriptedRule(room.scripts, hotspot.id, verb, selectedItem, context.flags);
  if (scriptedResult) {
    return scriptedResult;
  }

  if (verb === 'LOOK') {
    if (isSelf) {
      return { dialogueLines: ['A daring adventurer with excellent taste in verbs.'] };
    }
    return {
      dialogueLines: [lookLineFor(hotspot, context.flags)],
      setFlags: {
        [inspectedFlagName(hotspot)]: true,
      },
    };
  }

  if (verb === 'TALK') {
    if (isSelf) {
      return { dialogueLines: ['You give yourself a pep talk. The reviews are mixed but encouraging.'] };
    }
    return { dialogueLines: [talkLineFor(hotspot, context.flags)] };
  }

  if (verb === 'PICK_UP') {
    if (isSelf) {
      return { dialogueLines: ['You attempt to pick yourself up. Philosophically successful.'] };
    }
    if (hotspot.id !== 'key') {
      return { dialogueLines: [pickUpFailureLine(hotspot, context.flags)] };
    }

    if (context.flags.keyTaken) {
      return { dialogueLines: [INTERACTIONS.pickUp.keyAlreadyTaken] };
    }

    return {
      dialogueLines: [INTERACTIONS.pickUp.keySuccess],
      addInventoryItem: { id: 'key', name: 'Key' },
      setFlags: { keyTaken: true },
    };
  }

  if (verb === 'USE') {
    if (isSelf) {
      if (selectedItem === null) {
        return { dialogueLines: ['Use what on yourself? Confidence is not currently in your inventory.'] };
      }
      return { dialogueLines: [`You try ${selectedItem} on yourself. A bold experiment in questionable judgment.`] };
    }
    if (hotspot.id === 'door' && context.flags.doorOpen && selectedItem === null) {
      return {
        dialogueLines: [INTERACTIONS.use.doorOpenNoItemEnter],
        roomChangeTo: 'room2',
      };
    }

    if (selectedItem === null) {
      const stateUseLine = stateDialogueLine(hotspot, 'USE', context.flags);
      if (stateUseLine) {
        return { dialogueLines: [stateUseLine] };
      }
      return { dialogueLines: [useWithoutItemLine(hotspot.id)] };
    }

    if (hotspot.id === 'door' && selectedItem === 'key') {
      if (!context.flags.keyTaken) {
        return { dialogueLines: [INTERACTIONS.use.doorNeedKeyFirst] };
      }

      if (context.flags.doorOpen) {
        return { dialogueLines: [INTERACTIONS.use.doorAlreadyUnlocked] };
      }

      return {
        dialogueLines: [INTERACTIONS.use.doorUnlockSuccess],
        setFlags: { doorOpen: true, doorLocked: false },
        clearSelectedInventory: true,
      };
    }

    return { dialogueLines: [useFailureLine(selectedItem, hotspot.id, hotspot.name)] };
  }

  if (verb === 'OPEN') {
    if (isSelf) {
      return { dialogueLines: ['You are already open-minded. Physically opening is not recommended.'] };
    }
    if (hotspot.id !== 'door') {
      return { dialogueLines: [openFailureLine(hotspot, context.flags)] };
    }

    if (!context.flags.doorOpen) {
      const stateOpenLine = stateDialogueLine(hotspot, 'OPEN', context.flags);
      return { dialogueLines: [stateOpenLine ?? INTERACTIONS.open.lockedDoor] };
    }

    return {
      dialogueLines: [INTERACTIONS.open.enterOpenDoor],
      roomChangeTo: 'room2',
    };
  }

  return { dialogueLines: [pickRandomLine(FALLBACKS.genericDefault)] };
}

function resolveXStateChart(
  room: RoomDefinition,
  hotspotId: string,
  verb: Verb | null,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
): ScriptResult | null {
  if (!room.xstateChart || !verb) {
    return null;
  }
  const actor = ensureRoomChartActor(room.id, room.xstateChart);
  if (!actor) {
    return null;
  }

  const beforeSnapshot = actor.getSnapshot();
  const beforeEmission = beforeSnapshot.context.emission as number;
  const event: RoomChartEvent = {
    type: verb,
    hotspotId,
    inventoryItemId: selectedItemId,
    flags,
  };
  actor.send(event);
  const afterSnapshot = actor.getSnapshot();
  const afterEmission = afterSnapshot.context.emission as number;
  if (afterEmission <= beforeEmission) {
    return null;
  }
  const result = afterSnapshot.context.lastResult as ScriptResult | null;
  return result ? cloneScriptResult(result) : null;
}

function ensureRoomChartActor(
  roomId: string,
  chart: Record<string, unknown>,
): ReturnType<typeof createActor<any>> | null {
  const existing = roomChartActors.get(roomId);
  if (existing && existing.chartRef === chart) {
    return existing.actor;
  }

  if (existing) {
    existing.actor.stop();
    roomChartActors.delete(roomId);
  }

  if (!isObject(chart)) {
    return null;
  }

  const roomChartMachine = setup({
    types: {
      context: {} as RoomChartContext,
      events: {} as RoomChartEvent,
    },
    guards: {
      matchInteraction: ({ event }, params: unknown) => {
        if (!isObject(params)) {
          return false;
        }
        const hotspotId = typeof params.hotspotId === 'string' ? params.hotspotId : undefined;
        if (hotspotId && event.hotspotId !== hotspotId) {
          return false;
        }
        if (params.requireNoInventoryItem === true && event.inventoryItemId !== null) {
          return false;
        }
        if (typeof params.inventoryItemId === 'string' && event.inventoryItemId !== params.inventoryItemId) {
          return false;
        }
        const flagsAll = toStringArray(params.flagsAll);
        if (flagsAll && flagsAll.some((flag) => !event.flags[flag])) {
          return false;
        }
        const flagsNot = toStringArray(params.flagsNot);
        if (flagsNot && flagsNot.some((flag) => event.flags[flag])) {
          return false;
        }
        const flagsAny = toStringArray(params.flagsAny);
        if (flagsAny && flagsAny.length > 0 && !flagsAny.some((flag) => event.flags[flag])) {
          return false;
        }
        return true;
      },
    },
    actions: {
      emitResult: assign(({ context }, params: unknown) => {
        const parsedResult = parseScriptResultFromUnknown(isObject(params) ? params.result : undefined);
        if (!parsedResult) {
          return context;
        }
        return {
          ...context,
          lastResult: cloneScriptResult(parsedResult),
          emission: context.emission + 1,
        };
      }),
    },
  }).createMachine({
    ...(chart as any),
    context: {
      lastResult: null,
      emission: 0,
    } satisfies RoomChartContext,
  });

  const actor = createActor(roomChartMachine);
  actor.start();
  roomChartActors.set(roomId, { chartRef: chart, actor });
  return actor;
}

function resolveParallelStateChart(
  chart: RoomParallelStateChart | undefined,
  roomId: string,
  hotspotId: string,
  verb: Verb | null,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
): ScriptResult | null {
  if (!chart || !verb) {
    return null;
  }

  const nodeStates = getActiveNodeStates(chart, roomId, flags);
  const nodeStateUniverse = collectNodeStateUniverse(chart);

  for (const transition of chart.transitions) {
    if (!parallelTransitionMatches(transition, hotspotId, verb, selectedItemId, flags, nodeStates)) {
      continue;
    }
    const nextResult = cloneScriptResult(transition.result);
    if (!transition.setNodeStates || Object.keys(transition.setNodeStates).length === 0) {
      return nextResult;
    }

    const nextNodeStateFlags = buildNodeStateFlagUpdates(roomId, nodeStateUniverse, nodeStates, transition.setNodeStates);
    nextResult.setFlags = {
      ...(nextResult.setFlags ?? {}),
      ...nextNodeStateFlags,
    };
    return nextResult;
  }

  return null;
}

function collectNodeStateUniverse(chart: RoomParallelStateChart): Record<string, Set<string>> {
  const universe: Record<string, Set<string>> = {};
  for (const [nodeId, stateId] of Object.entries(chart.initialStates)) {
    (universe[nodeId] ??= new Set<string>()).add(stateId);
  }
  for (const transition of chart.transitions) {
    for (const [nodeId, stateId] of Object.entries(transition.setNodeStates ?? {})) {
      (universe[nodeId] ??= new Set<string>()).add(stateId);
    }
    for (const [nodeId, stateId] of Object.entries(transition.when?.nodeStatesAll ?? {})) {
      (universe[nodeId] ??= new Set<string>()).add(stateId);
    }
  }
  return universe;
}

function getActiveNodeStates(
  chart: RoomParallelStateChart,
  roomId: string,
  flags: Record<string, boolean>,
): Record<string, string> {
  const universe = collectNodeStateUniverse(chart);
  const active: Record<string, string> = { ...chart.initialStates };
  for (const [nodeId, states] of Object.entries(universe)) {
    for (const stateId of states) {
      if (flags[nodeStateFlagName(roomId, nodeId, stateId)]) {
        active[nodeId] = stateId;
        break;
      }
    }
  }
  return active;
}

function parallelTransitionMatches(
  transition: RoomParallelTransition,
  hotspotId: string,
  verb: Verb,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
  nodeStates: Record<string, string>,
): boolean {
  if (transition.hotspotId !== hotspotId || transition.verb !== verb) {
    return false;
  }
  if (transition.requireNoInventoryItem && selectedItemId !== null) {
    return false;
  }
  if (transition.inventoryItemId && transition.inventoryItemId !== selectedItemId) {
    return false;
  }
  const when = transition.when;
  if (!when) {
    return true;
  }
  if (when.nodeStatesAll) {
    for (const [nodeId, expectedState] of Object.entries(when.nodeStatesAll)) {
      if (nodeStates[nodeId] !== expectedState) {
        return false;
      }
    }
  }
  if (when.flagsAll && when.flagsAll.some((flag) => !flags[flag])) {
    return false;
  }
  if (when.flagsNot && when.flagsNot.some((flag) => flags[flag])) {
    return false;
  }
  if (when.flagsAny && when.flagsAny.length > 0 && !when.flagsAny.some((flag) => flags[flag])) {
    return false;
  }
  return true;
}

function buildNodeStateFlagUpdates(
  roomId: string,
  universe: Record<string, Set<string>>,
  currentNodeStates: Record<string, string>,
  updateNodeStates: Record<string, string>,
): Record<string, boolean> {
  const nextNodeStates = { ...currentNodeStates, ...updateNodeStates };
  const updates: Record<string, boolean> = {};
  for (const [nodeId, states] of Object.entries(universe)) {
    const activeState = nextNodeStates[nodeId];
    for (const stateId of states) {
      updates[nodeStateFlagName(roomId, nodeId, stateId)] = stateId === activeState;
    }
  }
  return updates;
}

function nodeStateFlagName(roomId: string, nodeId: string, stateId: string): string {
  return `chartNode:${roomId}:${nodeId}:${stateId}`;
}

function resolveInteractionChart(
  chart: RoomInteractionChart | undefined,
  roomId: string,
  hotspotId: string,
  verb: Verb | null,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
): ScriptResult | null {
  if (!chart || !verb) {
    return null;
  }
  const activeStateId = activeChartStateId(chart, roomId, flags);
  const activeState = chart.states.find((state) => state.id === activeStateId);
  if (!activeState) {
    return null;
  }

  for (const transition of activeState.transitions) {
    if (!transitionMatches(transition, hotspotId, verb, selectedItemId, flags)) {
      continue;
    }
    const nextResult = cloneScriptResult(transition.result);
    if (!transition.toState) {
      return nextResult;
    }

    const nextFlags = {
      ...(nextResult.setFlags ?? {}),
      ...chartStateFlagUpdates(chart, roomId, transition.toState),
    };
    nextResult.setFlags = nextFlags;
    return nextResult;
  }
  return null;
}

function activeChartStateId(
  chart: RoomInteractionChart,
  roomId: string,
  flags: Record<string, boolean>,
): string {
  const explicitState = chart.states.find((state) => flags[chartStateFlagName(roomId, state.id)]);
  return explicitState?.id ?? chart.initialState;
}

function transitionMatches(
  transition: RoomInteractionTransition,
  hotspotId: string,
  verb: Verb,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
): boolean {
  if (transition.hotspotId !== hotspotId || transition.verb !== verb) {
    return false;
  }
  if (transition.requireNoInventoryItem && selectedItemId !== null) {
    return false;
  }
  if (transition.inventoryItemId && transition.inventoryItemId !== selectedItemId) {
    return false;
  }
  if (!chartConditionsMatch(transition, flags)) {
    return false;
  }
  return true;
}

function chartConditionsMatch(transition: RoomInteractionTransition, flags: Record<string, boolean>): boolean {
  const conditions = transition.conditions;
  if (!conditions) {
    return true;
  }
  if (conditions.flagsAll && conditions.flagsAll.some((flag) => !flags[flag])) {
    return false;
  }
  if (conditions.flagsNot && conditions.flagsNot.some((flag) => flags[flag])) {
    return false;
  }
  if (conditions.flagsAny && conditions.flagsAny.length > 0 && !conditions.flagsAny.some((flag) => flags[flag])) {
    return false;
  }
  return true;
}

function chartStateFlagUpdates(
  chart: RoomInteractionChart,
  roomId: string,
  toState: string,
): Record<string, boolean> {
  const updates: Record<string, boolean> = {};
  for (const state of chart.states) {
    updates[chartStateFlagName(roomId, state.id)] = state.id === toState;
  }
  return updates;
}

function chartStateFlagName(roomId: string, stateId: string): string {
  return `chartState:${roomId}:${stateId}`;
}

function resolveScriptedRule(
  rules: RoomScriptRule[] | undefined,
  hotspotId: string,
  verb: Verb | null,
  selectedItemId: string | null,
  flags: Record<string, boolean>,
): ScriptResult | null {
  if (!rules || !verb) {
    return null;
  }
  for (const rule of rules) {
    if (rule.hotspotId !== hotspotId || rule.verb !== verb) {
      continue;
    }
    if (rule.requireNoInventoryItem && selectedItemId !== null) {
      continue;
    }
    if (rule.inventoryItemId && rule.inventoryItemId !== selectedItemId) {
      continue;
    }
    if (!conditionsMatch(rule, flags)) {
      continue;
    }
    return cloneScriptResult(rule.result);
  }
  return null;
}

function conditionsMatch(rule: RoomScriptRule, flags: Record<string, boolean>): boolean {
  const conditions = rule.conditions;
  if (!conditions) {
    return true;
  }
  if (conditions.flagsAll && conditions.flagsAll.some((flag) => !flags[flag])) {
    return false;
  }
  if (conditions.flagsNot && conditions.flagsNot.some((flag) => flags[flag])) {
    return false;
  }
  if (conditions.flagsAny && conditions.flagsAny.length > 0 && !conditions.flagsAny.some((flag) => flags[flag])) {
    return false;
  }
  return true;
}

function cloneScriptResult(result: ScriptResult): ScriptResult {
  return {
    dialogueLines: [...result.dialogueLines],
    setFlags: result.setFlags ? { ...result.setFlags } : undefined,
    addInventoryItem: result.addInventoryItem ? { ...result.addInventoryItem } : undefined,
    removeInventoryItemId: result.removeInventoryItemId,
    roomChangeTo: result.roomChangeTo,
    clearSelectedInventory: result.clearSelectedInventory,
  };
}

function lookLineFor(hotspot: Hotspot, flags: Record<string, boolean>): string {
  const stateLine = stateDialogueLine(hotspot, 'LOOK', flags);
  if (stateLine) {
    return stateLine;
  }
  if (hotspot.description && hotspot.description.trim().length > 0) {
    return hotspot.description.trim();
  }

  switch (hotspot.id) {
    case 'door':
      return flags.doorOpen ? INTERACTIONS.look.doorOpen : INTERACTIONS.look.doorClosed;
    case 'sign':
      return INTERACTIONS.look.sign;
    case 'key':
      return flags.keyTaken ? INTERACTIONS.look.keyTaken : INTERACTIONS.look.keyPresent;
    default:
      return pickRandomLine(FALLBACKS.lookDefault);
  }
}

function talkLineFor(hotspot: Hotspot, flags: Record<string, boolean>): string {
  const stateLine = stateDialogueLine(hotspot, 'TALK', flags);
  if (stateLine) {
    return stateLine;
  }
  const hotspotId = hotspot.id;
  switch (hotspotId) {
    case 'door':
      return INTERACTIONS.talk.door;
    case 'sign':
      return INTERACTIONS.talk.sign;
    case 'key':
      return INTERACTIONS.talk.key;
    default:
      return pickRandomLine(FALLBACKS.talkDefault);
  }
}

function pickUpFailureLine(hotspot: Hotspot, flags: Record<string, boolean>): string {
  const stateLine = stateDialogueLine(hotspot, 'PICK_UP', flags);
  if (stateLine) {
    return stateLine;
  }
  const hotspotId = hotspot.id;
  const hotspotName = hotspot.name;
  switch (hotspotId) {
    case 'door':
      return INTERACTIONS.pickUp.doorFailure;
    case 'sign':
      return INTERACTIONS.pickUp.signFailure;
    default:
      return fillHotspotName(pickRandomLine(FALLBACKS.pickUpDefault), hotspotName);
  }
}

function openFailureLine(hotspot: Hotspot, flags: Record<string, boolean>): string {
  const stateLine = stateDialogueLine(hotspot, 'OPEN', flags);
  if (stateLine) {
    return stateLine;
  }
  const hotspotId = hotspot.id;
  const hotspotName = hotspot.name;
  switch (hotspotId) {
    case 'sign':
      return INTERACTIONS.open.signFailure;
    case 'key':
      return INTERACTIONS.open.keyFailure;
    default:
      return fillHotspotName(pickRandomLine(FALLBACKS.openDefault), hotspotName);
  }
}

function useWithoutItemLine(hotspotId: string): string {
  switch (hotspotId) {
    case 'door':
      return INTERACTIONS.use.doorWithoutItem;
    case 'sign':
      return INTERACTIONS.use.signWithoutItem;
    case 'key':
      return INTERACTIONS.use.keyWithoutItem;
    default:
      return pickRandomLine(FALLBACKS.useWithoutItemDefault);
  }
}

function useFailureLine(itemId: string, hotspotId: string, hotspotName: string): string {
  if (itemId === 'key' && hotspotId === 'sign') {
    return INTERACTIONS.use.signKey;
  }
  if (itemId === 'key' && hotspotId === 'key') {
    return INTERACTIONS.use.keyOnKey;
  }
  if (itemId === 'key' && hotspotId === 'door') {
    return INTERACTIONS.use.doorKeyMisaligned;
  }
  if (hotspotId === 'door') {
    return fillItemName(INTERACTIONS.use.doorGeneric, itemId);
  }
  if (hotspotId === 'sign') {
    return fillItemName(INTERACTIONS.use.signGeneric, itemId);
  }
  if (hotspotId === 'key') {
    return fillItemName(INTERACTIONS.use.keyGeneric, itemId);
  }
  if (itemId === 'key') {
    return fillHotspotName(INTERACTIONS.use.genericKeyItem, hotspotName);
  }
  return fillItemAndHotspotName(pickRandomLine(FALLBACKS.useDefault), itemId, hotspotName);
}

function pickRandomLine(lines: readonly string[]): string {
  if (lines.length === 0) {
    return '...';
  }
  const index = Math.floor(Math.random() * lines.length);
  return lines[index];
}

function fillHotspotName(template: string, hotspotName: string): string {
  return template.replace('{hotspot}', hotspotName);
}

function fillItemAndHotspotName(template: string, itemName: string, hotspotName: string): string {
  return template
    .replace('{item}', itemName)
    .replace('{hotspot}', hotspotName);
}

function fillItemName(template: string, itemName: string): string {
  return template.replace('{item}', itemName);
}

function loadFallbackConfig(raw: unknown): FallbackConfig {
  if (!isObject(raw)) {
    return DEFAULT_FALLBACKS;
  }
  return {
    lookDefault: stringArrayOrDefault(raw.lookDefault, DEFAULT_FALLBACKS.lookDefault),
    talkDefault: stringArrayOrDefault(raw.talkDefault, DEFAULT_FALLBACKS.talkDefault),
    pickUpDefault: stringArrayOrDefault(raw.pickUpDefault, DEFAULT_FALLBACKS.pickUpDefault),
    openDefault: stringArrayOrDefault(raw.openDefault, DEFAULT_FALLBACKS.openDefault),
    useWithoutItemDefault: stringArrayOrDefault(raw.useWithoutItemDefault, DEFAULT_FALLBACKS.useWithoutItemDefault),
    useDefault: stringArrayOrDefault(raw.useDefault, DEFAULT_FALLBACKS.useDefault),
    genericDefault: stringArrayOrDefault(raw.genericDefault, DEFAULT_FALLBACKS.genericDefault),
  };
}

function loadInteractionsConfig(raw: unknown): InteractionLinesConfig {
  if (!isObject(raw)) {
    return DEFAULT_INTERACTIONS;
  }
  return {
    look: {
      doorClosed: stringOrDefault(raw.look, 'doorClosed', DEFAULT_INTERACTIONS.look.doorClosed),
      doorOpen: stringOrDefault(raw.look, 'doorOpen', DEFAULT_INTERACTIONS.look.doorOpen),
      sign: stringOrDefault(raw.look, 'sign', DEFAULT_INTERACTIONS.look.sign),
      keyPresent: stringOrDefault(raw.look, 'keyPresent', DEFAULT_INTERACTIONS.look.keyPresent),
      keyTaken: stringOrDefault(raw.look, 'keyTaken', DEFAULT_INTERACTIONS.look.keyTaken),
    },
    talk: {
      door: stringOrDefault(raw.talk, 'door', DEFAULT_INTERACTIONS.talk.door),
      sign: stringOrDefault(raw.talk, 'sign', DEFAULT_INTERACTIONS.talk.sign),
      key: stringOrDefault(raw.talk, 'key', DEFAULT_INTERACTIONS.talk.key),
    },
    pickUp: {
      keySuccess: stringOrDefault(raw.pickUp, 'keySuccess', DEFAULT_INTERACTIONS.pickUp.keySuccess),
      keyAlreadyTaken: stringOrDefault(raw.pickUp, 'keyAlreadyTaken', DEFAULT_INTERACTIONS.pickUp.keyAlreadyTaken),
      doorFailure: stringOrDefault(raw.pickUp, 'doorFailure', DEFAULT_INTERACTIONS.pickUp.doorFailure),
      signFailure: stringOrDefault(raw.pickUp, 'signFailure', DEFAULT_INTERACTIONS.pickUp.signFailure),
    },
    use: {
      doorOpenNoItemEnter: stringOrDefault(raw.use, 'doorOpenNoItemEnter', DEFAULT_INTERACTIONS.use.doorOpenNoItemEnter),
      doorNeedKeyFirst: stringOrDefault(raw.use, 'doorNeedKeyFirst', DEFAULT_INTERACTIONS.use.doorNeedKeyFirst),
      doorAlreadyUnlocked: stringOrDefault(raw.use, 'doorAlreadyUnlocked', DEFAULT_INTERACTIONS.use.doorAlreadyUnlocked),
      doorUnlockSuccess: stringOrDefault(raw.use, 'doorUnlockSuccess', DEFAULT_INTERACTIONS.use.doorUnlockSuccess),
      doorKeyMisaligned: stringOrDefault(raw.use, 'doorKeyMisaligned', DEFAULT_INTERACTIONS.use.doorKeyMisaligned),
      doorGeneric: stringOrDefault(raw.use, 'doorGeneric', DEFAULT_INTERACTIONS.use.doorGeneric),
      signKey: stringOrDefault(raw.use, 'signKey', DEFAULT_INTERACTIONS.use.signKey),
      signGeneric: stringOrDefault(raw.use, 'signGeneric', DEFAULT_INTERACTIONS.use.signGeneric),
      keyGeneric: stringOrDefault(raw.use, 'keyGeneric', DEFAULT_INTERACTIONS.use.keyGeneric),
      keyOnKey: stringOrDefault(raw.use, 'keyOnKey', DEFAULT_INTERACTIONS.use.keyOnKey),
      genericKeyItem: stringOrDefault(raw.use, 'genericKeyItem', DEFAULT_INTERACTIONS.use.genericKeyItem),
      doorWithoutItem: stringOrDefault(raw.use, 'doorWithoutItem', DEFAULT_INTERACTIONS.use.doorWithoutItem),
      signWithoutItem: stringOrDefault(raw.use, 'signWithoutItem', DEFAULT_INTERACTIONS.use.signWithoutItem),
      keyWithoutItem: stringOrDefault(raw.use, 'keyWithoutItem', DEFAULT_INTERACTIONS.use.keyWithoutItem),
    },
    open: {
      lockedDoor: stringOrDefault(raw.open, 'lockedDoor', DEFAULT_INTERACTIONS.open.lockedDoor),
      enterOpenDoor: stringOrDefault(raw.open, 'enterOpenDoor', DEFAULT_INTERACTIONS.open.enterOpenDoor),
      signFailure: stringOrDefault(raw.open, 'signFailure', DEFAULT_INTERACTIONS.open.signFailure),
      keyFailure: stringOrDefault(raw.open, 'keyFailure', DEFAULT_INTERACTIONS.open.keyFailure),
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const next = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return next.length > 0 ? next : [...fallback];
}

function parseScriptResultFromUnknown(value: unknown): ScriptResult | null {
  if (!isObject(value) || !Array.isArray(value.dialogueLines)) {
    return null;
  }
  const dialogueLines = value.dialogueLines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => line.trim());
  if (dialogueLines.length === 0) {
    return null;
  }
  const setFlags = isObject(value.setFlags)
    ? Object.fromEntries(Object.entries(value.setFlags).filter(([, flagValue]) => typeof flagValue === 'boolean')) as Record<string, boolean>
    : undefined;
  const addInventoryItem = isObject(value.addInventoryItem)
    && typeof value.addInventoryItem.id === 'string'
    && typeof value.addInventoryItem.name === 'string'
    ? { id: value.addInventoryItem.id, name: value.addInventoryItem.name }
    : undefined;
  return {
    dialogueLines,
    setFlags,
    addInventoryItem,
    removeInventoryItemId: typeof value.removeInventoryItemId === 'string' ? value.removeInventoryItemId : undefined,
    roomChangeTo: typeof value.roomChangeTo === 'string' ? value.roomChangeTo : undefined,
    clearSelectedInventory: value.clearSelectedInventory === true,
  };
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

function stringOrDefault(source: unknown, key: string, fallback: string): string {
  if (!isObject(source)) {
    return fallback;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function stateDialogueLine(hotspot: Hotspot, verb: Verb, flags: Record<string, boolean>): string | null {
  const stateId = resolveHotspotStateId(hotspot, flags);
  if (!stateId) {
    return null;
  }
  const stateVariant = hotspot.states?.[stateId];
  const byVerb = stateVariant?.dialogue?.[verb];
  if (byVerb && byVerb.trim().length > 0) {
    return byVerb.trim();
  }
  const fallback = stateVariant?.dialogue?.DEFAULT;
  return fallback && fallback.trim().length > 0 ? fallback.trim() : null;
}

function resolveHotspotStateId(hotspot: Hotspot, flags: Record<string, boolean>): keyof NonNullable<Hotspot['states']> | null {
  const stateOrder: Array<keyof NonNullable<Hotspot['states']>> = ['broken', 'open', 'locked', 'inspected'];
  for (const state of stateOrder) {
    if (!hotspot.states?.[state]) {
      continue;
    }
    const flagName = hotspot.stateFlags?.[state] ?? defaultStateFlagName(hotspot.id, state);
    if (flags[flagName]) {
      return state;
    }
  }
  return null;
}

function defaultStateFlagName(hotspotId: string, state: 'locked' | 'open' | 'broken' | 'inspected'): string {
  return `${hotspotId}${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

function inspectedFlagName(hotspot: Hotspot): string {
  return hotspot.stateFlags?.inspected ?? defaultStateFlagName(hotspot.id, 'inspected');
}
