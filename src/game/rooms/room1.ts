import type { RoomDefinition } from '../types';

export const room1: RoomDefinition = {
  id: 'room1',
  name: 'Crossroads',
  width: 320,
  height: 180,
  backgroundColor: '#264653',
  perspective: {
    // Smaller near the horizon, larger near the bottom of the screen.
    farY: 70,
    nearY: 179,
    farScale: 0.32,
    nearScale: 1,
  },
  walkablePolygon: [
    { x: 71, y: 179 },
    { x: 62, y: 160 },
    { x: 30, y: 151 },
    { x: 20, y: 136 },
    { x: 64, y: 143 },
    { x: 96, y: 140 },
    { x: 116, y: 135 },
    { x: 134, y: 128 },
    { x: 134, y: 124 },
    { x: 113, y: 112 },
    { x: 96, y: 104 },
    { x: 97, y: 91 },
    { x: 115, y: 87 },
    { x: 125, y: 83 },
    { x: 132, y: 79 },
    { x: 124, y: 73 },
    { x: 130, y: 71 },
    { x: 139, y: 73 },
    { x: 146, y: 77 },
    { x: 141, y: 83 },
    { x: 131, y: 91 },
    { x: 128, y: 93 },
    { x: 140, y: 102 },
    { x: 171, y: 112 },
    { x: 195, y: 118 },
    { x: 228, y: 114 },
    { x: 283, y: 112 },
    { x: 281, y: 123 },
    { x: 255, y: 136 },
    { x: 250, y: 142 },
    { x: 230, y: 147 },
    { x: 210, y: 155 },
    { x: 195, y: 170 },
    { x: 196, y: 179 },
  ],
  hotspots: [
    {
      id: 'door',
      name: 'door',
      bounds: { x: 232, y: 50, w: 55, h: 62 },
      spriteBounds: { x: 215, y: 39, w: 83, h: 96 },
      walkTarget: { x: 240, y: 117 },
    },
    {
      id: 'sign',
      name: 'sign',
      bounds: { x: 33, y: 64, w: 57, h: 32 },
      spriteBounds: { x: 19, y: 50, w: 85, h: 108 },
      walkTarget: { x: 53, y: 147 },
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
  perspective: {
    farY: 70,
    nearY: 179,
    farScale: 0.72,
    nearScale: 1,
  },
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
