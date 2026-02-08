# Monkey-Island-Style Adventure Starter (TypeScript + Vite + XState)

A minimal vertical slice of a point-and-click adventure engine in the browser.

## Commands

To create this from scratch with Vite:

```bash
npm create vite@latest maylay -- --template vanilla-ts
cd maylay
npm install
npm install xstate
```

To run this project:

```bash
npm install
npm run dev
npm run build
npm run preview
```

## File Tree

```text
.
|-- index.html
|-- package.json
|-- tsconfig.json
|-- tsconfig.app.json
|-- tsconfig.node.json
|-- vite.config.ts
`-- src
    |-- main.ts
    |-- style.css
    |-- engine
    |   |-- assets.ts
    |   |-- input.ts
    |   `-- renderer.ts
    `-- game
        |-- scripts.ts
        |-- stateMachine.ts
        |-- types.ts
        `-- rooms
            `-- room1.ts
```

## Architecture Overview

- Rendering: `src/engine/renderer.ts`
  - Draws room background, visible hotspots (placeholder rectangles), actor, optional room text.
  - Uses fixed internal resolution `320x180` and nearest-neighbor scaling (`image-rendering: pixelated`).
- Input: `src/engine/input.ts`
  - Converts pointer coordinates from CSS pixels to canvas internal coordinates.
  - Hit-tests hotspots and dispatches machine events (`HOTSPOT_HOVERED`, `HOTSPOT_CLICKED`).
- State and flow: `src/game/stateMachine.ts`
  - XState flow:
    - `boot -> roomLoading -> exploring -> walkingToTarget -> interacting -> dialogue -> exploring`
  - Context includes:
    - `currentRoomId`, `selectedVerb`, `selectedInventoryItemId`, `flags`, `inventory`, `pendingInteraction`
- Game logic scripts: `src/game/scripts.ts`
  - Resolves LOOK / TALK / PICK_UP / USE on hotspots.
  - Puzzle: pick up key, use key on door to open, click opened door to transition to room2.
- Room content: `src/game/rooms/room1.ts`
  - Defines room1 + room2 placeholder and hotspot visibility rule.

## Sample Gameplay Slice

- Room 1 hotspots: `door`, `sign`, `key`
- Puzzle sequence:
  1. Select `PICK_UP`, click `key` to collect it.
  2. Select `USE`, select `Key` in inventory, click `door` to unlock.
  3. Click `door` again to transition to room2 placeholder.

## How to Add a New Room

1. Add a `RoomDefinition` object in `src/game/rooms/` (or the existing room module).
2. Register it in the `rooms` map.
3. Add a spawn point in `spawnPointForRoom` in `src/main.ts`.
4. Return `roomChangeTo: 'yourRoomId'` from `resolveInteraction` when appropriate.

## How to Add a Hotspot Interaction

1. Add a hotspot to the room definition (`id`, `name`, `bounds`, `walkTarget`).
2. Add behavior in `resolveInteraction` in `src/game/scripts.ts`.
3. If needed, add a visibility rule in `isHotspotVisible`.
4. Use flags/inventory updates through `ScriptResult` fields.
