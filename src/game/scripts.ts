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
      return { dialogueLines: [pickUpFailureLine(hotspot.id, hotspot.name)] };
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
      return { dialogueLines: [useWithoutItemLine(hotspot.id)] };
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

    return { dialogueLines: [useFailureLine(selectedItem, hotspot.id, hotspot.name)] };
  }

  if (verb === 'OPEN') {
    if (hotspot.id !== 'door') {
      return { dialogueLines: [openFailureLine(hotspot.id, hotspot.name)] };
    }

    if (!context.flags.doorOpen) {
      return { dialogueLines: ["It's locked."] };
    }

    return {
      dialogueLines: ['You step through the open door.'],
      roomChangeTo: 'room2',
    };
  }

  return { dialogueLines: ['Bold strategy. Absolutely no effect.'] };
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
      return 'You ask the key for life advice. It gives you the silent treatment.';
    default:
      return 'There is no response.';
  }
}

function pickUpFailureLine(hotspotId: string, hotspotName: string): string {
  switch (hotspotId) {
    case 'door':
      return "You'd need a crane, a permit, and probably a better idea.";
    case 'sign':
      return 'The sign is deeply rooted in its career.';
    default:
      return `You can't pick up the ${hotspotName}. Your back thanks you for trying, though.`;
  }
}

function openFailureLine(hotspotId: string, hotspotName: string): string {
  switch (hotspotId) {
    case 'sign':
      return 'You try to open the sign. It remains a sign.';
    case 'key':
      return 'You open your hand dramatically. The key is unimpressed.';
    default:
      return `You can't open the ${hotspotName}. Not everything has hinges.`;
  }
}

function useWithoutItemLine(hotspotId: string): string {
  switch (hotspotId) {
    case 'door':
      return 'Use what on the door? Your optimism jiggles the handle, but not the lock.';
    case 'sign':
      return 'Use what on the sign? Stern eye contact is not a tool.';
    case 'key':
      return 'Use what on the key? You are currently holding exactly zero useful things.';
    default:
      return 'Use what? Select an inventory item first.';
  }
}

function useFailureLine(itemId: string, hotspotId: string, hotspotName: string): string {
  if (itemId === 'key' && hotspotId === 'sign') {
    return 'You scratch the sign with the key. The sign files a complaint.';
  }
  if (itemId === 'key' && hotspotId === 'key') {
    return 'You tap the key with itself. A breakthrough in advanced key technology.';
  }
  if (itemId === 'key' && hotspotId === 'door') {
    return 'You wave the key near the door dramatically. The lock requests actual alignment.';
  }
  if (hotspotId === 'door') {
    return `You try ${itemId} on the door. The door remains unconvinced.`;
  }
  if (hotspotId === 'sign') {
    return `You try ${itemId} on the sign. It still refuses to become useful.`;
  }
  if (hotspotId === 'key') {
    return `You try ${itemId} on the key. They do not form a meaningful friendship.`;
  }
  if (itemId === 'key') {
    return `You poke the ${hotspotName} with the key. No secret mechanism reveals itself.`;
  }
  return `Using ${itemId} on ${hotspotName} mostly builds character.`;
}
