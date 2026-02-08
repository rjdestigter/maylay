import './style.css';
import musicRoom1Url from './assets/music_room1.mp3';
import forestAmbienceUrl from './assets/forest_ambience.mp3';

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
const IDLE_CYCLE_HZ = 0.75;
const VERBS: Verb[] = ['LOOK', 'TALK', 'PICK_UP', 'USE', 'OPEN'];
type DevEditTarget = 'bounds' | 'spriteBounds' | 'walkTarget' | 'walkablePolygon' | 'perspective';
type DevPerspectiveField = 'farY' | 'nearY' | 'farScale' | 'nearScale';
const DEV_TARGETS: Array<{ value: DevEditTarget; label: string; key: string }> = [
  { value: 'bounds', label: 'Hotspot', key: '1' },
  { value: 'spriteBounds', label: 'Sprite', key: '2' },
  { value: 'walkTarget', label: 'Walk Target', key: '3' },
  { value: 'walkablePolygon', label: 'Walkable Poly', key: '4' },
  { value: 'perspective', label: 'Perspective', key: '5' },
];
const DEV_PERSPECTIVE_FIELDS: Array<{ value: DevPerspectiveField; label: string; key: string }> = [
  { value: 'farY', label: 'farY', key: 'Q' },
  { value: 'nearY', label: 'nearY', key: 'W' },
  { value: 'farScale', label: 'farScale', key: 'E' },
  { value: 'nearScale', label: 'nearScale', key: 'R' },
];

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
  const actor = createActor(gameMachine);
  let debugHotspots = false;
  let devMode = false;
  let devEditTarget: DevEditTarget = 'bounds';
  let devPerspectiveField: DevPerspectiveField = 'farY';
  let selectedHotspotId: string | null = null;

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
    getHotspots: () => getVisibleHotspots(actor.getSnapshot().context),
    sendEvent: (event) => actor.send(event),
    onPointerMove: (point, hotspot) => {
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

      if (devEditTarget === 'walkablePolygon') {
        const room = rooms[actor.getSnapshot().context.currentRoomId];
        if (!room) {
          return;
        }
        if (!room.walkablePolygon) {
          room.walkablePolygon = [];
        }
        if (event.ctrlKey) {
          room.walkablePolygon = [];
          return;
        }
        if (event.shiftKey) {
          room.walkablePolygon.pop();
          return;
        }
        room.walkablePolygon.push({ x: Math.round(point.x), y: Math.round(point.y) });
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

    const currentVerb = actor.getSnapshot().context.selectedVerb;
    actor.send({ type: 'VERB_SELECTED', verb: currentVerb === verb ? null : verb });
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

    voicePlayer.cancel();
    actor.send({ type: 'DIALOGUE_ADVANCE' });
  });

  devCopy.addEventListener('click', () => {
    void copyCurrentRoomHotspots(actor.getSnapshot().context);
  });
  devPanel.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    let changed = false;

    const nextTarget = target.dataset.devTarget;
    if (isDevEditTarget(nextTarget)) {
      devEditTarget = nextTarget;
      changed = true;
    }
    if (!changed) {
      const nextField = target.dataset.devPerspectiveField;
      if (isDevPerspectiveField(nextField)) {
        devPerspectiveField = nextField;
        changed = true;
      }
    }
    if (!changed) {
      const deltaRaw = target.dataset.devAdjust;
      if (deltaRaw) {
        const delta = Number.parseInt(deltaRaw, 10);
        if (Number.isFinite(delta)) {
          adjustRoomPerspective(actor.getSnapshot().context, delta);
          changed = true;
        }
      }
    }
    if (!changed && target.dataset.devAction === 'clear-selection') {
      selectedHotspotId = null;
      changed = true;
    }
    if (changed) {
      const snapshot = actor.getSnapshot();
      renderUi(snapshot.context, snapshot.matches('dialogue'));
    }
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
      actorPosition = spawnPointForRoom(context.currentRoomId);
      currentWalkPath = [];
      currentWalkKey = null;
      voicePlayer.cancel();
      lastSpokenDialogueKey = null;
    }
  });

  actor.start();
  actor.send({ type: 'BOOTED' });

  const onKeyDown = (event: KeyboardEvent): void => {
    const refreshUi = (): void => {
      const snapshot = actor.getSnapshot();
      renderUi(snapshot.context, snapshot.matches('dialogue'));
    };
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
    if (event.key.toLowerCase() === 'q') {
      devPerspectiveField = 'farY';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 'w') {
      devPerspectiveField = 'nearY';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 'e') {
      devPerspectiveField = 'farScale';
      refreshUi();
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      devPerspectiveField = 'nearScale';
      refreshUi();
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
      if (devEditTarget === 'perspective') {
        adjustRoomPerspective(actor.getSnapshot().context, -moveStep);
        event.preventDefault();
        return;
      }
      adjustSelectedHotspot(actor.getSnapshot().context, -moveStep, 0, 0, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowRight') {
      if (devEditTarget === 'perspective') {
        adjustRoomPerspective(actor.getSnapshot().context, moveStep);
        event.preventDefault();
        return;
      }
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
      actorCycle = (actorCycle + deltaSeconds * WALK_CYCLE_HZ) % 1;
    } else {
      actorCycle = (actorCycle + deltaSeconds * IDLE_CYCLE_HZ) % 1;
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
      hoveredHotspotId: context.hoveredHotspotId,
      devEditor: {
        enabled: devMode,
        selectedHotspotId,
        editTarget: devEditTarget,
        perspective: room.perspective,
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
    const hotspot = room?.hotspots.find((spot) => spot.id === pending.hotspotId);
    if (!room || !hotspot) {
      actor.send({
        type: 'SCRIPT_RESOLVED',
        result: { dialogueLines: ['There is nothing to interact with.'] },
      });
      return;
    }

    // No selected action behaves as implicit walk-to, with auto-enter for open doors.
    if (pending.verb === null) {
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

    sentenceLine.textContent = buildSentenceLine(context, context.hoveredHotspotId, hoveredWalkableArea);
    if (devMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = context.hoveredHotspotId || hoveredWalkableArea ? 'pointer' : 'default';
    }
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
      return;
    }

    const room = rooms[context.currentRoomId];
    const hotspot = room?.hotspots.find((spot) => spot.id === selectedHotspotId) ?? null;
    const perspective = ensureRoomPerspective(room ?? rooms.room1);
    const selectedStatus = hotspot
      ? `<span class="dev-status"><span class="dev-status-dot"></span>Selected: ${hotspot.id}</span>`
      : '<span class="dev-status muted">Selected: none</span>';
    const targetButtons = DEV_TARGETS.map((option) => {
      const active = option.value === devEditTarget ? 'active' : '';
      return `<button type="button" class="dev-chip ${active}" data-dev-target="${option.value}">${option.label} [${option.key}]</button>`;
    }).join('');
    const perspectiveFieldButtons = DEV_PERSPECTIVE_FIELDS.map((field) => {
      const active = field.value === devPerspectiveField ? 'active' : '';
      const muted = devEditTarget === 'perspective' ? '' : 'muted';
      return `<button type="button" class="dev-chip ${active} ${muted}" data-dev-perspective-field="${field.value}">${field.label} [${field.key}]</button>`;
    }).join('');
    const perspectiveAdjustClass = devEditTarget === 'perspective' ? '' : 'muted';
    devGui.innerHTML = `
      <div class="dev-row">
        <span class="dev-label">Selection</span>
        ${selectedStatus}
        <button type="button" class="dev-chip" data-dev-action="clear-selection">Clear</button>
      </div>
      <div class="dev-row">
        <span class="dev-label">Edit Target</span>
        ${targetButtons}
      </div>
      <div class="dev-row">
        <span class="dev-label">Persp Field</span>
        ${perspectiveFieldButtons}
      </div>
      <div class="dev-row">
        <span class="dev-label">Persp Adjust</span>
        <button type="button" class="dev-chip ${perspectiveAdjustClass}" data-dev-adjust="-5">-5</button>
        <button type="button" class="dev-chip ${perspectiveAdjustClass}" data-dev-adjust="-1">-1</button>
        <button type="button" class="dev-chip ${perspectiveAdjustClass}" data-dev-adjust="1">+1</button>
        <button type="button" class="dev-chip ${perspectiveAdjustClass}" data-dev-adjust="5">+5</button>
      </div>
    `;

    const line1 = `DEV EDITOR (F3): ${context.currentRoomId}`;
    const line2 = `Target [1/2/3/4/5]: ${devEditTarget}`;
    const line3 = hotspot ? `Selected: ${hotspot.id}` : 'Selected: none';
    const line4 = `Actor size +/-: ${actorSize.width}x${actorSize.height}`;
    const line5 = `Actor render scale: ${getPerspectiveScale(room ?? rooms.room1, actorPosition.y).toFixed(2)}x`;
    const line6 = `Walkable points: ${rooms[context.currentRoomId]?.walkablePolygon?.length ?? 0}`;
    const line7 = `Perspective field [Q/W/E/R]: ${devPerspectiveField}`;
    const line8 = `Perspective values: farY=${perspective.farY} nearY=${perspective.nearY} farScale=${perspective.farScale.toFixed(2)} nearScale=${perspective.nearScale.toFixed(2)}`;
    const line9 = 'Move: arrows (Shift=5px) | Rect size: [ ] and ; \'';
    const line10 = 'Polygon mode: click add, Shift+click undo, Ctrl+click clear';
    const line11 = 'Copy room JSON: C or button';
    devInfo.textContent = [line1, line2, line3, line4, line5, line6, line7, line8, line9, line10, line11].join('\n');
  }

  function buildSentenceLine(context: GameContext, hoveredHotspotId: string | null, hoverWalkable: boolean): string {
    if (devMode) {
      return 'Dev editor active (F3): click hotspot, then move/resize with keyboard.';
    }

    const room = rooms[context.currentRoomId];
    const hotspotName = room?.hotspots.find((spot) => spot.id === hoveredHotspotId)?.name ?? '';
    const selectedItemName =
      context.inventory.find((item) => item.id === context.selectedInventoryItemId)?.name ?? context.selectedInventoryItemId;

    if (hotspotName && context.selectedVerb === null) {
      return `Walk to ${hotspotName}`;
    }
    if (!hotspotName && context.selectedVerb === null && hoverWalkable) {
      return 'Walk to';
    }

    if (context.selectedVerb === 'USE' && selectedItemName && hotspotName) {
      return `Use ${selectedItemName} with ${hotspotName}`;
    }

    if (context.selectedVerb && hotspotName) {
      return `${verbLabel(context.selectedVerb)} ${hotspotName}`;
    }

    if (context.selectedVerb === 'USE' && !context.selectedInventoryItemId) {
      return 'Use ... with ...';
    }

    return 'Walk around.';
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

  function adjustActorSize(dw: number, dh: number, fast: boolean): void {
    const step = fast ? 5 : 1;
    actorSize.width = clamp(actorSize.width + dw * step, 16, 160);
    actorSize.height = clamp(actorSize.height + dh * step, 16, 180);
  }

  function adjustRoomPerspective(context: GameContext, delta: number): void {
    const room = rooms[context.currentRoomId];
    if (!room) {
      return;
    }
    const perspective = ensureRoomPerspective(room);
    if (devPerspectiveField === 'farY') {
      perspective.farY = clamp(perspective.farY + delta, 0, perspective.nearY - 1);
      return;
    }
    if (devPerspectiveField === 'nearY') {
      perspective.nearY = clamp(perspective.nearY + delta, perspective.farY + 1, room.height);
      return;
    }

    const scaleStep = delta * 0.01;
    if (devPerspectiveField === 'farScale') {
      perspective.farScale = clamp(perspective.farScale + scaleStep, 0.25, perspective.nearScale);
      return;
    }
    perspective.nearScale = clamp(perspective.nearScale + scaleStep, perspective.farScale, 4);
  }

  window.addEventListener('beforeunload', () => {
    input.destroy();
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

function isDevPerspectiveField(value: string | undefined): value is DevPerspectiveField {
  return value === 'farY' || value === 'nearY' || value === 'farScale' || value === 'nearScale';
}






