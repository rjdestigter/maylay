import './style.css';

import { createActor } from 'xstate';
import { createAssets, type AssetStore } from './engine/assets';
import { createInputController } from './engine/input';
import { Renderer } from './engine/renderer';
import { resolveInteraction } from './game/scripts';
import { gameMachine, type GameContext } from './game/stateMachine';
import { isHotspotVisible, rooms } from './game/rooms/room1';
import type { Hotspot, Rect, Verb } from './game/types';

const WALK_SPEED = 80;
const STOP_DISTANCE = 2;
const WALK_CYCLE_HZ = 4;
const VERBS: Verb[] = ['LOOK', 'TALK', 'PICK_UP', 'USE'];
type DevEditTarget = 'bounds' | 'spriteBounds' | 'walkTarget';

void bootstrap();

async function bootstrap(): Promise<void> {
  const canvas = getRequiredElement<HTMLCanvasElement>('game-canvas');
  const sentenceLine = getRequiredElement<HTMLDivElement>('sentence-line');
  const verbBar = getRequiredElement<HTMLDivElement>('verb-bar');
  const inventoryBar = getRequiredElement<HTMLDivElement>('inventory-bar');
  const dialoguePanel = getRequiredElement<HTMLDivElement>('dialogue-panel');
  const dialogueText = getRequiredElement<HTMLParagraphElement>('dialogue-text');
  const devPanel = getRequiredElement<HTMLDivElement>('dev-panel');
  const devInfo = getRequiredElement<HTMLPreElement>('dev-info');
  const devCopy = getRequiredElement<HTMLButtonElement>('dev-copy');

  const assets = await createAssets();
  const renderer = new Renderer(canvas, assets);
  const actor = createActor(gameMachine);
  let debugHotspots = false;
  let devMode = false;
  let devEditTarget: DevEditTarget = 'bounds';
  let selectedHotspotId: string | null = null;

  let actorPosition = { x: 96, y: 150 };
  let actorSize = { width: 54, height: 68 };
  let actorFacing: 'left' | 'right' = 'right';
  let actorWalkCycle = 0;
  let previousRoomId = 'room1';

  const input = createInputController({
    canvas,
    getHotspots: () => getVisibleHotspots(actor.getSnapshot().context),
    sendEvent: (event) => actor.send(event),
    canProcessInteraction: () => !devMode,
    onCanvasClick: (_point, hotspot) => {
      if (!devMode) {
        return;
      }
      selectedHotspotId = hotspot?.id ?? null;
    },
  });

  verbBar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const verb = target.dataset.verb;
    if (!isVerb(verb)) {
      return;
    }

    actor.send({ type: 'VERB_SELECTED', verb });
  });

  inventoryBar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const itemId = target.dataset.itemId ?? null;
    actor.send({ type: 'INVENTORY_SELECTED', itemId });
  });

  dialoguePanel.addEventListener('click', () => {
    const snapshot = actor.getSnapshot();
    if (!snapshot.matches('dialogue')) {
      return;
    }

    actor.send({ type: 'DIALOGUE_ADVANCE' });
  });

  devCopy.addEventListener('click', () => {
    void copyCurrentRoomHotspots(actor.getSnapshot().context);
  });

  actor.subscribe((snapshot) => {
    const context = snapshot.context;
    renderUi(context, snapshot.matches('dialogue'));

    if (context.currentRoomId !== previousRoomId) {
      previousRoomId = context.currentRoomId;
      actorPosition = spawnPointForRoom(context.currentRoomId);
    }
  });

  actor.start();
  actor.send({ type: 'BOOTED' });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'F2') {
      debugHotspots = !debugHotspots;
      event.preventDefault();
      return;
    }

    if (event.key === 'F3') {
      devMode = !devMode;
      if (!devMode) {
        selectedHotspotId = null;
      }
      event.preventDefault();
      return;
    }

    if (!devMode) {
      return;
    }

    if (event.key === '1') {
      devEditTarget = 'bounds';
      event.preventDefault();
      return;
    }
    if (event.key === '2') {
      devEditTarget = 'spriteBounds';
      event.preventDefault();
      return;
    }
    if (event.key === '3') {
      devEditTarget = 'walkTarget';
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 'c') {
      void copyCurrentRoomHotspots(actor.getSnapshot().context);
      event.preventDefault();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      adjustActorSize(-1, -1, event.shiftKey);
      event.preventDefault();
      return;
    }
    if (event.key === '=' || event.key === '+') {
      adjustActorSize(1, 1, event.shiftKey);
      event.preventDefault();
      return;
    }

    const moveStep = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft') {
      adjustSelectedHotspot(actor.getSnapshot().context, -moveStep, 0, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowRight') {
      adjustSelectedHotspot(actor.getSnapshot().context, moveStep, 0, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, -moveStep, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, moveStep, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === '[') {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, 0, -moveStep, 0);
      event.preventDefault();
      return;
    }
    if (event.key === ']') {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, 0, moveStep, 0);
      event.preventDefault();
      return;
    }
    if (event.key === ';') {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, 0, 0, -moveStep);
      event.preventDefault();
      return;
    }
    if (event.key === "'") {
      adjustSelectedHotspot(actor.getSnapshot().context, 0, 0, 0, moveStep);
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  let lastTime = performance.now();

  function frame(now: number): void {
    const deltaSeconds = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const snapshot = actor.getSnapshot();
    const isWalking = snapshot.matches('walkingToTarget');
    if (isWalking) {
      stepWalking(snapshot.context, deltaSeconds);
      actorWalkCycle = (actorWalkCycle + deltaSeconds * WALK_CYCLE_HZ) % 1;
    } else {
      actorWalkCycle = 0;
    }

    if (snapshot.matches('interacting')) {
      resolvePendingInteraction(snapshot.context);
    }

    drawFrame(snapshot.context, isWalking);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  function drawFrame(context: GameContext, isWalking: boolean): void {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }

    renderer.render({
      room,
      actor: {
        ...actorPosition,
        ...actorSize,
        facing: actorFacing,
        isWalking,
        walkCycle: actorWalkCycle,
      },
      hotspots: getVisibleHotspots(context),
      debugHotspots: debugHotspots || devMode,
      flags: context.flags,
      hoveredHotspotId: context.hoveredHotspotId,
      devEditor: {
        enabled: devMode,
        selectedHotspotId,
        editTarget: devEditTarget,
      },
    });
  }

  function stepWalking(context: GameContext, deltaSeconds: number): void {
    const pending = context.pendingInteraction;
    if (!pending) {
      actor.send({ type: 'ARRIVED' });
      return;
    }

    const dx = pending.walkTarget.x - actorPosition.x;
    const dy = pending.walkTarget.y - actorPosition.y;
    if (Math.abs(dx) > 0.1) {
      actorFacing = dx < 0 ? 'left' : 'right';
    }
    const distance = Math.hypot(dx, dy);

    if (distance <= STOP_DISTANCE) {
      actorPosition = { ...pending.walkTarget };
      actor.send({ type: 'ARRIVED' });
      return;
    }

    const step = WALK_SPEED * deltaSeconds;
    const ratio = step >= distance ? 1 : step / distance;

    actorPosition = {
      x: actorPosition.x + dx * ratio,
      y: actorPosition.y + dy * ratio,
    };

    if (step >= distance) {
      actor.send({ type: 'ARRIVED' });
    }
  }

  function resolvePendingInteraction(context: GameContext): void {
    const pending = context.pendingInteraction;
    if (!pending) {
      actor.send({ type: 'SCRIPT_RESOLVED', result: { dialogueLines: [] } });
      return;
    }

    const room = rooms[context.currentRoomId];
    const hotspot = room?.hotspots.find((spot) => spot.id === pending.hotspotId);
    if (!room || !hotspot) {
      actor.send({
        type: 'SCRIPT_RESOLVED',
        result: { dialogueLines: ['There is nothing to interact with.'] },
      });
      return;
    }

    actor.send({
      type: 'SCRIPT_RESOLVED',
      result: resolveInteraction(context, hotspot),
    });
  }

  function renderUi(context: GameContext, inDialogue: boolean): void {
    renderVerbBar(context.selectedVerb);
    renderInventoryBar(context, assets);
    renderDevPanel(context);

    dialoguePanel.classList.toggle('hidden', !inDialogue);
    if (inDialogue) {
      dialogueText.textContent = context.dialogueLines[context.dialogueIndex] ?? '';
    }

    sentenceLine.textContent = buildSentenceLine(context, context.hoveredHotspotId);
    if (devMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = context.hoveredHotspotId ? 'pointer' : 'default';
    }
  }

  function renderVerbBar(selectedVerb: Verb): void {
    const buttons = VERBS.map((verb) => {
      const activeClass = verb === selectedVerb ? 'active' : '';
      return `<button class="${activeClass}" data-verb="${verb}">${verbLabel(verb)}</button>`;
    });

    verbBar.innerHTML = buttons.join('');
  }

  function renderInventoryBar(context: GameContext, loadedAssets: AssetStore): void {
    const slots: string[] = [];

    for (const item of context.inventory) {
      const activeClass = item.id === context.selectedInventoryItemId ? 'active' : '';
      const iconHtml = inventoryIconHtml(item.id, loadedAssets);
      slots.push(
        `<button class="inventory-item ${activeClass}" data-item-id="${item.id}">${iconHtml}<span>${item.name}</span></button>`,
      );
    }

    while (slots.length < 6) {
      slots.push('<button disabled>...</button>');
    }

    inventoryBar.innerHTML = slots.join('');
  }

  function renderDevPanel(context: GameContext): void {
    devPanel.classList.toggle('hidden', !devMode);
    if (!devMode) {
      return;
    }

    const room = rooms[context.currentRoomId];
    const hotspot = room?.hotspots.find((spot) => spot.id === selectedHotspotId) ?? null;
    const line1 = `DEV EDITOR (F3): ${context.currentRoomId}`;
    const line2 = `Target [1/2/3]: ${devEditTarget}`;
    const line3 = hotspot ? `Selected: ${hotspot.id}` : 'Selected: (click a hotspot)';
    const line4 = `Actor size +/-: ${actorSize.width}x${actorSize.height}`;
    const line5 = 'Move: arrows (Shift=5px) | Rect size: [ ] and ; \'';
    const line6 = 'Copy hotspot JSON: C or button';
    devInfo.textContent = [line1, line2, line3, line4, line5, line6].join('\n');
  }

  function buildSentenceLine(context: GameContext, hoveredHotspotId: string | null): string {
    if (devMode) {
      return 'Dev editor active (F3): click hotspot, then move/resize with keyboard.';
    }

    const room = rooms[context.currentRoomId];
    const hotspotName = room?.hotspots.find((spot) => spot.id === hoveredHotspotId)?.name ?? '';
    const selectedItemName =
      context.inventory.find((item) => item.id === context.selectedInventoryItemId)?.name ?? context.selectedInventoryItemId;

    if (context.selectedVerb === 'USE' && selectedItemName && hotspotName) {
      return `Use ${selectedItemName} with ${hotspotName}`;
    }

    if (context.selectedVerb && hotspotName) {
      return `${verbLabel(context.selectedVerb)} ${hotspotName}`;
    }

    if (context.selectedVerb === 'USE' && !context.selectedInventoryItemId) {
      return 'Use ... with ...';
    }

    return 'Look around.';
  }

  function getVisibleHotspots(context: GameContext): Hotspot[] {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return [];
    }

    return room.hotspots.filter((spot) => isHotspotVisible(context.currentRoomId, spot.id, context.flags));
  }

  function spawnPointForRoom(roomId: string): { x: number; y: number } {
    if (roomId === 'room2') {
      return { x: 46, y: 150 };
    }

    return { x: 96, y: 150 };
  }

  function adjustSelectedHotspot(
    context: GameContext,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const room = rooms[context.currentRoomId];
    if (!room || !selectedHotspotId) {
      return;
    }

    const hotspot = room.hotspots.find((spot) => spot.id === selectedHotspotId);
    if (!hotspot) {
      return;
    }

    if (devEditTarget === 'walkTarget') {
      hotspot.walkTarget.x += dx;
      hotspot.walkTarget.y += dy;
      return;
    }

    const rect = getEditableRect(hotspot, devEditTarget);
    rect.x += dx;
    rect.y += dy;
    rect.w = Math.max(1, rect.w + dw);
    rect.h = Math.max(1, rect.h + dh);
  }

  async function copyCurrentRoomHotspots(context: GameContext): Promise<void> {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }

    const text = JSON.stringify(room.hotspots, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      devInfo.textContent = `${devInfo.textContent}\nClipboard blocked. Copy manually:\n${text}`;
    }
  }

  function adjustActorSize(dw: number, dh: number, fast: boolean): void {
    const step = fast ? 5 : 1;
    actorSize.width = clamp(actorSize.width + dw * step, 16, 160);
    actorSize.height = clamp(actorSize.height + dh * step, 16, 180);
  }

  window.addEventListener('beforeunload', () => {
    input.destroy();
    window.removeEventListener('keydown', onKeyDown);
  });
}

function getEditableRect(hotspot: Hotspot, target: 'bounds' | 'spriteBounds'): Rect {
  if (target === 'spriteBounds') {
    if (!hotspot.spriteBounds) {
      hotspot.spriteBounds = { ...hotspot.bounds };
    }
    return hotspot.spriteBounds;
  }

  return hotspot.bounds;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inventoryIconHtml(itemId: string, assets: AssetStore): string {
  if (itemId === 'key') {
    return `<img class="inventory-icon" src="${assets.getImageUrl('inventoryKey')}" alt="">`;
  }

  return '';
}

function verbLabel(verb: Verb): string {
  switch (verb) {
    case 'PICK_UP':
      return 'Pick up';
    default:
      return `${verb.charAt(0)}${verb.slice(1).toLowerCase()}`;
  }
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element with id: ${id}`);
  }

  return element as T;
}

function isVerb(value: string | undefined): value is Verb {
  return value === 'LOOK' || value === 'TALK' || value === 'PICK_UP' || value === 'USE';
}
