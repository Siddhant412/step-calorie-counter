const apiInput = document.getElementById('api-base');
const apiForm = document.getElementById('api-form');
const refreshBtn = document.getElementById('refresh-btn');
const summaryFields = {
  steps: document.querySelector('[data-field="steps"]'),
  calories: document.querySelector('[data-field="calories"]'),
  distance: document.querySelector('[data-field="distance"]'),
  count: document.querySelector('[data-field="count"]'),
};
const tableBody = document.getElementById('metrics-body');
const chartSvg = document.getElementById('steps-chart');
const chartLine = document.getElementById('sparkline-line');
const chartFill = document.getElementById('sparkline-fill');
const chartEmpty = document.getElementById('chart-empty');
const stepsLegend = document.getElementById('steps-legend');
const resetBtn = document.getElementById('reset-btn');

let apiBase = localStorage.getItem('apiBase') || 'http://localhost:4000';
let refreshTimer;
const MAX_POINTS = 24;

const formatNumber = (value, digits = 1) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const normalizeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return null;
  }
};

const setApiBase = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    throw new Error('Invalid URL');
  }
  apiBase = normalized;
  localStorage.setItem('apiBase', normalized);
};

const updateSummary = (payload) => {
  const { totals, data, current } = payload;
  const source = current?.sample || totals;
  summaryFields.steps.textContent = (source.steps || 0).toLocaleString();
  summaryFields.calories.textContent = formatNumber(source.calories || 0, 1);
  const distanceKm = (source.distance || 0) / 1000;
  summaryFields.distance.textContent = formatNumber(distanceKm, distanceKm < 1 ? 2 : 1);
  summaryFields.count.textContent = data.length;
};

const updateTable = (rows) => {
  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="placeholder">Nothing yet</td></tr>';
    return;
  }

  tableBody.innerHTML = rows
    .slice()
    .reverse()
    .map((entry) => {
      const interval = `${new Date(entry.sample.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(entry.sample.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return `<tr>
        <td>${interval}</td>
        <td>${entry.sample.steps.toLocaleString()}</td>
        <td>${formatNumber(entry.sample.calories, 1)}</td>
        <td>${formatNumber(entry.sample.distance / 1000, entry.sample.distance < 1000 ? 2 : 1)}</td>
      </tr>`;
    })
    .join('');
};

const updateChart = (rows) => {
  const subset = rows.slice(-MAX_POINTS);

  if (!subset.length) {
    chartLine.removeAttribute('points');
    chartFill.removeAttribute('points');
    chartEmpty.hidden = false;
    stepsLegend.innerHTML = '<li class="placeholder">No samples yet</li>';
    return;
  }

  const width = 100;
  const height = 60;
  chartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const values = subset.map((entry) => entry.sample.steps);
  const maxValue = Math.max(...values, 1);

  const coords = subset.map((entry, index) => {
    const ratio = subset.length === 1 ? 0 : index / (subset.length - 1);
    const x = (ratio * width).toFixed(2);
    const y = (height - (entry.sample.steps / maxValue) * height).toFixed(2);
    return `${x},${y}`;
  });

  chartLine.setAttribute('points', coords.join(' '));
  const fillPoints = [`0,${height}`, ...coords, `${width},${height}`];
  chartFill.setAttribute('points', fillPoints.join(' '));
  chartEmpty.hidden = true;

  stepsLegend.innerHTML = subset
    .slice()
    .reverse()
    .slice(0, 4)
    .map((entry) => {
      const label = new Date(entry.sample.end).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `<li><span>${label}</span><strong>${entry.sample.steps.toLocaleString()}</strong></li>`;
    })
    .join('');
};

const fetchMetrics = async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing…';
  try {
    const url = new URL('/api/metrics', `${apiBase}/`);
    url.searchParams.set('limit', '50');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch metrics');
    }
    const payload = await response.json();
    updateSummary(payload);
    updateTable(payload.data);
    updateChart(payload.data);
    refreshBtn.textContent = 'Refresh';
  } catch (error) {
    console.error(error);
    refreshBtn.textContent = 'Retry';
  } finally {
    refreshBtn.disabled = false;
  }
};

const beginPolling = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(fetchMetrics, 10000);
};

apiInput.value = apiBase;

apiForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    setApiBase(apiInput.value);
    fetchMetrics();
  } catch (error) {
    alert('Please provide a valid URL');
  }
});

refreshBtn.addEventListener('click', () => {
  fetchMetrics();
});

resetBtn.addEventListener('click', async () => {
  const proceed = window.confirm('Delete all samples from the server?');
  if (!proceed) {
    return;
  }

  const defaultLabel = 'Reset Data';
  resetBtn.disabled = true;
  resetBtn.textContent = 'Resetting…';
  try {
    const url = new URL('/api/metrics', `${apiBase}/`);
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Reset failed');
    }
    await fetchMetrics();
  } catch (error) {
    console.error(error);
    alert('Unable to reset data. Please try again.');
  } finally {
    resetBtn.disabled = false;
    resetBtn.textContent = defaultLabel;
  }
});

beginPolling();
fetchMetrics();
