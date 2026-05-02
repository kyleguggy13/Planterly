let periodChartInstance = null;

function getChartPeriodKeys(period = currentPeriod) {
  const loggedKeys = new Set();
  appState.meals.forEach(meal => {
    if (isISODate(meal.date)) loggedKeys.add(getPeriodKey(period, meal.date));
  });

  const bounds = [...loggedKeys, currentPeriodKey].sort();
  if (!bounds.length) return [currentPeriodKey];

  const keys = [];
  let key = bounds[0];
  const endKey = bounds[bounds.length - 1];
  let guard = 0;

  while (key <= endKey && guard < 5000) {
    keys.push(key);
    key = shiftPeriodKey(period, key, 1);
    guard += 1;
  }

  if (!keys.includes(endKey)) keys.push(endKey);
  return keys;
}

function getUniquePlantCountForPeriod(period, key) {
  const { start, end } = getPeriodRange(period, key);
  const plants = new Set();
  appState.meals.forEach(meal => {
    if (!isISODate(meal.date) || meal.date < start || meal.date > end || !Array.isArray(meal.plants)) return;
    meal.plants.forEach(plant => plants.add(plant));
  });
  return plants.size;
}

function formatChartPeriodLabel(period, key) {
  const { start } = getPeriodRange(period, key);
  const startDate = parseISODateLocal(start);
  if (!startDate) return key;
  if (period === 'day' || period === 'week') return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (period === 'month') return startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return key;
}

function getPluralPeriodLabel(period) {
  return PERIOD_COPY[period].label + 's';
}

function getChartBarWidth(period) {
  if (period === 'month') return 76;
  if (period === 'year') return 96;
  return 68;
}

function scrollSelectedChartBarIntoView(chartShell, selectedIndex, barWidth) {
  if (selectedIndex < 0) return;
  window.requestAnimationFrame(() => {
    const selectedCenter = selectedIndex * barWidth + (barWidth / 2);
    const nextLeft = Math.max(0, selectedCenter - (chartShell.clientWidth / 2));
    chartShell.scrollTo({ left: nextLeft, behavior: 'smooth' });
  });
}

function renderPeriodChart() {
  const chartShell = document.getElementById('period-chart');
  const chartBody = document.getElementById('period-chart-canvas-wrap');
  const canvas = document.getElementById('period-chart-canvas');
  const empty = document.getElementById('period-chart-empty');
  const periodLabel = PERIOD_COPY[currentPeriod].label;
  const pluralLabel = getPluralPeriodLabel(currentPeriod);
  const items = getChartPeriodKeys().map(key => ({
    key,
    label: formatChartPeriodLabel(currentPeriod, key),
    fullLabel: formatPeriodLabel(currentPeriod, key),
    count: getUniquePlantCountForPeriod(currentPeriod, key),
  }));
  const maxCount = Math.max(0, ...items.map(item => item.count));

  document.getElementById('h-chart-title').textContent = 'Unique plants by ' + periodLabel;
  document.getElementById('h-chart-meta').textContent = items.length + ' ' + pluralLabel;

  if (!maxCount) {
    if (periodChartInstance) {
      periodChartInstance.destroy();
      periodChartInstance = null;
    }
    chartShell.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = 'No plants logged in these ' + pluralLabel + ' yet.';
    return;
  }

  if (typeof Chart === 'undefined') {
    chartShell.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = 'Chart library could not load.';
    return;
  }

  const labels = items.map(item => item.label);
  const counts = items.map(item => item.count);
  const periodKeys = items.map(item => item.key);
  const backgroundColors = items.map(item => item.key === currentPeriodKey ? 'rgba(26, 122, 78, 0.88)' : 'rgba(93, 142, 104, 0.34)');
  const borderColors = items.map(item => item.key === currentPeriodKey ? 'rgba(18, 92, 58, 1)' : 'rgba(93, 142, 104, 0.72)');
  const barWidth = getChartBarWidth(currentPeriod);
  const nextWidth = Math.max(chartShell.clientWidth || 0, 560, items.length * barWidth);
  const selectedIndex = periodKeys.indexOf(currentPeriodKey);

  chartBody.style.width = nextWidth + 'px';
  chartShell.style.display = 'block';
  empty.style.display = 'none';

  const chartData = {
    labels,
    datasets: [{
      label: 'Unique plants',
      data: counts,
      periodKeys,
      fullLabels: items.map(item => item.fullLabel),
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1,
      borderRadius: 6,
      minBarLength: 3,
      maxBarThickness: 44,
    }],
  };

  if (!periodChartInstance) {
    periodChartInstance = new Chart(canvas, {
      type: 'bar',
      data: chartData,
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: { duration: 220 },
        onClick(event, elements, chart) {
          if (!elements.length) return;
          const index = elements[0].index;
          const nextKey = chart.data.datasets[0].periodKeys?.[index];
          if (!nextKey || nextKey === currentPeriodKey) return;
          currentPeriodKey = nextKey;
          renderAll();
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(context) {
                return context[0].dataset.fullLabels?.[context[0].dataIndex] || '';
              },
              label(context) {
                const count = context.parsed.y || 0;
                return count + (count === 1 ? ' unique plant' : ' unique plants');
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#6D6A62',
              font: { size: 12, weight: '700' },
              maxRotation: 0,
              minRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(5, maxCount),
            ticks: {
              precision: 0,
              color: '#6D6A62',
              font: { size: 12, weight: '700' },
            },
            grid: { color: 'rgba(58, 56, 52, 0.08)' },
          },
        },
      },
    });
    scrollSelectedChartBarIntoView(chartShell, selectedIndex, barWidth);
    return;
  }

  periodChartInstance.data = chartData;
  periodChartInstance.options.scales.y.suggestedMax = Math.max(5, maxCount);
  periodChartInstance.resize();
  periodChartInstance.update();
  scrollSelectedChartBarIntoView(chartShell, selectedIndex, barWidth);
}
