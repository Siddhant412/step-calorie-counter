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
const goalsFile = path.join(__dirname, '../data/goals.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use(morgan('dev'));

let metrics = [];
let goals = { steps: 8000, calories: 400 };

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

const loadGoals = async () => {
  try {
    const buffer = await readFile(goalsFile, 'utf8');
    const next = JSON.parse(buffer);
    if (typeof next.steps === 'number' && typeof next.calories === 'number') {
      goals = next;
    }
  } catch (error) {
    console.warn('[goals] Using defaults', error.message);
    await persistGoals();
  }
};

const persistGoals = async () => {
  await writeFile(goalsFile, JSON.stringify(goals, null, 2), 'utf8');
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

const findMatchingIndex = (incoming) =>
  metrics.findIndex(
    (item) =>
      item.device.deviceId === incoming.device.deviceId &&
      item.sample.start === incoming.sample.start &&
      item.sample.end === incoming.sample.end
  );

const buildSummary = (list) => {
  if (!list.length) {
    return { steps: 0, distance: 0, calories: 0 };
  }

  const latestByDevice = new Map();
  list.forEach((item) => {
    const key = item.device.deviceId;
    const existing = latestByDevice.get(key);
    if (!existing || new Date(item.sample.end) > new Date(existing.sample.end)) {
      latestByDevice.set(key, item);
    }
  });

  return Array.from(latestByDevice.values()).reduce(
    (acc, item) => {
      acc.steps += item.sample.steps;
      acc.distance += item.sample.distance;
      acc.calories += item.sample.calories;
      return acc;
    },
    { steps: 0, distance: 0, calories: 0 }
  );
};

const dateKey = (value) => new Date(value).toISOString().split('T')[0];

const buildDailyTotals = (list) => {
  const latestPerDeviceDay = new Map();
  list.forEach((item) => {
    const day = dateKey(item.sample.end);
    const key = `${item.device.deviceId}-${day}`;
    const existing = latestPerDeviceDay.get(key);
    if (!existing || new Date(item.sample.end) > new Date(existing.sample.end)) {
      latestPerDeviceDay.set(key, item);
    }
  });

  const totals = new Map();
  latestPerDeviceDay.forEach((item) => {
    const day = dateKey(item.sample.end);
    const existing = totals.get(day) ?? { steps: 0, calories: 0 };
    existing.steps += item.sample.steps;
    existing.calories += item.sample.calories;
    totals.set(day, existing);
  });

  return totals;
};

const computeStreak = (dailyTotals) => {
  let streak = 0;
  let cursor = new Date(`${dateKey(new Date())}T00:00:00Z`);

  while (true) {
    const key = cursor.toISOString().split('T')[0];
    const totals = dailyTotals.get(key);
    if (!totals) {
      break;
    }
    const meetsGoal = totals.steps >= goals.steps && totals.calories >= goals.calories;
    if (!meetsGoal) {
      break;
    }
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
};

const buildInsights = (dailyTotals) => {
  const entries = Array.from(dailyTotals.entries()).map(([date, totals]) => ({
    date,
    steps: totals.steps,
    calories: totals.calories,
  }));

  if (!entries.length) {
    return {
      averageSteps7d: 0,
      averageCalories7d: 0,
      goalComplianceRate: 0,
      bestDay: null,
    };
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  const lookbackDays = 7;
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - (lookbackDays - 1));

  const window = entries.filter((entry) => new Date(entry.date) >= cutoff);
  const divisor = window.length || 1;
  const avgSteps = window.reduce((sum, entry) => sum + entry.steps, 0) / divisor;
  const avgCalories = window.reduce((sum, entry) => sum + entry.calories, 0) / divisor;
  const complianceDays = window.filter(
    (entry) => entry.steps >= goals.steps && entry.calories >= goals.calories
  ).length;

  const bestDay = entries.reduce((best, entry) => {
    if (!best || entry.steps > best.steps) {
      return entry;
    }
    return best;
  }, null);

  return {
    averageSteps7d: Math.round(avgSteps),
    averageCalories7d: Math.round(avgCalories),
    goalComplianceRate: window.length ? complianceDays / window.length : 0,
    bestDay,
  };
};

const linearForecast = (values) => {
  if (!values.length) return 0;
  if (values.length < 2) return values[values.length - 1];

  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  values.forEach((value, index) => {
    sumX += index;
    sumY += value;
    sumXY += index * value;
    sumXX += index * index;
  });

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const prediction = intercept + slope * n;
  return Math.max(0, prediction);
};

const buildSummaryPayload = () => {
  const dailyTotals = buildDailyTotals(metrics);
  const todayKey = dateKey(new Date());
  const todayTotals = dailyTotals.get(todayKey) ?? { steps: 0, calories: 0 };
  const insights = buildInsights(dailyTotals);
  const sortedEntries = Array.from(dailyTotals.entries()).sort(
    (a, b) => new Date(a[0]) - new Date(b[0])
  );
  const recentEntries = sortedEntries.slice(-14);
  const stepsSeries = recentEntries.map(([, totals]) => totals.steps);
  const caloriesSeries = recentEntries.map(([, totals]) => totals.calories);
  const predictions = {
    steps: Math.round(linearForecast(stepsSeries)),
    calories: Math.round(linearForecast(caloriesSeries)),
    basisDays: recentEntries.length,
  };

  return {
    goals,
    today: {
      steps: todayTotals.steps,
      calories: todayTotals.calories,
      stepGoal: goals.steps,
      calorieGoal: goals.calories,
      stepProgress: goals.steps ? todayTotals.steps / goals.steps : 0,
      calorieProgress: goals.calories ? todayTotals.calories / goals.calories : 0,
    },
    streak: {
      days: computeStreak(dailyTotals),
    },
    insights,
    predictions,
  };
};

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

  const latestSample = data.reduce((latest, item) => {
    if (!latest) {
      return item;
    }
    return new Date(item.sample.end) > new Date(latest.sample.end) ? item : latest;
  }, null);

  res.json({
    data,
    totals: buildSummary(data),
    current: latestSample,
    summary: buildSummaryPayload(),
  });
});

app.get('/api/goals', (_req, res) => {
  res.json(buildSummaryPayload());
});

app.put('/api/goals', async (req, res) => {
  const nextSteps = Number(req.body?.steps);
  const nextCalories = Number(req.body?.calories);
  if (!Number.isFinite(nextSteps) || nextSteps <= 0 || !Number.isFinite(nextCalories) || nextCalories <= 0) {
    return res.status(400).json({ message: 'steps and calories must be positive numbers' });
  }
  goals = { steps: Math.round(nextSteps), calories: nextCalories };
  await persistGoals();
  res.json(buildSummaryPayload());
});

app.get('/api/summary', (_req, res) => {
  res.json(buildSummaryPayload());
});

app.get('/api/insights', (_req, res) => {
  const payload = buildSummaryPayload();
  res.json(payload.insights);
});

app.get('/api/predictions', (_req, res) => {
  const payload = buildSummaryPayload();
  res.json(payload.predictions);
});

app.post('/api/metrics', async (req, res) => {
  if (!req.body?.sample) {
    return res.status(400).json({ message: 'sample payload is required' });
  }

  const sample = normalizeSample(req.body);
  const existingIndex = findMatchingIndex(sample);

  if (existingIndex >= 0) {
    const existing = metrics[existingIndex];
    metrics[existingIndex] = {
      ...existing,
      receivedAt: sample.receivedAt,
      sample: sample.sample,
    };
    await persistToDisk();
    return res.status(200).json({ message: 'updated', id: existing.id });
  }

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
  await Promise.all([loadFromDisk(), loadGoals()]);
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

bootstrap();
