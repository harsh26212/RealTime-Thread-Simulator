/**
 * visualization.js
 * Handles all Chart.js visualizations:
 * - CPU Utilization line chart
 * - Average Wait Time line chart
 * - Gantt / Timeline chart
 * - Thread state distribution donut chart
 */

const Viz = {
  cpuChart: null,
  waitChart: null,
  distChart: null,

  initCharts() {
    this.destroyCharts();
    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';

    const gridColor = 'rgba(255,255,255,0.06)';
    const fontFamily = "'IBM Plex Mono', monospace";

    // ── CPU Utilization Chart ──
    const cpuCtx = document.getElementById('cpuUtilChart')?.getContext('2d');
    if (cpuCtx) {
      this.cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'CPU Utilization %',
            data: [],
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0,212,255,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { font: { family: fontFamily, size: 10 }, maxTicksLimit: 10 }
            },
            y: {
              min: 0, max: 100,
              grid: { color: gridColor },
              ticks: {
                font: { family: fontFamily, size: 10 },
                callback: v => v + '%'
              }
            }
          }
        }
      });
    }

    // ── Wait Time Chart ──
    const waitCtx = document.getElementById('waitTimeChart')?.getContext('2d');
    if (waitCtx) {
      this.waitChart = new Chart(waitCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Avg Wait Time (ticks)',
            data: [],
            borderColor: '#ffd166',
            backgroundColor: 'rgba(255,209,102,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { font: { family: fontFamily, size: 10 }, maxTicksLimit: 10 }
            },
            y: {
              min: 0,
              grid: { color: gridColor },
              ticks: { font: { family: fontFamily, size: 10 } }
            }
          }
        }
      });
    }

    // ── State Distribution Donut ──
    const distCtx = document.getElementById('stateDistChart')?.getContext('2d');
    if (distCtx) {
      this.distChart = new Chart(distCtx, {
        type: 'doughnut',
        data: {
          labels: ['Running', 'Ready', 'Waiting', 'Blocked', 'Terminated'],
          datasets: [{
            data: [0, 0, 0, 0, 0],
            backgroundColor: ['#06d6a0', '#ffd166', '#ff6b6b', '#f97316', '#666'],
            borderColor: 'transparent',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 200 },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: { family: fontFamily, size: 10 },
                padding: 8,
                boxWidth: 10
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  },

  destroyCharts() {
    [this.cpuChart, this.waitChart, this.distChart].forEach(c => c && c.destroy());
    this.cpuChart = null; this.waitChart = null; this.distChart = null;
  },

  update(snapshot) {
    this.updateCpuChart(snapshot.cpuUtilHistory);
    this.updateWaitChart(snapshot.waitTimeHistory);
    this.updateDistChart(snapshot.userThreads);
    this.updateGantt(snapshot.ganttData, snapshot.userThreads);
    this.updateThreadCards(snapshot);
    this.updateKernelView(snapshot);
    this.updateStats(snapshot);
    this.updateLogs(snapshot.logs);
  },

  updateCpuChart(history) {
    if (!this.cpuChart || !history.length) return;
    const recent = history.slice(-50);
    this.cpuChart.data.labels = recent.map(d => `T${d.tick}`);
    this.cpuChart.data.datasets[0].data = recent.map(d => d.util);
    this.cpuChart.update('none');
  },

  updateWaitChart(history) {
    if (!this.waitChart || !history.length) return;
    const recent = history.slice(-50);
    this.waitChart.data.labels = recent.map(d => `T${d.tick}`);
    this.waitChart.data.datasets[0].data = recent.map(d => d.avgWait);
    this.waitChart.update('none');
  },

  updateDistChart(threads) {
    if (!this.distChart) return;
    const counts = { running: 0, ready: 0, waiting: 0, blocked: 0, terminated: 0 };
    threads.forEach(t => {
      if (t.state === 'running') counts.running++;
      else if (t.state === 'ready') counts.ready++;
      else if (t.state === 'waiting') counts.waiting++;
      else if (t.state === 'blocked') counts.blocked++;
      else if (t.state === 'terminated') counts.terminated++;
    });
    this.distChart.data.datasets[0].data = [
      counts.running, counts.ready, counts.waiting, counts.blocked, counts.terminated
    ];
    this.distChart.update('none');
  },

  updateGantt(ganttData, threads) {
    const container = document.getElementById('ganttContainer');
    if (!container) return;

    // Build per-thread rows from last 40 ticks
    const maxTick = ganttData.length > 0 ? Math.max(...ganttData.map(g => g.tick)) : 0;
    const startTick = Math.max(1, maxTick - 39);
    const ticks = maxTick - startTick + 1;

    // Build map: tick -> { threadId, color }
    const tickMap = {};
    ganttData.forEach(g => { tickMap[g.tick] = g; });

    const activeThreads = threads.filter(t => t.state !== 'terminated' || ganttData.some(g => g.threadId === t.id));
    if (activeThreads.length === 0) { container.innerHTML = '<div class="gantt-empty">No thread data yet</div>'; return; }

    let html = '<div class="gantt-chart">';
    // Header row
    html += '<div class="gantt-row gantt-header"><div class="gantt-label">Thread</div><div class="gantt-timeline">';
    for (let i = startTick; i <= maxTick; i++) {
      html += `<div class="gantt-tick-label">${i}</div>`;
    }
    html += '</div></div>';

    // One row per active thread
    for (const t of activeThreads) {
      html += `<div class="gantt-row">`;
      html += `<div class="gantt-label" style="color:${t.color}">${t.name}</div>`;
      html += `<div class="gantt-timeline">`;
      for (let tick = startTick; tick <= maxTick; tick++) {
        const g = ganttData.find(d => d.tick === tick && d.threadId === t.id);
        if (g) {
          html += `<div class="gantt-cell active" style="background:${t.color}" title="T${tick}: Running"></div>`;
        } else {
          // Check state at that tick from history
          const histEntry = t.history?.filter(h => h.tick <= tick).pop();
          let cls = '';
          if (histEntry) {
            cls = histEntry.to === 'waiting' ? 'waiting' : histEntry.to === 'ready' ? 'ready' : '';
          }
          html += `<div class="gantt-cell ${cls}" title="T${tick}: ${histEntry?.to || 'idle'}"></div>`;
        }
      }
      html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  },

  updateThreadCards(snapshot) {
    const container = document.getElementById('threadCardsContainer');
    if (!container) return;

    if (snapshot.userThreads.length === 0) {
      container.innerHTML = '<div class="empty-hint">Add threads using the control panel →</div>';
      return;
    }

    let html = '';
    for (const t of snapshot.userThreads) {
      const pct = Math.round(((t.burstTime - t.remainingTime) / t.burstTime) * 100);
      const stateClass = t.state.replace(/\s+/, '-');
      html += `
        <div class="thread-card state-${stateClass}" data-tid="${t.id}">
          <div class="tc-header">
            <div class="tc-dot" style="background:${t.color}"></div>
            <span class="tc-name">${t.name}</span>
            <span class="tc-state">${t.state.toUpperCase()}</span>
          </div>
          <div class="tc-body">
            <div class="tc-row"><span>Priority</span><span>${t.priority}</span></div>
            <div class="tc-row"><span>Burst</span><span>${t.burstTime} ticks</span></div>
            <div class="tc-row"><span>Remaining</span><span>${t.remainingTime}</span></div>
            <div class="tc-row"><span>Wait</span><span>${t.waitTime}</span></div>
          </div>
          <div class="tc-progress">
            <div class="tc-progress-bar" style="width:${pct}%; background:${t.color}"></div>
          </div>
          <div class="tc-kt">KT: KT${t.kernelThreadId || '?'}</div>
          <button class="tc-remove" onclick="UIController.removeThread(${t.id})" title="Remove thread">✕</button>
        </div>`;
    }
    container.innerHTML = html;
  },

  updateKernelView(snapshot) {
    const container = document.getElementById('kernelViewContainer');
    if (!container) return;

    let html = '<div class="kv-grid">';

    // CPUs
    for (const cpu of snapshot.cpus) {
      const t = snapshot.userThreads.find(t => t.state === 'running' && snapshot.ganttData.slice(-snapshot.cpus.length).some(g => g.cpuId === cpu.id && g.threadId === t.id));
      const runningThread = snapshot.userThreads.find(u =>
        snapshot.cpus.find(c => c.id === cpu.id)?.runningUserThread?.id === u.id
      );
      // Try getting running thread from latest gantt
      const latest = snapshot.ganttData.filter(g => g.cpuId === cpu.id).slice(-1)[0];
      const activeThread = latest && snapshot.tick - latest.tick <= 1
        ? snapshot.userThreads.find(u => u.id === latest.threadId)
        : null;

      html += `<div class="kv-cpu ${activeThread ? 'active' : ''}">
        <div class="kv-cpu-label">⚙️ ${cpu.name}</div>
        ${activeThread ? `<div class="kv-running" style="color:${activeThread.color}">${activeThread.name}</div>` : '<div class="kv-idle">IDLE</div>'}
      </div>`;
    }

    // Kernel threads
    html += '<div class="kv-sep"></div>';
    for (const kt of snapshot.kernelThreads) {
      const assigned = snapshot.userThreads.filter(t => t.kernelThreadId === kt.id && t.state !== 'terminated');
      html += `<div class="kv-kt">
        <div class="kv-kt-label">${kt.name}</div>
        <div class="kv-ut-list">${assigned.map(t => `<span style="color:${t.color};border-color:${t.color}" class="kv-ut-badge state-${t.state}">${t.name}</span>`).join('') || '<span class="kv-idle-small">idle</span>'}</div>
      </div>`;
    }

    // Ready queue
    html += '<div class="kv-sep"></div>';
    html += '<div class="kv-queue"><div class="kv-queue-label">Ready Queue</div><div class="kv-queue-items">';
    if (snapshot.readyQueue.length === 0) {
      html += '<span class="kv-idle-small">empty</span>';
    } else {
      snapshot.readyQueue.forEach(tid => {
        const t = snapshot.userThreads.find(u => u.id === tid);
        if (t) html += `<span class="kv-queue-item" style="background:${t.color}20;border-color:${t.color}">${t.name}</span>`;
      });
    }
    html += '</div></div>';

    // Waiting queue
    html += '<div class="kv-queue"><div class="kv-queue-label" style="color:#ff6b6b">Waiting Queue</div><div class="kv-queue-items">';
    if (snapshot.waitingQueue.length === 0) {
      html += '<span class="kv-idle-small">empty</span>';
    } else {
      snapshot.waitingQueue.forEach(tid => {
        const t = snapshot.userThreads.find(u => u.id === tid);
        if (t) html += `<span class="kv-queue-item" style="background:#ff6b6b20;border-color:#ff6b6b">${t.name}</span>`;
      });
    }
    html += '</div></div>';

    html += '</div>';
    container.innerHTML = html;
  },

  updateStats(snapshot) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('statTick', snapshot.tick);
    set('statActive', snapshot.activeCount);
    set('statDone', snapshot.terminatedCount);
    set('statThroughput', snapshot.throughput);
    const cpuUtil = snapshot.cpuUtilHistory.slice(-1)[0]?.util ?? 0;
    set('statCpuUtil', cpuUtil + '%');
    const avgWait = snapshot.waitTimeHistory.slice(-1)[0]?.avgWait ?? 0;
    set('statAvgWait', avgWait + ' ticks');
  },

  updateLogs(logs) {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    container.innerHTML = logs.slice(0, 30).map(l =>
      `<div class="log-entry"><span class="log-tick">T${l.tick}</span><span class="log-msg">${l.msg}</span></div>`
    ).join('');
  }
};

window.Viz = Viz;
