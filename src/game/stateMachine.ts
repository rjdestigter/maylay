import { assign, setup } from 'xstate';
import type { PendingInteraction, ScriptResult, Verb, InventoryItem, Point } from './types';

const DIALOGUE_AUTO_ADVANCE_MS = 1800;

export interface GameContext {
  currentRoomId: string;
  selectedVerb: Verb;
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
  | { type: 'VERB_SELECTED'; verb: Verb }
  | { type: 'HOTSPOT_HOVERED'; hotspotId: string | null }
  | { type: 'HOTSPOT_CLICKED'; hotspotId: string; walkTarget: Point }
  | { type: 'INVENTORY_SELECTED'; itemId: string | null }
  | { type: 'DIALOGUE_ADVANCE' }
  | { type: 'ARRIVED' }
  | { type: 'SCRIPT_RESOLVED'; result: ScriptResult };

const initialContext: GameContext = {
  currentRoomId: 'room1',
  selectedVerb: 'LOOK',
  selectedInventoryItemId: null,
  flags: {
    keyTaken: false,
    doorOpen: false,
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
  },
  actions: {
    setVerb: assign(({ context, event }) => {
      if (event.type !== 'VERB_SELECTED') {
        return context;
      }

      return {
        ...context,
        selectedVerb: event.verb,
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
        INVENTORY_SELECTED: { actions: 'setInventorySelection' },
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
        [DIALOGUE_AUTO_ADVANCE_MS]: [
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

