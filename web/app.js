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
const chartCanvas = document.getElementById('steps-chart');

let apiBase = localStorage.getItem('apiBase') || 'http://localhost:4000';
let stepsChart;
let refreshTimer;

const formatNumber = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

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
  const { totals, data } = payload;
  summaryFields.steps.textContent = totals.steps.toLocaleString();
  summaryFields.calories.textContent = formatNumber(totals.calories);
  summaryFields.distance.textContent = formatNumber(totals.distance / 1000);
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
        <td>${formatNumber(entry.sample.calories)}</td>
        <td>${formatNumber(entry.sample.distance / 1000)}</td>
      </tr>`;
    })
    .join('');
};

const updateChart = (rows) => {
  const labels = rows.map((entry) => new Date(entry.sample.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const data = rows.map((entry) => entry.sample.steps);

  if (!stepsChart) {
    stepsChart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Steps',
            data,
            borderColor: '#42b883',
            backgroundColor: 'rgba(66, 184, 131, 0.2)',
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
    return;
  }

  stepsChart.data.labels = labels;
  stepsChart.data.datasets[0].data = data;
  stepsChart.update('none');
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

beginPolling();
fetchMetrics();
