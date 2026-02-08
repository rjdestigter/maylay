import type { GameContext } from './stateMachine';
import type { Hotspot, ScriptResult } from './types';

export function resolveInteraction(context: GameContext, hotspot: Hotspot): ScriptResult {
  const verb = context.pendingInteraction?.verb ?? context.selectedVerb;
  const selectedItem = context.pendingInteraction?.inventoryItemId ?? context.selectedInventoryItemId;

  if (verb === 'LOOK') {
    return { dialogueLines: [lookLineFor(hotspot.id, context.flags)] };
  }

  if (verb === 'TALK') {
    return { dialogueLines: [talkLineFor(hotspot.id)] };
  }

  if (verb === 'PICK_UP') {
    if (hotspot.id !== 'key') {
      return { dialogueLines: [`You can't pick up the ${hotspot.name}.`] };
    }

    if (context.flags.keyTaken) {
      return { dialogueLines: ['You already picked up the key.'] };
    }

    return {
      dialogueLines: ['You pick up the brass key.'],
      addInventoryItem: { id: 'key', name: 'Key' },
      setFlags: { keyTaken: true },
    };
  }

  if (verb === 'USE') {
    if (hotspot.id === 'door' && context.flags.doorOpen && selectedItem === null) {
      return {
        dialogueLines: ['You step through the open door.'],
        roomChangeTo: 'room2',
      };
    }

    if (selectedItem === null) {
      return { dialogueLines: ['Use what? Select an inventory item first.'] };
    }

    if (hotspot.id === 'door' && selectedItem === 'key') {
      if (!context.flags.keyTaken) {
        return { dialogueLines: ['You need to pick up the key first.'] };
      }

      if (context.flags.doorOpen) {
        return { dialogueLines: ['The door is already unlocked.'] };
      }

      return {
        dialogueLines: ['The key turns with a click. The door swings open.'],
        setFlags: { doorOpen: true },
        clearSelectedInventory: true,
      };
    }

    return { dialogueLines: [`Using ${selectedItem} on ${hotspot.name} does nothing.`] };
  }

  if (verb === 'OPEN') {
    if (hotspot.id !== 'door') {
      return { dialogueLines: [`You can't open the ${hotspot.name}.`] };
    }

    if (!context.flags.doorOpen) {
      return { dialogueLines: ["It's locked."] };
    }

    return {
      dialogueLines: ['You step through the open door.'],
      roomChangeTo: 'room2',
    };
  }

  return { dialogueLines: ['Nothing happens.'] };
}

function lookLineFor(hotspotId: string, flags: Record<string, boolean>): string {
  switch (hotspotId) {
    case 'door':
      return flags.doorOpen ? 'An open door. Adventure awaits.' : 'A sturdy door with an old lock.';
    case 'sign':
      return 'The sign reads: "No random behavior beyond this point."';
    case 'key':
      return flags.keyTaken ? 'It was here a second ago.' : 'A brass key lies on the ground.';
    default:
      return 'You see nothing special.';
  }
}

function talkLineFor(hotspotId: string): string {
  switch (hotspotId) {
    case 'door':
      return 'The door remains politely silent.';
    case 'sign':
      return 'You greet the sign. It ignores you with confidence.';
    case 'key':
      return 'The key has no dialogue options.';
    default:
      return 'There is no response.';
  }
}
