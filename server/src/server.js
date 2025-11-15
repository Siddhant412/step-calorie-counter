import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, '../data/metrics.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use(morgan('dev'));

let metrics = [];

const loadFromDisk = async () => {
  try {
    const buffer = await readFile(dataFile, 'utf8');
    metrics = JSON.parse(buffer);
  } catch (error) {
    console.warn('[metrics] Unable to read cache, starting empty', error.message);
    metrics = [];
  }
};

const persistToDisk = async () => {
  await writeFile(dataFile, JSON.stringify(metrics, null, 2), 'utf8');
};

const coerceNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSample = (payload) => ({
  id: randomUUID(),
  receivedAt: new Date().toISOString(),
  device: {
    deviceId: payload?.device?.deviceId ?? 'unknown',
    model: payload?.device?.model ?? 'unknown',
    osVersion: payload?.device?.osVersion ?? 'unknown',
  },
  sample: {
    steps: coerceNumber(payload?.sample?.steps),
    distance: coerceNumber(payload?.sample?.distance),
    calories: coerceNumber(payload?.sample?.calories),
    start: payload?.sample?.start ?? new Date().toISOString(),
    end: payload?.sample?.end ?? new Date().toISOString(),
  },
});

const buildSummary = (list) => list.reduce(
  (acc, item) => {
    acc.steps += item.sample.steps;
    acc.distance += item.sample.distance;
    acc.calories += item.sample.calories;
    return acc;
  },
  { steps: 0, distance: 0, calories: 0 }
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', count: metrics.length });
});

app.get('/api/metrics', (req, res) => {
  const { limit, since } = req.query;
  let data = [...metrics];

  if (since) {
    const cutoff = new Date(since);
    if (!Number.isNaN(cutoff.valueOf())) {
      data = data.filter((item) => new Date(item.sample.end) >= cutoff);
    }
  }

  if (limit) {
    const parsedLimit = Number(limit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      data = data.slice(-parsedLimit);
    }
  }

  res.json({
    data,
    totals: buildSummary(data),
  });
});

app.post('/api/metrics', async (req, res) => {
  if (!req.body?.sample) {
    return res.status(400).json({ message: 'sample payload is required' });
  }

  const sample = normalizeSample(req.body);
  metrics.push(sample);

  await persistToDisk();
  res.status(201).json({ message: 'stored', id: sample.id });
});

app.delete('/api/metrics', async (_req, res) => {
  metrics = [];
  await persistToDisk();
  res.json({ message: 'cleared' });
});

const bootstrap = async () => {
  await loadFromDisk();
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

bootstrap();
