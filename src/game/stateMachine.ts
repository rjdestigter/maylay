import { assign, setup } from 'xstate';
import type { PendingInteraction, ScriptResult, Verb, InventoryItem, Point } from './types';

const DIALOGUE_AUTO_ADVANCE_MIN_MS = 1800;
const DIALOGUE_AUTO_ADVANCE_MAX_MS = 6000;

export interface GameContext {
  currentRoomId: string;
  selectedVerb: Verb | null;
  selectedInventoryItemId: string | null;
  flags: Record<string, boolean>;
  inventory: InventoryItem[];
  pendingInteraction: PendingInteraction | null;
  hoveredHotspotId: string | null;
  dialogueLines: string[];
  dialogueIndex: number;
}

export type GameEvent =
  | { type: 'BOOTED' }
  | { type: 'VERB_SELECTED'; verb: Verb | null }
  | { type: 'HOTSPOT_HOVERED'; hotspotId: string | null }
  | { type: 'HOTSPOT_CLICKED'; hotspotId: string; walkTarget: Point }
  | { type: 'INVENTORY_SELECTED'; itemId: string | null }
  | { type: 'DIALOGUE_ADVANCE' }
  | { type: 'ARRIVED' }
  | { type: 'SCRIPT_RESOLVED'; result: ScriptResult };

const initialContext: GameContext = {
  currentRoomId: 'room1',
  selectedVerb: null,
  selectedInventoryItemId: null,
  flags: {
    keyTaken: false,
    doorLocked: true,
    doorOpen: false,
    doorBroken: false,
  },
  inventory: [],
  pendingInteraction: null,
  hoveredHotspotId: null,
  dialogueLines: [],
  dialogueIndex: 0,
};

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },
  guards: {
    hasDialogue: ({ event }) => event.type === 'SCRIPT_RESOLVED' && event.result.dialogueLines.length > 0,
    hasMoreDialogue: ({ context }) => context.dialogueIndex < context.dialogueLines.length - 1,
    shouldInspectInventory: ({ context, event }) =>
      event.type === 'INVENTORY_SELECTED' && event.itemId !== null && context.selectedVerb === 'LOOK',
    shouldShowInventoryVerbFeedback: ({ context, event }) =>
      event.type === 'INVENTORY_SELECTED'
      && event.itemId !== null
      && (context.selectedVerb === 'TALK' || context.selectedVerb === 'PICK_UP' || context.selectedVerb === 'OPEN'),
  },
  delays: {
    dialogueAutoAdvance: ({ context }) => {
      const line = context.dialogueLines[context.dialogueIndex] ?? '';
      // Scale hold time by line length so longer spoken lines are not cut off.
      const estimate = 1200 + line.length * 55;
      return clamp(Math.round(estimate), DIALOGUE_AUTO_ADVANCE_MIN_MS, DIALOGUE_AUTO_ADVANCE_MAX_MS);
    },
  },
  actions: {
    setVerb: assign(({ context, event }) => {
      if (event.type !== 'VERB_SELECTED') {
        return context;
      }

      return {
        ...context,
        selectedVerb: event.verb,
        selectedInventoryItemId: event.verb === 'USE' ? context.selectedInventoryItemId : null,
      };
    }),
    setHovered: assign(({ context, event }) => {
      if (event.type !== 'HOTSPOT_HOVERED') {
        return context;
      }

      return {
        ...context,
        hoveredHotspotId: event.hotspotId,
      };
    }),
    setInventorySelection: assign(({ context, event }) => {
      if (event.type !== 'INVENTORY_SELECTED') {
        return context;
      }

      return {
        ...context,
        selectedInventoryItemId: event.itemId,
      };
    }),
    inspectInventoryItem: assign(({ context, event }) => {
      if (event.type !== 'INVENTORY_SELECTED' || event.itemId === null) {
        return context;
      }

      const item = context.inventory.find((candidate) => candidate.id === event.itemId);
      if (!item) {
        return context;
      }

      return {
        ...context,
        selectedVerb: null,
        selectedInventoryItemId: null,
        dialogueLines: [inventoryLookLine(item.id, item.name)],
        dialogueIndex: 0,
      };
    }),
    showInventoryVerbFeedback: assign(({ context, event }) => {
      if (event.type !== 'INVENTORY_SELECTED' || event.itemId === null || context.selectedVerb === null) {
        return context;
      }

      const item = context.inventory.find((candidate) => candidate.id === event.itemId);
      const itemName = item?.name ?? event.itemId;
      return {
        ...context,
        selectedInventoryItemId: null,
        dialogueLines: [inventoryVerbFeedbackLine(context.selectedVerb, itemName)],
        dialogueIndex: 0,
      };
    }),
    setPendingInteraction: assign(({ context, event }) => {
      if (event.type !== 'HOTSPOT_CLICKED') {
        return context;
      }

      return {
        ...context,
        pendingInteraction: {
          hotspotId: event.hotspotId,
          walkTarget: event.walkTarget,
          verb: context.selectedVerb,
          inventoryItemId: context.selectedInventoryItemId,
        },
      };
    }),
    applyScriptResult: assign(({ context, event }) => {
      if (event.type !== 'SCRIPT_RESOLVED') {
        return context;
      }

      const nextFlags = {
        ...context.flags,
        ...(event.result.setFlags ?? {}),
      };

      let nextInventory = context.inventory;
      if (event.result.addInventoryItem) {
        const exists = context.inventory.some((item) => item.id === event.result.addInventoryItem?.id);
        if (!exists) {
          nextInventory = [...context.inventory, event.result.addInventoryItem];
        }
      }

      if (event.result.removeInventoryItemId) {
        nextInventory = nextInventory.filter((item) => item.id !== event.result.removeInventoryItemId);
      }

      const selectedInventoryItemId = event.result.clearSelectedInventory
        ? null
        : context.selectedInventoryItemId;

      return {
        ...context,
        flags: nextFlags,
        inventory: nextInventory,
        selectedVerb: null,
        selectedInventoryItemId,
        currentRoomId: event.result.roomChangeTo ?? context.currentRoomId,
        dialogueLines: event.result.dialogueLines,
        dialogueIndex: 0,
        pendingInteraction: null,
      };
    }),
    advanceDialogue: assign(({ context }) => ({
      ...context,
      dialogueIndex: Math.min(context.dialogueIndex + 1, context.dialogueLines.length - 1),
    })),
    clearDialogue: assign(({ context }) => ({
      ...context,
      dialogueLines: [],
      dialogueIndex: 0,
    })),
  },
}).createMachine({
  id: 'game',
  initial: 'boot',
  context: initialContext,
  states: {
    boot: {
      on: {
        BOOTED: 'roomLoading',
      },
    },
    roomLoading: {
      always: {
        target: 'exploring',
      },
    },
    exploring: {
      on: {
        VERB_SELECTED: { actions: 'setVerb' },
        HOTSPOT_HOVERED: { actions: 'setHovered' },
        INVENTORY_SELECTED: [
          {
            guard: 'shouldInspectInventory',
            target: 'dialogue',
            actions: 'inspectInventoryItem',
          },
          {
            guard: 'shouldShowInventoryVerbFeedback',
            target: 'dialogue',
            actions: 'showInventoryVerbFeedback',
          },
          { actions: 'setInventorySelection' },
        ],
        HOTSPOT_CLICKED: {
          target: 'walkingToTarget',
          actions: 'setPendingInteraction',
        },
      },
    },
    walkingToTarget: {
      on: {
        ARRIVED: 'interacting',
        HOTSPOT_HOVERED: { actions: 'setHovered' },
        HOTSPOT_CLICKED: { actions: 'setPendingInteraction' },
        VERB_SELECTED: { actions: 'setVerb' },
        INVENTORY_SELECTED: { actions: 'setInventorySelection' },
      },
    },
    interacting: {
      on: {
        SCRIPT_RESOLVED: [
          {
            guard: 'hasDialogue',
            target: 'dialogue',
            actions: 'applyScriptResult',
          },
          {
            target: 'exploring',
            actions: 'applyScriptResult',
          },
        ],
      },
    },
    dialogue: {
      after: {
        dialogueAutoAdvance: [
          {
            guard: 'hasMoreDialogue',
            actions: 'advanceDialogue',
          },
          {
            target: 'exploring',
            actions: 'clearDialogue',
          },
        ],
      },
      on: {
        HOTSPOT_CLICKED: {
          target: 'walkingToTarget',
          actions: ['clearDialogue', 'setPendingInteraction'],
        },
        VERB_SELECTED: { actions: 'setVerb' },
        INVENTORY_SELECTED: { actions: 'setInventorySelection' },
        DIALOGUE_ADVANCE: [
          {
            guard: 'hasMoreDialogue',
            actions: 'advanceDialogue',
          },
          {
            target: 'exploring',
            actions: 'clearDialogue',
          },
        ],
      },
    },
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inventoryLookLine(itemId: string, itemName: string): string {
  if (itemId === 'key') {
    return 'A brass key. It probably opens that stubborn door.';
  }
  return `It is ${withArticle(itemName)}.`;
}

function inventoryVerbFeedbackLine(verb: Verb, itemName: string): string {
  switch (verb) {
    case 'TALK':
      return `You attempt small talk with ${withArticle(itemName)}. It stays focused on being an object.`;
    case 'PICK_UP':
      return `You already picked up ${withArticle(itemName)}. Congratulations on your continued success.`;
    case 'OPEN':
      return `${capitalize(withArticle(itemName))} has no obvious hatch, lid, or dramatic reveal.`;
    default:
      return `That does not seem useful for ${withArticle(itemName)}.`;
  }
}

function withArticle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'an item';
  }
  const first = trimmed.charAt(0).toLowerCase();
  const article = 'aeiou'.includes(first) ? 'an' : 'a';
  return `${article} ${trimmed.toLowerCase()}`;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}



