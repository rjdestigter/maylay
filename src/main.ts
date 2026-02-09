import './style.css';
import musicRoom1Url from './assets/music_room1.mp3';
import forestAmbienceUrl from './assets/forest_ambience.mp3';

import { createActor } from 'xstate';
import { createAssets, type AssetStore } from './engine/assets';
import { createInputController } from './engine/input';
import { Renderer } from './engine/renderer';
import { resolveInteraction } from './game/scripts';
import { gameMachine, type GameContext } from './game/stateMachine';
import { defaultRoomId, isHotspotVisible, rooms } from './game/rooms/rooms';
import type { Hotspot, Point, Rect, RoomDefinition, Verb } from './game/types';

const WALK_SPEED = 80;
const STOP_DISTANCE = 2;
const WALK_CYCLE_HZ = 4;
const IDLE_CYCLE_HZ = 0.75;
const SELF_HOTSPOT_ID = '__self__';
const VERBS: Verb[] = ['LOOK', 'TALK', 'PICK_UP', 'USE', 'OPEN'];
const CURSOR_IDLE = makeCursorCss(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="none"/>
    <path d="M6 4 L22 17 L16 18 L20 28 L16 30 L12 20 L8 24 Z" fill="#f3e4bc" stroke="#2c1d10" stroke-width="2"/>
  </svg>`,
  3,
  3,
  'default',
);
const CURSOR_INTERACT = makeCursorCss(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="none"/>
    <circle cx="20" cy="20" r="11" fill="#7dd9ff" opacity="0.22"/>
    <path d="M18 7 L22 7 L22 20 L29 20 L20 33 L11 20 L18 20 Z"
      transform="rotate(-135 20 20)"
      fill="#8fdfff" stroke="#0f2e4a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 5 L31 8 L34 9 L31 10 L30 13 L29 10 L26 9 L29 8 Z"
      fill="#79d7ff" stroke="#0f2e4a" stroke-width="0.9"/>
  </svg>`,
  24,
  16,
  'pointer',
);
const CURSOR_INTERACT_SPARKLE = makeCursorCss(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="none"/>
    <path d="M18 7 L22 7 L22 20 L29 20 L20 33 L11 20 L18 20 Z"
      transform="rotate(-135 20 20)"
      fill="#8fdfff" stroke="#0f2e4a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 6 L31.2 9.2 L34.5 10.5 L31.2 11.8 L30 15 L28.8 11.8 L25.5 10.5 L28.8 9.2 Z" fill="#9de4ff" stroke="#0f2e4a" stroke-width="0.9"/>
    <path d="M9 9 L10 11 L12 12 L10 13 L9 15 L8 13 L6 12 L8 11 Z" fill="#9de4ff" stroke="#0f2e4a" stroke-width="0.8"/>
    <circle cx="30.5" cy="10.5" r="2.8" fill="#caf0ff" opacity="0.42"/>
    <circle cx="9" cy="12" r="2" fill="#caf0ff" opacity="0.34"/>
  </svg>`,
  24,
  16,
  'pointer',
);
const CURSOR_INTERACT_SPARKLE_BRIGHT = makeCursorCss(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="none"/>
    <path d="M18 7 L22 7 L22 20 L29 20 L20 33 L11 20 L18 20 Z"
      transform="rotate(-135 20 20)"
      fill="#8fdfff" stroke="#0f2e4a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 5 L31.4 9 L35 10.4 L31.4 11.8 L30 15.8 L28.6 11.8 L25 10.4 L28.6 9 Z" fill="#b8ecff" stroke="#0f2e4a" stroke-width="0.95"/>
    <path d="M9 9 L10 11 L12 12 L10 13 L9 15 L8 13 L6 12 L8 11 Z" fill="#b8ecff" stroke="#0f2e4a" stroke-width="0.85"/>
    <path d="M28 24 L29 26 L31 27 L29 28 L28 30 L27 28 L25 27 L27 26 Z" fill="#9de4ff" stroke="#0f2e4a" stroke-width="0.8"/>
    <circle cx="30.5" cy="10.8" r="3.3" fill="#d7f5ff" opacity="0.5"/>
    <circle cx="9" cy="12" r="2.5" fill="#d7f5ff" opacity="0.4"/>
    <circle cx="28" cy="27" r="2.1" fill="#d7f5ff" opacity="0.4"/>
  </svg>`,
  24,
  16,
  'pointer',
);
const CURSOR_WALK_FRAMES = [
  makeWalkCursorCss(0),
  makeWalkCursorCss(1),
  makeWalkCursorCss(2),
  makeWalkCursorCss(1),
];
const CURSOR_DEV = makeCursorCss(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="none"/>
    <path d="M4 24 L8 28 L24 12 L20 8 Z" fill="#6fe3ff" stroke="#0b2f39" stroke-width="2"/>
    <rect x="19" y="4" width="6" height="6" transform="rotate(45 22 7)" fill="#f7d47f" stroke="#3a2613" stroke-width="2"/>
  </svg>`,
  4,
  27,
  'crosshair',
);
type DevEditTarget = 'bounds' | 'spriteBounds' | 'walkTarget' | 'walkablePolygon' | 'perspective';
type DevRectHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type DevDragState =
  | {
      target: 'bounds' | 'spriteBounds';
      hotspotId: string;
      handle: DevRectHandle;
      startPoint: Point;
      startRect: Rect;
    }
  | {
      target: 'walkTarget';
      hotspotId: string;
      startPoint: Point;
      startWalkTarget: Point;
    }
  | {
      target: 'walkablePolygon';
      vertexIndex: number;
      startPoint: Point;
      startVertex: Point;
    }
  | {
      target: 'perspectiveY';
      field: 'farY' | 'nearY';
      startPoint: Point;
      startValue: number;
    };
type SentenceParts = {
  prefix: string;
  target?: string;
  connector?: string;
  secondaryTarget?: string;
  muted?: boolean;
};
const DEV_TARGETS: Array<{ value: DevEditTarget; label: string; key: string }> = [
  { value: 'bounds', label: 'Hotspot', key: '1' },
  { value: 'spriteBounds', label: 'Sprite', key: '2' },
  { value: 'walkTarget', label: 'Walk Target', key: '3' },
  { value: 'walkablePolygon', label: 'Walkable Poly', key: '4' },
  { value: 'perspective', label: 'Perspective', key: '5' },
];
const DEV_TOOL_HINTS: Record<DevEditTarget, string> = {
  bounds: 'Hotspot tool: drag corner handles to resize bounds, center to move.',
  spriteBounds: 'Sprite tool: tune rendered sprite placement/size without changing hit area.',
  walkTarget: 'Walk Target tool: drag target handle where actor should stop to interact.',
  walkablePolygon: 'Walkable Poly tool: drag vertices, click edge to insert, Shift/Alt/right-click/Delete to remove.',
  perspective: 'Perspective tool: drag far/near guide lines on canvas and tune scales with sliders.',
};

void bootstrap();

async function bootstrap(): Promise<void> {
  const canvas = getRequiredElement<HTMLCanvasElement>('game-canvas');
  const sentenceLine = getRequiredElement<HTMLDivElement>('sentence-line');
  const verbBar = getRequiredElement<HTMLDivElement>('verb-bar');
  const inventoryBar = getRequiredElement<HTMLDivElement>('inventory-bar');
  const dialoguePanel = getRequiredElement<HTMLDivElement>('dialogue-panel');
  const dialogueText = getRequiredElement<HTMLParagraphElement>('dialogue-text');
  const audioUnlock = getRequiredElement<HTMLButtonElement>('audio-unlock');
  const musicToggle = getRequiredElement<HTMLButtonElement>('music-toggle');
  const sfxToggle = getRequiredElement<HTMLButtonElement>('sfx-toggle');
  const voiceToggle = getRequiredElement<HTMLButtonElement>('voice-toggle');
  const devPanel = getRequiredElement<HTMLDivElement>('dev-panel');
  const devGui = getRequiredElement<HTMLDivElement>('dev-gui');
  const devInfo = getRequiredElement<HTMLPreElement>('dev-info');
  const devCopy = getRequiredElement<HTMLButtonElement>('dev-copy');

  const assets = await createAssets();
  const renderer = new Renderer(canvas, assets);
  const logicalWidth = renderer.width;
  const logicalHeight = renderer.height;
  const actor = createActor(gameMachine);
  let debugHotspots = false;
  let devMode = false;
  let devShowAdvanced = false;
  let devEditTarget: DevEditTarget = 'bounds';
  let selectedHotspotId: string | null = null;
  let devDragState: DevDragState | null = null;
  let suppressNextDevClick = false;
  let pointerCanvasPoint: Point | null = null;
  let hoveredPolygonVertexIndex: number | null = null;
  let hoveredPerspectiveHandle: 'farY' | 'nearY' | null = null;

  let actorPosition = { x: 96, y: 150 };
  let actorSize = { width: 54, height: 68 };
  let actorFacing: 'left' | 'right' = 'right';
  let actorCycle = 0;
  let previousRoomId = 'room1';
  let hoveredWalkableArea = false;
  let currentWalkPath: { x: number; y: number }[] = [];
  let currentWalkKey: string | null = null;
  const backgroundMusic = createBackgroundMusic(musicRoom1Url);
  const backgroundSfx = createBackgroundMusic(forestAmbienceUrl);
  const voicePlayer = createVoicePlayer();
  let musicEnabled = true;
  let sfxEnabled = true;
  let voiceEnabled = true;
  let musicBlocked = false;
  let sfxBlocked = false;
  let audioUnlocked = false;
  let wasInDialogue = false;
  let lastSpokenDialogueKey: string | null = null;
  let devPersistStatus = 'Room persistence: not saved';
  let pendingRoomEntryPoint: Point | null = null;

  const refreshAudioLabels = (): void => {
    musicToggle.textContent = musicEnabled ? (musicBlocked ? 'Music: On (tap)' : 'Music: On') : 'Music: Off';
    sfxToggle.textContent = sfxEnabled ? (sfxBlocked ? 'SFX: On (tap)' : 'SFX: On') : 'SFX: Off';
    audioUnlock.hidden = audioUnlocked;
  };

  const tryStartEnabledAudio = (): void => {
    if (musicEnabled) {
      void backgroundMusic.play().then(() => {
        musicBlocked = false;
        audioUnlocked = true;
        refreshAudioLabels();
      }).catch(() => {
        musicBlocked = true;
        refreshAudioLabels();
      });
    }
    if (sfxEnabled) {
      void backgroundSfx.play().then(() => {
        sfxBlocked = false;
        audioUnlocked = true;
        refreshAudioLabels();
      }).catch(() => {
        sfxBlocked = true;
        refreshAudioLabels();
      });
    }
  };

  const setMusicEnabled = (enabled: boolean): void => {
    musicEnabled = enabled;
    if (enabled) {
      tryStartEnabledAudio();
    } else {
      musicBlocked = false;
      backgroundMusic.pause();
      refreshAudioLabels();
    }
    refreshAudioLabels();
  };

  musicToggle.addEventListener('click', () => {
    setMusicEnabled(!musicEnabled);
  });

  const setSfxEnabled = (enabled: boolean): void => {
    sfxEnabled = enabled;
    if (enabled) {
      tryStartEnabledAudio();
    } else {
      sfxBlocked = false;
      backgroundSfx.pause();
      refreshAudioLabels();
    }
    refreshAudioLabels();
  };

  sfxToggle.addEventListener('click', () => {
    setSfxEnabled(!sfxEnabled);
  });

  const setVoiceEnabled = (enabled: boolean, announce: boolean = true): void => {
    if (!voicePlayer.isSupported()) {
      voiceEnabled = false;
      voiceToggle.textContent = 'Voice: Unavailable';
      voiceToggle.disabled = true;
      return;
    }
    voiceEnabled = enabled;
    voiceToggle.textContent = voiceEnabled ? 'Voice: On' : 'Voice: Off';
    if (!voiceEnabled) {
      voicePlayer.cancel();
      return;
    }
    if (announce) {
      voicePlayer.speak('Voice enabled.');
    }
    const snapshot = actor.getSnapshot();
    if (snapshot.matches('dialogue')) {
      const line = snapshot.context.dialogueLines[snapshot.context.dialogueIndex];
      if (line) {
        voicePlayer.speak(line);
      }
    }
  };

  voiceToggle.addEventListener('click', () => {
    setVoiceEnabled(!voiceEnabled);
  });
  if (!voicePlayer.isSupported()) {
    voiceToggle.textContent = 'Voice: Unavailable';
    voiceToggle.disabled = true;
  } else {
    setVoiceEnabled(true, false);
  }
  setMusicEnabled(true);
  setSfxEnabled(true);
  refreshAudioLabels();
  audioUnlock.addEventListener('click', () => {
    tryStartEnabledAudio();
  });
  window.addEventListener('pointerdown', tryStartEnabledAudio);
  window.addEventListener('keydown', tryStartEnabledAudio);

  const input = createInputController({
    canvas,
    logicalWidth,
    logicalHeight,
    getHotspots: () => getInputHotspots(actor.getSnapshot().context),
    sendEvent: (event) => actor.send(event),
    onPointerMove: (point, hotspot) => {
      pointerCanvasPoint = point;
      if (devMode && devEditTarget === 'walkablePolygon' && point) {
        const room = rooms[actor.getSnapshot().context.currentRoomId];
        const index = hitTestPolygonVertex(point, room?.walkablePolygon ?? []);
        hoveredPolygonVertexIndex = index >= 0 ? index : null;
      } else {
        hoveredPolygonVertexIndex = null;
      }
      if (devMode && devEditTarget === 'perspective' && point) {
        const room = rooms[actor.getSnapshot().context.currentRoomId];
        const perspective = room ? ensureRoomPerspective(room) : null;
        hoveredPerspectiveHandle = perspective ? hitTestPerspectiveGuide(point, perspective) : null;
      } else if (!devDragState || devDragState.target !== 'perspectiveY') {
        hoveredPerspectiveHandle = null;
      }
      if (!point || hotspot) {
        hoveredWalkableArea = false;
        return;
      }
      const room = rooms[actor.getSnapshot().context.currentRoomId];
      const polygon = room?.walkablePolygon;
      hoveredWalkableArea = !polygon || polygon.length < 3 || isPointInPolygon(point, polygon);
    },
    canProcessInteraction: () => !devMode,
    onCanvasClick: (point, hotspot, event) => {
      if (!devMode) {
        if (!hotspot) {
          const room = rooms[actor.getSnapshot().context.currentRoomId];
          const polygon = room?.walkablePolygon;
          const insideWalkable = !polygon || polygon.length < 3 || isPointInPolygon(point, polygon);
          if (insideWalkable) {
            actor.send({
              type: 'HOTSPOT_CLICKED',
              hotspotId: '__walk__',
              walkTarget: point,
            });
          }
        }
        return;
      }

      if (suppressNextDevClick) {
        suppressNextDevClick = false;
        return;
      }

      if (devEditTarget === 'walkablePolygon') {
        const room = rooms[actor.getSnapshot().context.currentRoomId];
        if (!room) {
          return;
        }
        if (!room.walkablePolygon) {
          room.walkablePolygon = [];
        }
        const polygon = room.walkablePolygon;
        if (event.ctrlKey) {
          room.walkablePolygon = [];
          return;
        }
        if (event.shiftKey || event.altKey) {
          const deleteIndex = hitTestPolygonVertex(point, polygon);
          if (deleteIndex >= 0) {
            polygon.splice(deleteIndex, 1);
          }
          return;
        }
        const newPoint = { x: Math.round(point.x), y: Math.round(point.y) };
        const insertIndex = findPolygonInsertIndex(point, polygon, 8);
        if (insertIndex >= 0) {
          polygon.splice(insertIndex, 0, newPoint);
        } else {
          polygon.push(newPoint);
        }
        return;
      }

      const context = actor.getSnapshot().context;
      const visibleHotspots = getVisibleHotspots(context);
      if (devEditTarget === 'walkTarget') {
        const candidate = findHotspotByWalkTarget(point, visibleHotspots, 8);
        selectedHotspotId = candidate?.id ?? null;
        return;
      }
      if (devEditTarget === 'spriteBounds') {
        const candidate = findHotspotByRect(point, visibleHotspots, 'spriteBounds');
        selectedHotspotId = candidate?.id ?? null;
        return;
      }
      if (devEditTarget === 'bounds') {
        const candidate = findHotspotByRect(point, visibleHotspots, 'bounds');
        selectedHotspotId = candidate?.id ?? null;
        return;
      }

      selectedHotspotId = hotspot?.id === SELF_HOTSPOT_ID ? null : hotspot?.id ?? null;
    },
  });

  const refreshUi = (): void => {
    const snapshot = actor.getSnapshot();
    renderUi(snapshot.context, snapshot.matches('dialogue'));
  };

  const onDevPointerDown = (event: PointerEvent): void => {
    if (!devMode) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (
      devEditTarget !== 'bounds'
      && devEditTarget !== 'spriteBounds'
      && devEditTarget !== 'walkTarget'
      && devEditTarget !== 'walkablePolygon'
      && devEditTarget !== 'perspective'
    ) {
      return;
    }
    const point = toCanvasPoint(event, canvas, logicalWidth, logicalHeight);
    if (!point) {
      return;
    }
    const snapshot = actor.getSnapshot();
    const room = rooms[snapshot.context.currentRoomId];
    if (!room) {
      return;
    }

    if (devEditTarget === 'walkablePolygon') {
      const polygon = room.walkablePolygon ?? [];
      const vertexIndex = hitTestPolygonVertex(point, polygon);
      if (vertexIndex < 0) {
        return;
      }
      devDragState = {
        target: 'walkablePolygon',
        vertexIndex,
        startPoint: point,
        startVertex: { ...polygon[vertexIndex] },
      };
    } else if (devEditTarget === 'perspective') {
      const perspective = ensureRoomPerspective(room);
      const field = hitTestPerspectiveGuide(point, perspective);
      if (!field) {
        return;
      }
      hoveredPerspectiveHandle = field;
      devDragState = {
        target: 'perspectiveY',
        field,
        startPoint: point,
        startValue: perspective[field],
      };
    } else {
      if (devEditTarget === 'walkTarget') {
        const candidate = findHotspotByWalkTarget(point, getVisibleHotspots(snapshot.context), 8);
        if (!candidate) {
          return;
        }
        selectedHotspotId = candidate.id;
        devDragState = {
          target: 'walkTarget',
          hotspotId: candidate.id,
          startPoint: point,
          startWalkTarget: { ...candidate.walkTarget },
        };
      } else {
        const visibleHotspots = getVisibleHotspots(snapshot.context);
        const hitHandle = findRectHandleHit(
          point,
          visibleHotspots,
          devEditTarget,
          selectedHotspotId,
        );
        if (!hitHandle) {
          return;
        }
        selectedHotspotId = hitHandle.hotspot.id;
        devDragState = {
          target: devEditTarget,
          hotspotId: hitHandle.hotspot.id,
          handle: hitHandle.handle,
          startPoint: point,
          startRect: { ...getEditableRect(hitHandle.hotspot, devEditTarget) },
        };
      }
    }

    if (devDragState) {
      canvas.setPointerCapture(event.pointerId);
      suppressNextDevClick = true;
      event.preventDefault();
      refreshUi();
    }
  };

  const onDevPointerMove = (event: PointerEvent): void => {
    const dragState = devDragState;
    if (!dragState || !devMode) {
      return;
    }
    const point = toCanvasPoint(event, canvas, logicalWidth, logicalHeight);
    if (!point) {
      return;
    }
    const snapshot = actor.getSnapshot();
    const room = rooms[snapshot.context.currentRoomId];
    if (!room) {
      return;
    }

    const dx = point.x - dragState.startPoint.x;
    const dy = point.y - dragState.startPoint.y;

    if (dragState.target === 'walkablePolygon') {
      const polygon = room.walkablePolygon;
      if (!polygon || dragState.vertexIndex < 0 || dragState.vertexIndex >= polygon.length) {
        return;
      }
      polygon[dragState.vertexIndex].x = clamp(Math.round(dragState.startVertex.x + dx), 0, room.width);
      polygon[dragState.vertexIndex].y = clamp(Math.round(dragState.startVertex.y + dy), 0, room.height);
      refreshUi();
      return;
    }

    if (dragState.target === 'perspectiveY') {
      const perspective = ensureRoomPerspective(room);
      const nextY = Math.round(dragState.startValue + dy);
      if (dragState.field === 'farY') {
        perspective.farY = clamp(nextY, 0, perspective.nearY - 1);
      } else {
        perspective.nearY = clamp(nextY, perspective.farY + 1, room.height);
      }
      hoveredPerspectiveHandle = dragState.field;
      refreshUi();
      return;
    }

    const hotspot = room.hotspots.find((spot) => spot.id === dragState.hotspotId);
    if (!hotspot) {
      return;
    }

    if (dragState.target === 'walkTarget') {
      hotspot.walkTarget.x = clamp(Math.round(dragState.startWalkTarget.x + dx), 0, room.width);
      hotspot.walkTarget.y = clamp(Math.round(dragState.startWalkTarget.y + dy), 0, room.height);
    } else {
      const nextRect = computeDraggedRect(dragState.startRect, dragState.handle, dx, dy);
      const boundedRect = clampRectToRoom(nextRect, room.width, room.height);
      const rect = getEditableRect(hotspot, dragState.target);
      rect.x = boundedRect.x;
      rect.y = boundedRect.y;
      rect.w = boundedRect.w;
      rect.h = boundedRect.h;
    }
    refreshUi();
  };

  const onDevPointerUp = (event: PointerEvent): void => {
    if (!devDragState) {
      return;
    }
    if (devDragState.target === 'perspectiveY') {
      hoveredPerspectiveHandle = null;
    }
    devDragState = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    refreshUi();
  };

  const onDevContextMenu = (event: MouseEvent): void => {
    if (!devMode || devEditTarget !== 'walkablePolygon') {
      return;
    }
    const room = rooms[actor.getSnapshot().context.currentRoomId];
    const polygon = room?.walkablePolygon;
    if (!polygon || polygon.length === 0) {
      event.preventDefault();
      return;
    }
    const point = toCanvasPoint(event, canvas, logicalWidth, logicalHeight);
    if (!point) {
      event.preventDefault();
      return;
    }
    const deleteIndex = hitTestPolygonVertex(point, polygon);
    if (deleteIndex >= 0) {
      polygon.splice(deleteIndex, 1);
      hoveredPolygonVertexIndex = null;
      refreshUi();
    }
    event.preventDefault();
  };

  canvas.addEventListener('pointerdown', onDevPointerDown);
  canvas.addEventListener('pointermove', onDevPointerMove);
  canvas.addEventListener('pointerup', onDevPointerUp);
  canvas.addEventListener('pointercancel', onDevPointerUp);
  canvas.addEventListener('contextmenu', onDevContextMenu);

  verbBar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-verb]');
    if (!button) {
      return;
    }

    const verb = button.dataset.verb;
    if (!isVerb(verb)) {
      return;
    }

    const currentVerb = actor.getSnapshot().context.selectedVerb;
    actor.send({ type: 'VERB_SELECTED', verb: currentVerb === verb ? null : verb });
  });

  inventoryBar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-item-id]');
    if (!button) {
      return;
    }

    const itemId = button.dataset.itemId ?? null;
    actor.send({ type: 'INVENTORY_SELECTED', itemId });
  });

  dialoguePanel.addEventListener('click', () => {
    const snapshot = actor.getSnapshot();
    if (!snapshot.matches('dialogue')) {
      return;
    }

    voicePlayer.cancel();
    actor.send({ type: 'DIALOGUE_ADVANCE' });
  });

  devCopy.addEventListener('click', () => {
    void copyCurrentRoomHotspots(actor.getSnapshot().context);
  });
  devPanel.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) {
      return;
    }
    let changed = false;

    const nextTarget = button.dataset.devTarget;
    if (isDevEditTarget(nextTarget)) {
      devEditTarget = nextTarget;
      changed = true;
    }
    if (!changed && button.dataset.devAction === 'clear-selection') {
      selectedHotspotId = null;
      changed = true;
    }
    if (!changed && button.dataset.devAction === 'add-hotspot') {
      changed = addHotspot(actor.getSnapshot().context);
    }
    if (!changed && button.dataset.devAction === 'add-room-link-hotspot') {
      changed = addRoomLinkHotspot(actor.getSnapshot().context);
    }
    if (!changed && button.dataset.devAction === 'edit-hotspot-description') {
      changed = editSelectedHotspotDescription(actor.getSnapshot().context);
    }
    if (!changed && button.dataset.devAction === 'save-room') {
      void persistCurrentRoom(actor.getSnapshot().context);
      return;
    }
    if (!changed && button.dataset.devAction === 'toggle-advanced') {
      devShowAdvanced = !devShowAdvanced;
      changed = true;
    }
    if (!changed && button.dataset.devAction === 'clear-polygon') {
      const room = rooms[actor.getSnapshot().context.currentRoomId];
      if (room) {
        room.walkablePolygon = [];
        hoveredPolygonVertexIndex = null;
        changed = true;
      }
    }
    if (!changed && button.dataset.devAction === 'init-sprite-bounds') {
      const room = rooms[actor.getSnapshot().context.currentRoomId];
      const hotspot = room?.hotspots.find((spot) => spot.id === selectedHotspotId);
      if (hotspot) {
        hotspot.spriteBounds = { ...hotspot.bounds };
        changed = true;
      }
    }
    if (!changed && button.dataset.devAction === 'clear-sprite-bounds') {
      const room = rooms[actor.getSnapshot().context.currentRoomId];
      const hotspot = room?.hotspots.find((spot) => spot.id === selectedHotspotId);
      if (hotspot) {
        hotspot.spriteBounds = undefined;
        changed = true;
      }
    }
    if (changed) {
      const snapshot = actor.getSnapshot();
      renderUi(snapshot.context, snapshot.matches('dialogue'));
    }
  });
  devPanel.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const key = target.dataset.devPerspectiveValue;
    if (!isPerspectiveValueField(key)) {
      return;
    }
    const room = rooms[actor.getSnapshot().context.currentRoomId];
    if (!room) {
      return;
    }
    const perspective = ensureRoomPerspective(room);
    const parsed = Number.parseFloat(target.value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setPerspectiveValue(room, perspective, key, parsed);
    refreshUi();
  });

  actor.subscribe((snapshot) => {
    const context = snapshot.context;
    const inDialogue = snapshot.matches('dialogue');
    renderUi(context, inDialogue);

    if (voiceEnabled && inDialogue) {
      const line = context.dialogueLines[context.dialogueIndex] ?? '';
      const speakKey = `${context.currentRoomId}:${context.dialogueIndex}:${line}`;
      if (line && speakKey !== lastSpokenDialogueKey) {
        voicePlayer.speak(line);
        lastSpokenDialogueKey = speakKey;
      }
    }
    if (!inDialogue && wasInDialogue) {
      voicePlayer.cancel();
      lastSpokenDialogueKey = null;
    }
    wasInDialogue = inDialogue;

    if (context.currentRoomId !== previousRoomId) {
      previousRoomId = context.currentRoomId;
      actorPosition = pendingRoomEntryPoint ?? spawnPointForRoom(context.currentRoomId);
      pendingRoomEntryPoint = null;
      currentWalkPath = [];
      currentWalkKey = null;
      voicePlayer.cancel();
      lastSpokenDialogueKey = null;
    }
  });

  actor.start();
  actor.send({ type: 'BOOTED' });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (shouldIgnoreKeyboardShortcut(event)) {
      return;
    }

    if (event.key === 'F2') {
      debugHotspots = !debugHotspots;
      refreshUi();
      event.preventDefault();
      return;
    }

    if (event.key === 'F3') {
      devMode = !devMode;
      if (!devMode) {
        selectedHotspotId = null;
        devDragState = null;
        hoveredPerspectiveHandle = null;
      }
      refreshUi();
      event.preventDefault();
      return;
    }

    if (!devMode) {
      const shortcutVerb = keyboardShortcutVerb(event.key);
      if (shortcutVerb) {
        const currentVerb = actor.getSnapshot().context.selectedVerb;
        actor.send({ type: 'VERB_SELECTED', verb: currentVerb === shortcutVerb ? null : shortcutVerb });
        refreshUi();
        event.preventDefault();
        return;
      }
    }

    if (!devMode) {
      return;
    }

    if (event.key === '1') {
      devEditTarget = 'bounds';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key === '2') {
      devEditTarget = 'spriteBounds';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key === '3') {
      devEditTarget = 'walkTarget';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key === '4') {
      devEditTarget = 'walkablePolygon';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key === '5') {
      devEditTarget = 'perspective';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 'c') {
      void copyCurrentRoomHotspots(actor.getSnapshot().context);
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 's') {
      void persistCurrentRoom(actor.getSnapshot().context);
      event.preventDefault();
      return;
    }
    if (devEditTarget === 'walkablePolygon' && (event.key === 'Delete' || event.key === 'Backspace')) {
      const room = rooms[actor.getSnapshot().context.currentRoomId];
      const polygon = room?.walkablePolygon;
      if (polygon && polygon.length > 0) {
        const index = hoveredPolygonVertexIndex ?? (polygon.length - 1);
        if (index >= 0 && index < polygon.length) {
          polygon.splice(index, 1);
          hoveredPolygonVertexIndex = null;
          refreshUi();
        }
      }
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
      if (devEditTarget === 'perspective') {
        nudgePerspective(actor.getSnapshot().context, 'nearScale', -moveStep * 0.01);
        event.preventDefault();
        return;
      }
      adjustSelectedHotspot(actor.getSnapshot().context, -moveStep, 0, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowRight') {
      if (devEditTarget === 'perspective') {
        nudgePerspective(actor.getSnapshot().context, 'nearScale', moveStep * 0.01);
        event.preventDefault();
        return;
      }
      adjustSelectedHotspot(actor.getSnapshot().context, moveStep, 0, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      if (devEditTarget === 'perspective') {
        nudgePerspective(actor.getSnapshot().context, event.shiftKey ? 'farY' : 'nearY', -moveStep);
        event.preventDefault();
        return;
      }
      adjustSelectedHotspot(actor.getSnapshot().context, 0, -moveStep, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      if (devEditTarget === 'perspective') {
        nudgePerspective(actor.getSnapshot().context, event.shiftKey ? 'farY' : 'nearY', moveStep);
        event.preventDefault();
        return;
      }
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
      actorCycle = (actorCycle + deltaSeconds * WALK_CYCLE_HZ) % 1;
    } else {
      actorCycle = (actorCycle + deltaSeconds * IDLE_CYCLE_HZ) % 1;
    }

    if (snapshot.matches('interacting')) {
      resolvePendingInteraction(snapshot.context);
    }

    updateCursor(snapshot.context, now);
    drawFrame(snapshot.context, isWalking);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  function drawFrame(context: GameContext, isWalking: boolean): void {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }
    const perspectiveScale = getPerspectiveScale(room, actorPosition.y);

    renderer.render({
      room,
      actor: {
        ...actorPosition,
        width: actorSize.width * perspectiveScale,
        height: actorSize.height * perspectiveScale,
        facing: actorFacing,
        isWalking,
        walkCycle: actorCycle,
      },
      hotspots: getVisibleHotspots(context),
      walkablePolygon: room.walkablePolygon,
      debugHotspots: debugHotspots || devMode,
      flags: context.flags,
      devEditor: {
        enabled: devMode,
        selectedHotspotId,
        editTarget: devEditTarget,
        polygonHoverVertexIndex: hoveredPolygonVertexIndex,
        polygonDragVertexIndex: devDragState?.target === 'walkablePolygon' ? devDragState.vertexIndex : null,
        perspective: room.perspective,
        perspectiveHoverHandle: hoveredPerspectiveHandle,
        perspectiveDragHandle: devDragState?.target === 'perspectiveY' ? devDragState.field : null,
        actorBaseSize: { ...actorSize },
        actorFeetY: actorPosition.y,
      },
    });
  }

  function stepWalking(context: GameContext, deltaSeconds: number): void {
    const pending = context.pendingInteraction;
    if (!pending) {
      currentWalkPath = [];
      currentWalkKey = null;
      actor.send({ type: 'ARRIVED' });
      return;
    }

    const room = rooms[context.currentRoomId];
    const polygon = room?.walkablePolygon && room.walkablePolygon.length >= 3 ? room.walkablePolygon : null;
    if (polygon) {
      actorPosition = closestPointOnWalkablePolygon(actorPosition, polygon);
    }
    const target = polygon
      ? closestPointOnWalkablePolygon(pending.walkTarget, polygon)
      : pending.walkTarget;

    if (!polygon) {
      currentWalkPath = [target];
      currentWalkKey = null;
    } else {
      const walkKey = `${Math.round(actorPosition.x)},${Math.round(actorPosition.y)}->${Math.round(target.x)},${Math.round(target.y)}`;
      if (walkKey !== currentWalkKey || currentWalkPath.length === 0) {
        currentWalkPath = computeWalkPath(actorPosition, target, polygon);
        currentWalkKey = walkKey;
      }
    }
    const activeTarget = currentWalkPath[0] ?? target;

    const dx = activeTarget.x - actorPosition.x;
    const dy = activeTarget.y - actorPosition.y;
    if (Math.abs(dx) > 0.1) {
      actorFacing = dx < 0 ? 'left' : 'right';
    }
    const distance = Math.hypot(dx, dy);

    if (distance <= STOP_DISTANCE) {
      actorPosition = { ...activeTarget };
      currentWalkPath.shift();
      if (currentWalkPath.length === 0) {
        actor.send({ type: 'ARRIVED' });
      }
      return;
    }

    const step = WALK_SPEED * deltaSeconds;
    const ratio = step >= distance ? 1 : step / distance;

    actorPosition = {
      x: actorPosition.x + dx * ratio,
      y: actorPosition.y + dy * ratio,
    };

    if (step >= distance) {
      actorPosition = { ...activeTarget };
      currentWalkPath.shift();
      if (currentWalkPath.length === 0) {
        actor.send({ type: 'ARRIVED' });
      }
    }
  }

  function resolvePendingInteraction(context: GameContext): void {
    const pending = context.pendingInteraction;
    if (!pending) {
      actor.send({ type: 'SCRIPT_RESOLVED', result: { dialogueLines: [] } });
      return;
    }
    if (pending.hotspotId === '__walk__') {
      actor.send({ type: 'SCRIPT_RESOLVED', result: { dialogueLines: [] } });
      return;
    }

    const room = rooms[context.currentRoomId];
    const hotspot = pending.hotspotId === SELF_HOTSPOT_ID
      ? getSelfHotspot(context)
      : room?.hotspots.find((spot) => spot.id === pending.hotspotId);
    if (!room || !hotspot) {
      actor.send({
        type: 'SCRIPT_RESOLVED',
        result: { dialogueLines: ['There is nothing to interact with.'] },
      });
      return;
    }

    // No selected action behaves as implicit walk-to, with auto-enter for open doors.
    if (pending.verb === null) {
      if (hotspot.targetRoomId) {
        if (!rooms[hotspot.targetRoomId]) {
          actor.send({
            type: 'SCRIPT_RESOLVED',
            result: {
              dialogueLines: [`That path should lead to "${hotspot.targetRoomId}", but that room is not loaded.`],
            },
          });
          return;
        }
        pendingRoomEntryPoint = hotspot.targetRoomEntryPoint ? { ...hotspot.targetRoomEntryPoint } : null;
        actor.send({
          type: 'SCRIPT_RESOLVED',
          result: {
            dialogueLines: [],
            roomChangeTo: hotspot.targetRoomId,
          },
        });
        return;
      }
      if (hotspot.id === 'door' && context.flags.doorOpen) {
        actor.send({
          type: 'SCRIPT_RESOLVED',
          result: {
            dialogueLines: ['You step through the open door.'],
            roomChangeTo: 'room2',
          },
        });
        return;
      }

      actor.send({ type: 'SCRIPT_RESOLVED', result: { dialogueLines: [] } });
      return;
    }

    actor.send({
      type: 'SCRIPT_RESOLVED',
      result: resolveInteraction(context, room, hotspot),
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

    const sentence = buildSentenceLine(context, context.hoveredHotspotId, hoveredWalkableArea);
    sentenceLine.innerHTML = renderSentenceLineHtml(sentence);
    updateCursor(context, performance.now());
  }

  function updateCursor(context: GameContext, nowMs: number): void {
    if (devMode) {
      const dragCursor = getDevDragCursor(context, pointerCanvasPoint, devEditTarget, selectedHotspotId, devDragState);
      if (dragCursor) {
        canvas.style.cursor = dragCursor;
        return;
      }
      canvas.style.cursor = CURSOR_DEV;
      return;
    }
    if (context.hoveredHotspotId) {
      const sparkleFrame = Math.floor(nowMs / 140) % 3;
      canvas.style.cursor = sparkleFrame === 0
        ? CURSOR_INTERACT
        : sparkleFrame === 1
          ? CURSOR_INTERACT_SPARKLE
          : CURSOR_INTERACT_SPARKLE_BRIGHT;
      return;
    }
    if (hoveredWalkableArea) {
      const walkFrame = Math.floor(nowMs / 110) % CURSOR_WALK_FRAMES.length;
      canvas.style.cursor = CURSOR_WALK_FRAMES[walkFrame];
      return;
    }
    canvas.style.cursor = CURSOR_IDLE;
  }

  function getDevDragCursor(
    context: GameContext,
    point: Point | null,
    editTarget: DevEditTarget,
    activeHotspotId: string | null,
    dragState: DevDragState | null,
  ): string | null {
    if (!point) {
      return null;
    }
    const room = rooms[context.currentRoomId];
    if (!room) {
      return null;
    }

    if (editTarget === 'walkablePolygon') {
      if (dragState?.target === 'walkablePolygon') {
        return 'grabbing';
      }
      const vertexIndex = hitTestPolygonVertex(point, room.walkablePolygon ?? []);
      return vertexIndex >= 0 ? 'grab' : null;
    }

    if (editTarget === 'perspective') {
      if (dragState?.target === 'perspectiveY') {
        return 'ns-resize';
      }
      const perspective = ensureRoomPerspective(room);
      const handle = hitTestPerspectiveGuide(point, perspective);
      return handle ? 'ns-resize' : null;
    }

    if (editTarget === 'walkTarget') {
      if (dragState?.target === 'walkTarget') {
        return 'grabbing';
      }
      const context = actor.getSnapshot().context;
      const candidate = findHotspotByWalkTarget(point, getVisibleHotspots(context), 8);
      return candidate ? 'grab' : null;
    }

    if (editTarget !== 'bounds' && editTarget !== 'spriteBounds') {
      return null;
    }
    const hitHandle = findRectHandleHit(
      point,
      getVisibleHotspots(context),
      editTarget,
      activeHotspotId,
    );
    const handle = hitHandle?.handle;
    if (!handle) {
      return null;
    }
    if (dragState?.target === editTarget) {
      return 'grabbing';
    }
    if (handle === 'move') {
      return 'grab';
    }
    if (handle === 'nw' || handle === 'se') {
      return 'nwse-resize';
    }
    return 'nesw-resize';
  }

  function renderVerbBar(selectedVerb: Verb | null): void {
    const buttons = VERBS.map((verb) => {
      const activeClass = verb === selectedVerb ? 'active' : '';
      const label = verbLabel(verb);
      return `<button class="verb-button ${activeClass}" data-verb="${verb}" aria-pressed="${verb === selectedVerb}"><span class="verb-main">${label}</span><span class="verb-key">${verb.charAt(0)}</span></button>`;
    });

    verbBar.innerHTML = buttons.join('');
  }

  function renderInventoryBar(context: GameContext, loadedAssets: AssetStore): void {
    const slots: string[] = [];

    for (const item of context.inventory) {
      const activeClass = item.id === context.selectedInventoryItemId ? 'active' : '';
      const iconHtml = inventoryIconHtml(item.id, loadedAssets);
      slots.push(
        `<button class="inventory-item ${activeClass}" data-item-id="${item.id}" aria-pressed="${item.id === context.selectedInventoryItemId}">${iconHtml}<span class="inventory-label">${item.name}</span></button>`,
      );
    }
    inventoryBar.innerHTML = slots.length > 0 ? slots.join('') : '<div class="inventory-empty-state">Inventory empty</div>';
  }

  function renderDevPanel(context: GameContext): void {
    devPanel.classList.toggle('hidden', !devMode);
    if (!devMode) {
      devGui.innerHTML = '';
      devInfo.hidden = true;
      return;
    }

    const room = rooms[context.currentRoomId];
    const hotspot = room?.hotspots.find((spot) => spot.id === selectedHotspotId) ?? null;
    const perspective = ensureRoomPerspective(room ?? getConfiguredDefaultRoom());
    const selectedStatus = hotspot
      ? `<span class="dev-status"><span class="dev-status-dot"></span>Selected: ${hotspot.id}</span>`
      : '<span class="dev-status muted">Selected: none</span>';
    const selectedDescription = hotspot?.description?.trim() ? hotspot.description.trim() : '(no description)';
    const targetButtons = DEV_TARGETS.map((option) => {
      const active = option.value === devEditTarget ? 'active' : '';
      return `<button type="button" class="dev-tool-btn ${active}" data-dev-target="${option.value}" aria-pressed="${option.value === devEditTarget}"><span class="dev-tool-name">${option.label}</span><span class="dev-tool-key">[${option.key}]</span></button>`;
    }).join('');
    const modeHint = DEV_TOOL_HINTS[devEditTarget];
    const toolInspector = renderToolInspector(room, hotspot, devEditTarget);
    devGui.innerHTML = `
      <div class="dev-tool-section">
        <div class="dev-tool-title">Tools</div>
        <div class="dev-toolbar">${targetButtons}</div>
      </div>
      <div class="dev-row">
        <span class="dev-label">Mode</span>
        <span class="dev-tool-hint">${escapeHtml(modeHint)}</span>
      </div>
      <div class="dev-row">
        <span class="dev-label">Selection</span>
        ${selectedStatus}
        <button type="button" class="dev-chip" data-dev-action="clear-selection">Clear</button>
        <button type="button" class="dev-chip" data-dev-action="add-hotspot">Add hotspot</button>
        <button type="button" class="dev-chip" data-dev-action="add-room-link-hotspot">Add room link</button>
        <button type="button" class="dev-chip ${hotspot ? '' : 'muted'}" data-dev-action="edit-hotspot-description">Edit description</button>
        <button type="button" class="dev-chip" data-dev-action="save-room">Save room</button>
        <button type="button" class="dev-chip" data-dev-action="toggle-advanced">${devShowAdvanced ? 'Hide debug' : 'Show debug'}</button>
      </div>
      ${toolInspector}
      <div class="dev-row">
        <span class="dev-label">Persistence</span>
        <span class="dev-tool-hint">${escapeHtml(devPersistStatus)}</span>
      </div>
    `;

    devInfo.hidden = !devShowAdvanced;
    if (!devShowAdvanced) {
      return;
    }

    const line1 = `DEV EDITOR (F3): ${context.currentRoomId}`;
    const line2 = `Target [1/2/3/4/5]: ${devEditTarget}`;
    const line3 = hotspot ? `Selected: ${hotspot.id}` : 'Selected: none';
    const line4 = `Description: ${selectedDescription}`;
    const line4b = hotspot
      ? `Bounds: x=${hotspot.bounds.x} y=${hotspot.bounds.y} w=${hotspot.bounds.w} h=${hotspot.bounds.h}`
      : 'Bounds: -';
    const spriteRect = hotspot?.spriteBounds ?? hotspot?.bounds;
    const line4c = spriteRect
      ? `Sprite: x=${spriteRect.x} y=${spriteRect.y} w=${spriteRect.w} h=${spriteRect.h}`
      : 'Sprite: -';
    const line4d = hotspot
      ? `Walk Target: x=${Math.round(hotspot.walkTarget.x)} y=${Math.round(hotspot.walkTarget.y)}`
      : 'Walk Target: -';
    const dragState = devDragState;
    let line4e = 'Dragging: none';
    if (dragState) {
      switch (dragState.target) {
        case 'bounds':
        case 'spriteBounds':
          line4e = `Dragging: ${dragState.target} (${dragState.handle})`;
          break;
        case 'walkTarget':
          line4e = 'Dragging: walkTarget';
          break;
        case 'walkablePolygon':
          line4e = `Dragging: walkablePolygon (vertex ${dragState.vertexIndex})`;
          break;
        case 'perspectiveY':
          line4e = `Dragging: perspective (${dragState.field})`;
          break;
      }
    }
    const line5 = `Actor size +/-: ${actorSize.width}x${actorSize.height}`;
    const line6 = `Actor render scale: ${getPerspectiveScale(room ?? getConfiguredDefaultRoom(), actorPosition.y).toFixed(2)}x`;
    const line7 = `Walkable points: ${rooms[context.currentRoomId]?.walkablePolygon?.length ?? 0}`;
    const line8 = `Perspective drag: farY=${hoveredPerspectiveHandle === 'farY' ? 'hover' : '-'} nearY=${hoveredPerspectiveHandle === 'nearY' ? 'hover' : '-'}`;
    const line9 = `Perspective values: farY=${perspective.farY} nearY=${perspective.nearY} farScale=${perspective.farScale.toFixed(2)} nearScale=${perspective.nearScale.toFixed(2)}`;
    const line10 = `Tool hint: ${modeHint}`;
    const line11 = 'Keyboard: 1-5 switch tools | arrows move | [ ] ; \' resize | C copy | S save';
    const line12 = 'Copy room JSON: C | Save room JSON: S or button';
    const line13 = devPersistStatus;
    devInfo.textContent = [line1, line2, line3, line4, line4b, line4c, line4d, line4e, line5, line6, line7, line8, line9, line10, line11, line12, line13].join('\n');
  }

  function renderToolInspector(
    room: typeof rooms[string] | undefined,
    hotspot: Hotspot | null,
    target: DevEditTarget,
  ): string {
    if (target === 'walkablePolygon') {
      const pointCount = room?.walkablePolygon?.length ?? 0;
      return `
        <div class="dev-inspector">
          <div class="dev-inspector-title">Walkable Polygon</div>
          <div class="dev-row"><span class="dev-label">Points</span><span class="dev-kv">${pointCount}</span></div>
          <div class="dev-row"><span class="dev-label">Edit</span><span class="dev-tool-hint">Drag points, click edge to insert, Shift/Alt/right-click/Delete to remove.</span></div>
          <div class="dev-row"><span class="dev-label">Actions</span><button type="button" class="dev-chip" data-dev-action="clear-polygon">Clear polygon</button></div>
        </div>
      `;
    }
    if (target === 'perspective') {
      const perspective = ensureRoomPerspective(room ?? getConfiguredDefaultRoom());
      const yMin = 0;
      const yMax = room?.height ?? 180;
      return `
        <div class="dev-inspector">
          <div class="dev-inspector-title">Perspective</div>
          <div class="dev-row"><span class="dev-label">Canvas</span><span class="dev-tool-hint">Drag cyan (far) and gold (near) guide lines directly in the room.</span></div>
          <div class="dev-row dev-slider-row">
            <span class="dev-label">farY</span>
            <input class="dev-slider" type="range" min="${yMin}" max="${yMax - 1}" step="1" value="${Math.round(perspective.farY)}" data-dev-perspective-value="farY">
            <span class="dev-kv">${Math.round(perspective.farY)}</span>
          </div>
          <div class="dev-row dev-slider-row">
            <span class="dev-label">nearY</span>
            <input class="dev-slider" type="range" min="${yMin + 1}" max="${yMax}" step="1" value="${Math.round(perspective.nearY)}" data-dev-perspective-value="nearY">
            <span class="dev-kv">${Math.round(perspective.nearY)}</span>
          </div>
          <div class="dev-row dev-slider-row">
            <span class="dev-label">farScale</span>
            <input class="dev-slider" type="range" min="0.25" max="1.5" step="0.01" value="${perspective.farScale.toFixed(2)}" data-dev-perspective-value="farScale">
            <span class="dev-kv">${perspective.farScale.toFixed(2)}x</span>
          </div>
          <div class="dev-row dev-slider-row">
            <span class="dev-label">nearScale</span>
            <input class="dev-slider" type="range" min="0.4" max="2.5" step="0.01" value="${perspective.nearScale.toFixed(2)}" data-dev-perspective-value="nearScale">
            <span class="dev-kv">${perspective.nearScale.toFixed(2)}x</span>
          </div>
          <div class="dev-row"><span class="dev-label">Keyboard</span><span class="dev-tool-hint">Up/Down: nearY | Shift+Up/Down: farY | Left/Right: nearScale</span></div>
        </div>
      `;
    }
    if (!hotspot) {
      return `
        <div class="dev-inspector">
          <div class="dev-inspector-title">Inspector</div>
          <div class="dev-row"><span class="dev-label">Hint</span><span class="dev-tool-hint">Select a hotspot to edit with this tool.</span></div>
        </div>
      `;
    }

    if (target === 'bounds') {
      const linkLine = hotspot.targetRoomId
        ? `<div class="dev-row"><span class="dev-label">Room Link</span><span class="dev-kv">${escapeHtml(hotspot.targetRoomId)}</span></div>`
        : '';
      return `
        <div class="dev-inspector">
          <div class="dev-inspector-title">Hotspot Bounds</div>
          <div class="dev-row"><span class="dev-label">Hotspot</span><span class="dev-kv">${escapeHtml(hotspot.id)}</span></div>
          <div class="dev-row"><span class="dev-label">Rect</span><span class="dev-kv">x=${hotspot.bounds.x} y=${hotspot.bounds.y} w=${hotspot.bounds.w} h=${hotspot.bounds.h}</span></div>
          ${linkLine}
          <div class="dev-row"><span class="dev-label">Description</span><span class="dev-tool-hint">${escapeHtml(hotspot.description?.trim() || '(no description)')}</span></div>
        </div>
      `;
    }

    if (target === 'spriteBounds') {
      const spriteRect = hotspot.spriteBounds;
      const hasSpriteAsset = Boolean(hotspot.sprite?.defaultImageId || (hotspot.sprite?.flagVariants?.length ?? 0) > 0);
      if (!spriteRect && !hasSpriteAsset) {
        return `
          <div class="dev-inspector">
            <div class="dev-inspector-title">Sprite Bounds</div>
            <div class="dev-row"><span class="dev-label">Hotspot</span><span class="dev-kv">${escapeHtml(hotspot.id)}</span></div>
            <div class="dev-row"><span class="dev-label">State</span><span class="dev-tool-hint">This hotspot has no sprite config yet.</span></div>
            <div class="dev-row"><span class="dev-label">Actions</span><button type="button" class="dev-chip" data-dev-action="init-sprite-bounds">Create sprite bounds</button></div>
          </div>
        `;
      }
      const rect = spriteRect ?? hotspot.bounds;
      return `
        <div class="dev-inspector">
          <div class="dev-inspector-title">Sprite Bounds</div>
          <div class="dev-row"><span class="dev-label">Hotspot</span><span class="dev-kv">${escapeHtml(hotspot.id)}</span></div>
          <div class="dev-row"><span class="dev-label">Rect</span><span class="dev-kv">x=${rect.x} y=${rect.y} w=${rect.w} h=${rect.h}</span></div>
          <div class="dev-row"><span class="dev-label">Actions</span><button type="button" class="dev-chip ${hotspot.spriteBounds ? '' : 'muted'}" data-dev-action="clear-sprite-bounds">Clear sprite bounds</button></div>
        </div>
      `;
    }

    return `
      <div class="dev-inspector">
        <div class="dev-inspector-title">Walk Target</div>
        <div class="dev-row"><span class="dev-label">Hotspot</span><span class="dev-kv">${escapeHtml(hotspot.id)}</span></div>
        <div class="dev-row"><span class="dev-label">Point</span><span class="dev-kv">x=${Math.round(hotspot.walkTarget.x)} y=${Math.round(hotspot.walkTarget.y)}</span></div>
      </div>
    `;
  }

  function buildSentenceLine(context: GameContext, hoveredHotspotId: string | null, hoverWalkable: boolean): SentenceParts {
    if (devMode) {
      return {
        prefix: 'Dev editor active (F3)',
        connector: '-',
        secondaryTarget: 'select hotspot, then drag handles or use keyboard nudge',
        muted: true,
      };
    }

    const room = rooms[context.currentRoomId];
    const hoveredHotspot = hoveredHotspotId && hoveredHotspotId !== SELF_HOTSPOT_ID
      ? room?.hotspots.find((spot) => spot.id === hoveredHotspotId) ?? null
      : null;
    const hotspotName = hoveredHotspotId === SELF_HOTSPOT_ID
      ? 'yourself'
      : hoveredHotspot?.name ?? '';
    const walkPrompt = hoveredHotspot?.walkPrompt?.trim();
    const selectedItemName =
      context.inventory.find((item) => item.id === context.selectedInventoryItemId)?.name ?? context.selectedInventoryItemId;

    if (hoveredHotspotId === SELF_HOTSPOT_ID && context.selectedVerb === null) {
      return {
        prefix: 'That is',
        target: 'you',
        muted: true,
      };
    }

    if (hotspotName && context.selectedVerb === null) {
      return {
        prefix: walkPrompt || 'Walk to',
        target: hotspotName,
      };
    }
    if (!hotspotName && context.selectedVerb === null && hoverWalkable) {
      return {
        prefix: 'Walk to',
      };
    }

    if (context.selectedVerb === 'USE' && selectedItemName && hotspotName) {
      return {
        prefix: 'Use',
        target: selectedItemName,
        connector: 'with',
        secondaryTarget: hotspotName,
      };
    }

    if (context.selectedVerb && hotspotName) {
      return {
        prefix: verbActionPrefix(context.selectedVerb),
        target: hotspotName,
      };
    }

    if (context.selectedVerb === 'USE' && !context.selectedInventoryItemId) {
      return {
        prefix: 'Use',
        target: '...',
        connector: 'with',
        secondaryTarget: '...',
        muted: true,
      };
    }

    return {
      prefix: 'Walk around',
      muted: true,
    };
  }

  function getVisibleHotspots(context: GameContext): Hotspot[] {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return [];
    }

    return room.hotspots.filter((spot) => isHotspotVisible(context.currentRoomId, spot.id, context.flags));
  }

  function getInputHotspots(context: GameContext): Hotspot[] {
    return [getSelfHotspot(context), ...getVisibleHotspots(context)];
  }

  function getSelfHotspot(context: GameContext): Hotspot {
    const room = rooms[context.currentRoomId] ?? getConfiguredDefaultRoom();
    const perspectiveScale = getPerspectiveScale(room, actorPosition.y);
    const width = Math.max(8, Math.round(actorSize.width * perspectiveScale));
    const height = Math.max(8, Math.round(actorSize.height * perspectiveScale));
    const x = Math.round(actorPosition.x - width / 2);
    const y = Math.round(actorPosition.y - height);

    return {
      id: SELF_HOTSPOT_ID,
      name: 'yourself',
      description: 'That is you. Looking confident and at least mostly in control.',
      bounds: { x, y, w: width, h: height },
      walkTarget: { x: actorPosition.x, y: actorPosition.y },
    };
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
    if (devEditTarget === 'walkablePolygon') {
      return;
    }
    if (devEditTarget === 'perspective') {
      return;
    }

    const rect = getEditableRect(hotspot, devEditTarget);
    rect.x += dx;
    rect.y += dy;
    rect.w = Math.max(1, rect.w + dw);
    rect.h = Math.max(1, rect.h + dh);
  }

  function addHotspot(context: GameContext): boolean {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return false;
    }

    const suggestedId = nextHotspotId(room);
    const rawId = window.prompt('Hotspot id (unique):', suggestedId);
    if (rawId === null) {
      return false;
    }
    const normalizedId = normalizeHotspotId(rawId);
    if (!normalizedId) {
      return false;
    }
    const id = uniqueHotspotId(room, normalizedId);

    const nameInput = window.prompt('Hotspot name:', titleFromId(id));
    if (nameInput === null) {
      return false;
    }
    const name = nameInput.trim() || titleFromId(id);

    const descriptionInput = window.prompt('LOOK description (optional):', `It is ${withArticle(name)}.`);
    if (descriptionInput === null) {
      return false;
    }
    const description = descriptionInput.trim() || undefined;

    const defaultWidth = 24;
    const defaultHeight = 24;
    const x = clamp(Math.round(actorPosition.x - defaultWidth / 2), 0, room.width - defaultWidth);
    const y = clamp(Math.round(actorPosition.y - defaultHeight), 0, room.height - defaultHeight);

    room.hotspots.push({
      id,
      name,
      description,
      bounds: { x, y, w: defaultWidth, h: defaultHeight },
      walkTarget: { x: Math.round(actorPosition.x), y: Math.round(actorPosition.y) },
    });
    selectedHotspotId = id;
    devEditTarget = 'bounds';
    return true;
  }

  function addRoomLinkHotspot(context: GameContext): boolean {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return false;
    }

    const allRoomIds = Object.keys(rooms).filter((id) => id !== room.id);
    const suggestedTarget = allRoomIds[0] ?? room.id;
    const targetRoomIdInput = window.prompt('Target room id:', suggestedTarget);
    if (targetRoomIdInput === null) {
      return false;
    }
    const targetRoomId = targetRoomIdInput.trim();
    if (!targetRoomId) {
      return false;
    }

    const suggestedId = uniqueHotspotId(room, normalizeHotspotId(`to_${targetRoomId}`) || nextHotspotId(room));
    const rawId = window.prompt('Link hotspot id:', suggestedId);
    if (rawId === null) {
      return false;
    }
    const normalizedId = normalizeHotspotId(rawId);
    if (!normalizedId) {
      return false;
    }
    const id = uniqueHotspotId(room, normalizedId);

    const defaultName = `Path to ${targetRoomId}`;
    const nameInput = window.prompt('Link name (shown on hover):', defaultName);
    if (nameInput === null) {
      return false;
    }
    const name = nameInput.trim() || defaultName;

    const descriptionInput = window.prompt('LOOK description (optional):', `A path leading to ${targetRoomId}.`);
    if (descriptionInput === null) {
      return false;
    }
    const description = descriptionInput.trim() || undefined;
    const walkPromptInput = window.prompt('Hover verb prefix (optional):', 'Walk to');
    if (walkPromptInput === null) {
      return false;
    }
    const walkPrompt = walkPromptInput.trim() || undefined;

    const defaultWidth = 28;
    const defaultHeight = 20;
    const x = clamp(Math.round(actorPosition.x - defaultWidth * 0.5), 0, room.width - defaultWidth);
    const y = clamp(Math.round(actorPosition.y - defaultHeight), 0, room.height - defaultHeight);

    room.hotspots.push({
      id,
      name,
      description,
      targetRoomId,
      walkPrompt,
      bounds: { x, y, w: defaultWidth, h: defaultHeight },
      walkTarget: { x: Math.round(actorPosition.x), y: Math.round(actorPosition.y) },
    });
    selectedHotspotId = id;
    devEditTarget = 'bounds';
    return true;
  }

  function editSelectedHotspotDescription(context: GameContext): boolean {
    const room = rooms[context.currentRoomId];
    if (!room || !selectedHotspotId) {
      return false;
    }
    const hotspot = room.hotspots.find((spot) => spot.id === selectedHotspotId);
    if (!hotspot) {
      return false;
    }
    const input = window.prompt('Hotspot LOOK description (leave empty to clear):', hotspot.description ?? '');
    if (input === null) {
      return false;
    }
    hotspot.description = input.trim() || undefined;
    return true;
  }

  async function copyCurrentRoomHotspots(context: GameContext): Promise<void> {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }

    const text = JSON.stringify(
      {
        walkablePolygon: room.walkablePolygon ?? [],
        hotspots: room.hotspots,
      },
      null,
      2,
    );
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

  async function persistCurrentRoom(context: GameContext): Promise<void> {
    const room = rooms[context.currentRoomId];
    if (!room) {
      devPersistStatus = 'Room persistence: failed (missing room)';
      renderUi(context, actor.getSnapshot().matches('dialogue'));
      return;
    }

    try {
      await persistRoomDefinition(room);

      let createdCount = 0;
      const linkedRoomIds = Array.from(
        new Set(
          room.hotspots
            .map((spot) => spot.targetRoomId?.trim() ?? '')
            .filter((roomId) => roomId.length > 0),
        ),
      );
      for (const linkedRoomId of linkedRoomIds) {
        if (rooms[linkedRoomId]) {
          continue;
        }
        const placeholderRoom = createPlaceholderRoom(linkedRoomId, room);
        await persistRoomDefinition(placeholderRoom);
        rooms[linkedRoomId] = placeholderRoom;
        createdCount += 1;
      }

      const now = new Date();
      const suffix = createdCount > 0 ? ` (+${createdCount} linked room file${createdCount === 1 ? '' : 's'})` : '';
      devPersistStatus = `Room persistence: saved at ${now.toLocaleTimeString()}${suffix}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      devPersistStatus = `Room persistence: failed (${message})`;
    }
    renderUi(context, actor.getSnapshot().matches('dialogue'));
  }

  async function persistRoomDefinition(room: RoomDefinition): Promise<void> {
    const payload = {
      room: {
        id: room.id,
        name: room.name,
        width: room.width,
        height: room.height,
        backgroundColor: room.backgroundColor,
        hotspots: room.hotspots,
        scripts: room.scripts ?? [],
        interactionChart: room.interactionChart,
        parallelStateChart: room.parallelStateChart,
        xstateChart: room.xstateChart,
        walkablePolygon: room.walkablePolygon ?? [],
        perspective: room.perspective,
        overlayText: room.overlayText,
      },
    };

    const response = await fetch(`/api/rooms/${encodeURIComponent(room.id)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`HTTP ${response.status} ${message}`);
    }
  }

  function createPlaceholderRoom(roomId: string, sourceRoom: RoomDefinition): RoomDefinition {
    return {
      id: roomId,
      name: titleFromId(roomId),
      width: sourceRoom.width,
      height: sourceRoom.height,
      backgroundColor: '#1f2b3d',
      hotspots: [],
      scripts: [],
      parallelStateChart: undefined,
      xstateChart: undefined,
      walkablePolygon: [],
      perspective: sourceRoom.perspective ? { ...sourceRoom.perspective } : undefined,
      overlayText: `${titleFromId(roomId)} placeholder`,
    };
  }

  function adjustActorSize(dw: number, dh: number, fast: boolean): void {
    const step = fast ? 5 : 1;
    actorSize.width = clamp(actorSize.width + dw * step, 16, 160);
    actorSize.height = clamp(actorSize.height + dh * step, 16, 180);
  }

  function nudgePerspective(
    context: GameContext,
    field: 'farY' | 'nearY' | 'farScale' | 'nearScale',
    delta: number,
  ): void {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }
    const perspective = ensureRoomPerspective(room);
    setPerspectiveValue(room, perspective, field, perspective[field] + delta);
  }

  window.addEventListener('beforeunload', () => {
    input.destroy();
    canvas.removeEventListener('pointerdown', onDevPointerDown);
    canvas.removeEventListener('pointermove', onDevPointerMove);
    canvas.removeEventListener('pointerup', onDevPointerUp);
    canvas.removeEventListener('pointercancel', onDevPointerUp);
    canvas.removeEventListener('contextmenu', onDevContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerdown', tryStartEnabledAudio);
    window.removeEventListener('keydown', tryStartEnabledAudio);
    backgroundMusic.pause();
    backgroundSfx.pause();
    voicePlayer.cancel();
  });
}


function createBackgroundMusic(src: string): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.45;
  return audio;
}

function createVoicePlayer(): { speak: (text: string) => void; cancel: () => void; isSupported: () => boolean } {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supportsUtterance = typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window;
  if (!synth || !supportsUtterance) {
    return {
      speak: (): void => {},
      cancel: (): void => {},
      isSupported: (): boolean => false,
    };
  }

  let preferredVoice: SpeechSynthesisVoice | null = null;

  const selectVoice = (): SpeechSynthesisVoice | null => {
    const voices = synth.getVoices();
    if (voices.length === 0) {
      return null;
    }
    const english = voices.find((voice) => voice.lang.toLowerCase().startsWith('en'));
    return english ?? voices[0];
  };

  const loadPreferredVoice = (): void => {
    preferredVoice = selectVoice();
  };
  loadPreferredVoice();
  synth.addEventListener('voiceschanged', loadPreferredVoice);

  return {
    speak: (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      synth.resume();
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = 1;
      utterance.pitch = 1;
      const voice = preferredVoice ?? selectVoice();
      if (voice) {
        utterance.voice = voice;
      }
      synth.speak(utterance);
    },
    cancel: (): void => {
      synth.cancel();
    },
    isSupported: (): boolean => true,
  };
}

function computeWalkPath(
  start: { x: number; y: number },
  target: { x: number; y: number },
  polygon: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (segmentIsWalkable(start, target, polygon)) {
    return [{ ...target }];
  }

  const vertices = polygon.map((p) => ({ x: p.x, y: p.y }));
  const nodes = [{ ...start }, { ...target }, ...vertices];
  const adjacency: Array<Array<{ to: number; cost: number }>> = nodes.map(() => []);

  const connect = (a: number, b: number): void => {
    const pa = nodes[a];
    const pb = nodes[b];
    if (!segmentIsWalkable(pa, pb, polygon)) {
      return;
    }
    const cost = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    adjacency[a].push({ to: b, cost });
    adjacency[b].push({ to: a, cost });
  };

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      connect(i, j);
    }
  }

  const pathNodeIndices = shortestPathDijkstra(0, 1, adjacency);
  if (!pathNodeIndices) {
    return [{ ...target }];
  }

  const path = pathNodeIndices.slice(1).map((index) => ({ ...nodes[index] }));
  return path.length > 0 ? path : [{ ...target }];
}

function shortestPathDijkstra(
  start: number,
  goal: number,
  adjacency: Array<Array<{ to: number; cost: number }>>,
): number[] | null {
  const distances = adjacency.map(() => Number.POSITIVE_INFINITY);
  const previous = adjacency.map(() => -1);
  const visited = adjacency.map(() => false);
  distances[start] = 0;

  for (let i = 0; i < adjacency.length; i += 1) {
    let current = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let j = 0; j < adjacency.length; j += 1) {
      if (!visited[j] && distances[j] < bestDistance) {
        bestDistance = distances[j];
        current = j;
      }
    }
    if (current < 0) {
      break;
    }
    if (current === goal) {
      break;
    }
    visited[current] = true;
    for (const edge of adjacency[current]) {
      const nextDistance = distances[current] + edge.cost;
      if (nextDistance < distances[edge.to]) {
        distances[edge.to] = nextDistance;
        previous[edge.to] = current;
      }
    }
  }

  if (!Number.isFinite(distances[goal])) {
    return null;
  }

  const result: number[] = [];
  let cursor = goal;
  while (cursor >= 0) {
    result.push(cursor);
    if (cursor === start) {
      break;
    }
    cursor = previous[cursor];
  }
  result.reverse();
  return result.length > 0 && result[0] === start ? result : null;
}

function closestPointOnWalkablePolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[],
): { x: number; y: number } {
  if (isPointInPolygon(point, polygon)) {
    return point;
  }

  let bestPoint = { ...polygon[0] };
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const candidate = closestPointOnSegment(point, a, b);
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function closestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.0001) {
    return { ...a };
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  return {
    x: a.x + abx * t,
    y: a.y + aby * t,
  };
}

function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.00001) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentIsWalkable(
  a: { x: number; y: number },
  b: { x: number; y: number },
  polygon: { x: number; y: number }[],
): boolean {
  const midpoint = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  if (!isPointInPolygon(midpoint, polygon) && !isPointOnPolygonEdge(midpoint, polygon)) {
    return false;
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    if (segmentsProperlyIntersect(a, b, p1, p2)) {
      return false;
    }
  }
  return true;
}

function segmentsProperlyIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  if (pointsEqual(a, c) || pointsEqual(a, d) || pointsEqual(b, c) || pointsEqual(b, d)) {
    return false;
  }
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function pointsEqual(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 0.0001 && Math.abs(a.y - b.y) < 0.0001;
}

function orientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isPointOnPolygonEdge(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distancePointToSegment(point, a, b) < 0.5) {
      return true;
    }
  }
  return false;
}

function distancePointToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const closest = closestPointOnSegment(point, a, b);
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function toCanvasPoint(
  event: MouseEvent | PointerEvent,
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
): Point | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = (event.clientX - rect.left) * (logicalWidth / rect.width);
  const y = (event.clientY - rect.top) * (logicalHeight / rect.height);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return null;
  }
  return { x, y };
}

function isPointNear(point: Point, target: Point, radius: number): boolean {
  return Math.hypot(point.x - target.x, point.y - target.y) <= radius;
}

function hitTestRectHandle(point: Point, rect: Rect): DevRectHandle | null {
  const radius = 4;
  const handles: Array<{ handle: DevRectHandle; x: number; y: number }> = [
    { handle: 'nw', x: rect.x, y: rect.y },
    { handle: 'ne', x: rect.x + rect.w, y: rect.y },
    { handle: 'sw', x: rect.x, y: rect.y + rect.h },
    { handle: 'se', x: rect.x + rect.w, y: rect.y + rect.h },
    { handle: 'move', x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.5 },
  ];
  for (const candidate of handles) {
    if (Math.abs(point.x - candidate.x) <= radius && Math.abs(point.y - candidate.y) <= radius) {
      return candidate.handle;
    }
  }
  return null;
}

function findHotspotByWalkTarget(point: Point, hotspots: Hotspot[], radius: number): Hotspot | null {
  let best: Hotspot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hotspot of hotspots) {
    const distance = Math.hypot(point.x - hotspot.walkTarget.x, point.y - hotspot.walkTarget.y);
    if (distance <= radius && distance < bestDistance) {
      best = hotspot;
      bestDistance = distance;
    }
  }
  return best;
}

function findHotspotByRect(
  point: Point,
  hotspots: Hotspot[],
  target: 'bounds' | 'spriteBounds',
): Hotspot | null {
  for (let index = hotspots.length - 1; index >= 0; index -= 1) {
    const hotspot = hotspots[index];
    const rect = target === 'bounds' ? hotspot.bounds : hotspot.spriteBounds;
    if (!rect) {
      continue;
    }
    if (isPointInRect(point, rect)) {
      return hotspot;
    }
  }
  return null;
}

function findRectHandleHit(
  point: Point,
  hotspots: Hotspot[],
  target: 'bounds' | 'spriteBounds',
  preferredHotspotId: string | null,
): { hotspot: Hotspot; handle: DevRectHandle } | null {
  const ordered = preferredHotspotId
    ? [
      ...hotspots.filter((spot) => spot.id === preferredHotspotId),
      ...hotspots.filter((spot) => spot.id !== preferredHotspotId),
    ]
    : hotspots;

  for (const hotspot of ordered) {
    const rect = target === 'bounds' ? hotspot.bounds : hotspot.spriteBounds;
    if (!rect) {
      continue;
    }
    const handle = hitTestRectHandle(point, rect);
    if (handle) {
      return { hotspot, handle };
    }
  }
  return null;
}

function isPointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x
    && point.y >= rect.y
    && point.x <= rect.x + rect.w
    && point.y <= rect.y + rect.h;
}

function hitTestPolygonVertex(point: Point, polygon: Point[]): number {
  const radius = 4;
  for (let index = polygon.length - 1; index >= 0; index -= 1) {
    const vertex = polygon[index];
    if (Math.abs(point.x - vertex.x) <= radius && Math.abs(point.y - vertex.y) <= radius) {
      return index;
    }
  }
  return -1;
}

function findPolygonInsertIndex(point: Point, polygon: Point[], maxDistance: number): number {
  if (polygon.length < 2) {
    return -1;
  }
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const distance = distancePointToSegment(point, a, b);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1;
    }
  }
  return bestDistance <= maxDistance ? bestIndex : -1;
}

function computeDraggedRect(startRect: Rect, handle: DevRectHandle, dx: number, dy: number): Rect {
  if (handle === 'move') {
    return {
      x: Math.round(startRect.x + dx),
      y: Math.round(startRect.y + dy),
      w: startRect.w,
      h: startRect.h,
    };
  }

  let left = startRect.x;
  let right = startRect.x + startRect.w;
  let top = startRect.y;
  let bottom = startRect.y + startRect.h;

  if (handle === 'nw' || handle === 'sw') {
    left += dx;
  }
  if (handle === 'ne' || handle === 'se') {
    right += dx;
  }
  if (handle === 'nw' || handle === 'ne') {
    top += dy;
  }
  if (handle === 'sw' || handle === 'se') {
    bottom += dy;
  }

  if (right - left < 1) {
    if (handle === 'nw' || handle === 'sw') {
      left = right - 1;
    } else {
      right = left + 1;
    }
  }
  if (bottom - top < 1) {
    if (handle === 'nw' || handle === 'ne') {
      top = bottom - 1;
    } else {
      bottom = top + 1;
    }
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.max(1, Math.round(right - left)),
    h: Math.max(1, Math.round(bottom - top)),
  };
}

function clampRectToRoom(rect: Rect, roomWidth: number, roomHeight: number): Rect {
  const width = clamp(Math.round(rect.w), 1, roomWidth);
  const height = clamp(Math.round(rect.h), 1, roomHeight);
  const x = clamp(Math.round(rect.x), 0, roomWidth - width);
  const y = clamp(Math.round(rect.y), 0, roomHeight - height);
  return { x, y, w: width, h: height };
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

function getPerspectiveScale(room: { perspective?: { farY: number; nearY: number; farScale: number; nearScale: number } }, actorY: number): number {
  const perspective = ensureRoomPerspective(room);

  const deltaY = perspective.nearY - perspective.farY;
  if (Math.abs(deltaY) < 0.0001) {
    return clamp(perspective.nearScale, 0.25, 4);
  }

  const t = clamp((actorY - perspective.farY) / deltaY, 0, 1);
  const scale = perspective.farScale + (perspective.nearScale - perspective.farScale) * t;
  return clamp(scale, 0.25, 4);
}

function ensureRoomPerspective(room: { perspective?: { farY: number; nearY: number; farScale: number; nearScale: number } }): { farY: number; nearY: number; farScale: number; nearScale: number } {
  if (!room.perspective) {
    room.perspective = {
      farY: 70,
      nearY: 179,
      farScale: 0.72,
      nearScale: 1,
    };
  }
  return room.perspective;
}

function getConfiguredDefaultRoom(): RoomDefinition {
  const room = rooms[defaultRoomId];
  if (!room) {
    throw new Error(`Default room "${defaultRoomId}" is not loaded`);
  }
  return room;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextHotspotId(room: { hotspots: Hotspot[] }): string {
  let index = room.hotspots.length + 1;
  while (room.hotspots.some((spot) => spot.id === `hotspot_${index}`)) {
    index += 1;
  }
  return `hotspot_${index}`;
}

function uniqueHotspotId(room: { hotspots: Hotspot[] }, baseId: string): string {
  let candidate = baseId;
  let suffix = 2;
  while (room.hotspots.some((spot) => spot.id === candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeHotspotId(rawId: string): string {
  const normalized = rawId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized;
}

function titleFromId(id: string): string {
  return id
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function withArticle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'an object';
  }
  const first = trimmed.charAt(0).toLowerCase();
  const article = 'aeiou'.includes(first) ? 'an' : 'a';
  return `${article} ${trimmed}`;
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

function verbActionPrefix(verb: Verb): string {
  switch (verb) {
    case 'LOOK':
      return 'Look at';
    case 'TALK':
      return 'Talk to';
    case 'PICK_UP':
      return 'Pick up';
    case 'OPEN':
      return 'Open';
    case 'USE':
      return 'Use';
    default:
      return verbLabel(verb);
  }
}

function renderSentenceLineHtml(parts: SentenceParts): string {
  const classes = parts.muted ? 'sentence muted' : 'sentence';
  const chunks: string[] = [`<span class="${classes}">`];
  chunks.push(`<span class="sentence-prefix">${escapeHtml(parts.prefix)}</span>`);
  if (parts.target) {
    chunks.push(`<span class="sentence-target">${escapeHtml(parts.target)}</span>`);
  }
  if (parts.connector) {
    chunks.push(`<span class="sentence-connector">${escapeHtml(parts.connector)}</span>`);
  }
  if (parts.secondaryTarget) {
    chunks.push(`<span class="sentence-target">${escapeHtml(parts.secondaryTarget)}</span>`);
  }
  chunks.push('</span>');
  return chunks.join(' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element with id: ${id}`);
  }

  return element as T;
}

function isVerb(value: string | undefined): value is Verb {
  return value === 'LOOK' || value === 'TALK' || value === 'PICK_UP' || value === 'USE' || value === 'OPEN';
}

function keyboardShortcutVerb(key: string): Verb | null {
  const normalized = key.toLowerCase();
  if (normalized === 'l') {
    return 'LOOK';
  }
  if (normalized === 't') {
    return 'TALK';
  }
  if (normalized === 'p') {
    return 'PICK_UP';
  }
  if (normalized === 'u') {
    return 'USE';
  }
  if (normalized === 'o') {
    return 'OPEN';
  }
  return null;
}

function shouldIgnoreKeyboardShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function isDevEditTarget(value: string | undefined): value is DevEditTarget {
  return value === 'bounds'
    || value === 'spriteBounds'
    || value === 'walkTarget'
    || value === 'walkablePolygon'
    || value === 'perspective';
}

function isPerspectiveValueField(value: string | undefined): value is 'farY' | 'nearY' | 'farScale' | 'nearScale' {
  return value === 'farY' || value === 'nearY' || value === 'farScale' || value === 'nearScale';
}

function setPerspectiveValue(
  room: { height: number },
  perspective: { farY: number; nearY: number; farScale: number; nearScale: number },
  field: 'farY' | 'nearY' | 'farScale' | 'nearScale',
  value: number,
): void {
  if (field === 'farY') {
    perspective.farY = clamp(Math.round(value), 0, Math.round(perspective.nearY) - 1);
    return;
  }
  if (field === 'nearY') {
    perspective.nearY = clamp(Math.round(value), Math.round(perspective.farY) + 1, room.height);
    return;
  }
  if (field === 'farScale') {
    perspective.farScale = clamp(value, 0.25, perspective.nearScale);
    return;
  }
  perspective.nearScale = clamp(value, perspective.farScale, 4);
}

function hitTestPerspectiveGuide(
  point: Point,
  perspective: { farY: number; nearY: number },
): 'farY' | 'nearY' | null {
  const farDistance = Math.abs(point.y - perspective.farY);
  const nearDistance = Math.abs(point.y - perspective.nearY);
  const maxDistance = 5;
  if (farDistance > maxDistance && nearDistance > maxDistance) {
    return null;
  }
  return farDistance <= nearDistance ? 'farY' : 'nearY';
}

function makeCursorCss(svg: string, hotspotX: number, hotspotY: number, fallback: 'default' | 'pointer' | 'crosshair'): string {
  const encodedSvg = encodeURIComponent(svg)
    .replace(/%0A/g, '')
    .replace(/%20+/g, ' ');
  return `url("data:image/svg+xml,${encodedSvg}") ${hotspotX} ${hotspotY}, ${fallback}`;
}

function makeWalkCursorCss(yOffset: number): string {
  const topY = 4 + yOffset;
  const midY = 17 + yOffset;
  const tipY = 30 + yOffset;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <rect width="34" height="34" fill="none"/>
    <path d="M15 ${topY} L19 ${topY} L19 ${midY} L26 ${midY} L17 ${tipY} L8 ${midY} L15 ${midY} Z"
      fill="#b63a21" stroke="#4a130c" stroke-width="1.9" stroke-linejoin="round"/>
  </svg>`;
  return makeCursorCss(svg, 17, 28, 'pointer');
}
