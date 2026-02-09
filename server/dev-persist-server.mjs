import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.DEV_PERSIST_PORT ?? 5174);
const HOST = process.env.DEV_PERSIST_HOST ?? '127.0.0.1';
const ROOT_DIR = process.cwd();
const ROOMS_DIR = path.join(ROOT_DIR, 'src', 'game', 'rooms');

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      respondJson(res, 400, { error: 'Missing URL' });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const roomMatch = /^\/api\/rooms\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    if (!roomMatch) {
      respondJson(res, 404, { error: 'Not found' });
      return;
    }

    const roomId = roomMatch[1];
    const roomPath = path.join(ROOMS_DIR, `${roomId}.json`);

    if (req.method === 'GET') {
      const raw = await fs.readFile(roomPath, 'utf8');
      const room = JSON.parse(raw);
      respondJson(res, 200, { room });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!isObject(body) || !isObject(body.room)) {
        respondJson(res, 400, { error: 'Expected body: { room: object }' });
        return;
      }

      const room = body.room;
      const roomName = typeof room.name === 'string' && room.name.trim().length > 0 ? room.name : roomId;
      const roomPayload = {
        id: roomId,
        name: roomName,
        width: toFiniteNumber(room.width, 320),
        height: toFiniteNumber(room.height, 180),
        backgroundColor: typeof room.backgroundColor === 'string' ? room.backgroundColor : '#000000',
        hotspots: Array.isArray(room.hotspots) ? room.hotspots : [],
        scripts: Array.isArray(room.scripts) ? room.scripts : [],
        interactionChart: isObject(room.interactionChart) ? room.interactionChart : undefined,
        parallelStateChart: isObject(room.parallelStateChart) ? room.parallelStateChart : undefined,
        xstateChart: isObject(room.xstateChart) ? room.xstateChart : undefined,
        walkablePolygon: Array.isArray(room.walkablePolygon) ? room.walkablePolygon : [],
        perspective: isObject(room.perspective) ? room.perspective : undefined,
        overlayText: typeof room.overlayText === 'string' ? room.overlayText : undefined,
      };

      const nextText = `${JSON.stringify(roomPayload, null, 2)}\n`;
      await fs.writeFile(roomPath, nextText, 'utf8');
      respondJson(res, 200, { ok: true, file: roomPath });
      return;
    }

    respondJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    respondJson(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-persist] listening on http://${HOST}:${PORT}`);
});

function respondJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
