import fallbackJson from './dialogue/fallbacks.json';
import interactionsJson from './dialogue/interactions.json';
import type { GameContext } from './stateMachine';
import type { Hotspot, ScriptResult } from './types';

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

export function resolveInteraction(context: GameContext, hotspot: Hotspot): ScriptResult {
  const verb = context.pendingInteraction?.verb ?? context.selectedVerb;
  const selectedItem = context.pendingInteraction?.inventoryItemId ?? context.selectedInventoryItemId;

  if (verb === 'LOOK') {
    return { dialogueLines: [lookLineFor(hotspot, context.flags)] };
  }

  if (verb === 'TALK') {
    return { dialogueLines: [talkLineFor(hotspot.id)] };
  }

  if (verb === 'PICK_UP') {
    if (hotspot.id !== 'key') {
      return { dialogueLines: [pickUpFailureLine(hotspot.id, hotspot.name)] };
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
    if (hotspot.id === 'door' && context.flags.doorOpen && selectedItem === null) {
      return {
        dialogueLines: [INTERACTIONS.use.doorOpenNoItemEnter],
        roomChangeTo: 'room2',
      };
    }

    if (selectedItem === null) {
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
        setFlags: { doorOpen: true },
        clearSelectedInventory: true,
      };
    }

    return { dialogueLines: [useFailureLine(selectedItem, hotspot.id, hotspot.name)] };
  }

  if (verb === 'OPEN') {
    if (hotspot.id !== 'door') {
      return { dialogueLines: [openFailureLine(hotspot.id, hotspot.name)] };
    }

    if (!context.flags.doorOpen) {
      return { dialogueLines: [INTERACTIONS.open.lockedDoor] };
    }

    return {
      dialogueLines: [INTERACTIONS.open.enterOpenDoor],
      roomChangeTo: 'room2',
    };
  }

  return { dialogueLines: [pickRandomLine(FALLBACKS.genericDefault)] };
}

function lookLineFor(hotspot: Hotspot, flags: Record<string, boolean>): string {
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

function talkLineFor(hotspotId: string): string {
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

function pickUpFailureLine(hotspotId: string, hotspotName: string): string {
  switch (hotspotId) {
    case 'door':
      return INTERACTIONS.pickUp.doorFailure;
    case 'sign':
      return INTERACTIONS.pickUp.signFailure;
    default:
      return fillHotspotName(pickRandomLine(FALLBACKS.pickUpDefault), hotspotName);
  }
}

function openFailureLine(hotspotId: string, hotspotName: string): string {
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

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const next = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return next.length > 0 ? next : [...fallback];
}

function stringOrDefault(source: unknown, key: string, fallback: string): string {
  if (!isObject(source)) {
    return fallback;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
