import type { RoomDefinition } from '../types';

export const room1: RoomDefinition = {
  id: 'room1',
  name: 'Crossroads',
  width: 320,
  height: 180,
  backgroundColor: '#264653',
  hotspots: [
    {
      id: 'door',
      name: 'door',
      bounds: { x: 232, y: 50, w: 55, h: 62 },
      spriteBounds: { x: 215, y: 39, w: 83, h: 96 },
      walkTarget: { x: 248, y: 112 },
    },
    {
      id: 'sign',
      name: 'sign',
      bounds: { x: 33, y: 64, w: 57, h: 32 },
      spriteBounds: { x: 19, y: 50, w: 85, h: 108 },
      walkTarget: { x: 60, y: 144 },
    },
    {
      id: 'key',
      name: 'key',
      bounds: { x: 201, y: 163, w: 22, h: 15 },
      spriteBounds: { x: 200, y: 158, w: 24, h: 30 },
      walkTarget: { x: 198, y: 172 },
    },
  ],
};

export const room2: RoomDefinition = {
  id: 'room2',
  name: 'Beyond Door',
  width: 320,
  height: 180,
  backgroundColor: '#1d3557',
  hotspots: [],
  overlayText: 'Room 2 placeholder: You made it!',
};

export const rooms: Record<string, RoomDefinition> = {
  room1,
  room2,
};

export function isHotspotVisible(roomId: string, hotspotId: string, flags: Record<string, boolean>): boolean {
  if (roomId !== 'room1') {
    return true;
  }

  if (hotspotId === 'key' && flags.keyTaken) {
    return false;
  }

  return true;
}
