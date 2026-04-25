/**
 * uiController.js
 * Wires together SimEngine, Viz, sync scenarios, and DOM event listeners.
 */

const UIController = {
  // Active sync scenario instances
  pcScenario: null,
  dpScenario: null,
  pcInterval: null,
  dpInterval: null,
  activeTab: 'main',
  darkMode: true,

  init() {
    // Init engine with defaults
    SimEngine.init({
      model: ThreadModel.ONE_TO_ONE,
      schedulingAlg: 'round-robin',
      timeQuantum: 3,
      numCPUs: 1,
      speed: 600,
      initialThreadCount: 0
    });

    // Wire engine callbacks
    SimEngine.onTick = (snap) => {
      if (this.activeTab === 'main') Viz.update(snap);
    };

    // Init charts
    Viz.initCharts();

    // Bind controls
    this.bindControls();

    // Load welcome snapshot
    Viz.update(SimEngine.getSnapshot());

    this.log('Welcome! Select a scenario or add threads manually.');
  },

  bindControls() {
    // Model select
    document.getElementById('modelSelect')?.addEventListener('change', e => {
      SimEngine.model = e.target.value;
      this.applyModelChange();
    });

    // Scheduling algorithm
    document.getElementById('schedSelect')?.addEventListener('change', e => {
      SimEngine.schedulingAlg = e.target.value;
      // Re-sort ready queue
      if (e.target.value === 'priority') {
        SimEngine.readyQueue.sort((a, b) => b.priority - a.priority);
      }
    });

    // Time quantum
    document.getElementById('quantumInput')?.addEventListener('input', e => {
      SimEngine.timeQuantum = parseInt(e.target.value) || 3;
      document.getElementById('quantumVal').textContent = SimEngine.timeQuantum;
    });

    // Speed slider
    document.getElementById('speedSlider')?.addEventListener('input', e => {
      const ms = parseInt(e.target.value);
      SimEngine.setSpeed(ms);
      document.getElementById('speedVal').textContent = ms < 200 ? 'Fast' : ms < 600 ? 'Med' : 'Slow';
    });

    // CPU count
    document.getElementById('cpuCount')?.addEventListener('change', e => {
      SimEngine.numCPUs = parseInt(e.target.value);
      this.resetSimulation();
    });

    // Sim controls
    document.getElementById('btnStart')?.addEventListener('click', () => this.startSim());
    document.getElementById('btnPause')?.addEventListener('click', () => this.pauseSim());
    document.getElementById('btnStep')?.addEventListener('click', () => this.stepSim());
    document.getElementById('btnReset')?.addEventListener('click', () => this.resetSimulation());

    // Add thread form
    document.getElementById('btnAddThread')?.addEventListener('click', () => this.addThreadFromForm());

    // Dark/Light toggle
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

    // Scenario buttons
    document.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.addEventListener('click', e => {
        this.loadPreloadedScenario(e.target.closest('[data-scenario]').dataset.scenario);
      });
    });

    // Tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', e => this.switchTab(e.target.closest('[data-tab]').dataset.tab));
    });

    // Sync scenario controls
    document.getElementById('btnStartPC')?.addEventListener('click', () => this.startProducerConsumer());
    document.getElementById('btnStopPC')?.addEventListener('click', () => this.stopProducerConsumer());
    document.getElementById('btnStartDP')?.addEventListener('click', () => this.startDiningPhilosophers());
    document.getElementById('btnStopDP')?.addEventListener('click', () => this.stopDiningPhilosophers());

    // Semaphore manual controls
    document.getElementById('btnSemWait')?.addEventListener('click', () => this.manualSemWait());
    document.getElementById('btnSemSignal')?.addEventListener('click', () => this.manualSemSignal());

    // Monitor manual controls
    document.getElementById('btnMonEnter')?.addEventListener('click', () => this.manualMonEnter());
    document.getElementById('btnMonExit')?.addEventListener('click', () => this.manualMonExit());
  },

  startSim() {
    if (SimEngine.userThreads.length === 0) {
      this.loadPreloadedScenario('default');
    }
    SimEngine.start();
    document.getElementById('btnStart').textContent = '▶ Running';
    document.getElementById('btnStart').classList.add('active');
  },

  pauseSim() {
    SimEngine.pause();
    const btn = document.getElementById('btnPause');
    btn.textContent = SimEngine.paused ? '▷ Resume' : '⏸ Pause';
  },

  stepSim() {
    if (!SimEngine.running) {
      if (SimEngine.userThreads.length === 0) this.loadPreloadedScenario('default');
      SimEngine.running = true;
    }
    SimEngine.stepOnce();
    Viz.update(SimEngine.getSnapshot());
  },

  resetSimulation() {
    SimEngine.stop();
    SimEngine.init({
      model: document.getElementById('modelSelect')?.value || ThreadModel.ONE_TO_ONE,
      schedulingAlg: document.getElementById('schedSelect')?.value || 'round-robin',
      timeQuantum: parseInt(document.getElementById('quantumInput')?.value) || 3,
      numCPUs: parseInt(document.getElementById('cpuCount')?.value) || 1,
      speed: parseInt(document.getElementById('speedSlider')?.value) || 600
    });
    Viz.initCharts();
    Viz.update(SimEngine.getSnapshot());
    document.getElementById('btnStart').textContent = '▶ Start';
    document.getElementById('btnStart').classList.remove('active');
    document.getElementById('btnPause').textContent = '⏸ Pause';
    this.log('Simulation reset.');
  },

  applyModelChange() {
    const wasRunning = SimEngine.running;
    const model = SimEngine.model;
    SimEngine.stop();

    // Update model explanation
    const explanations = {
      'many-to-one': 'Many user threads → 1 kernel thread. Simple but blocks entire process on I/O.',
      'one-to-one': 'Each user thread → 1 kernel thread. True parallelism, higher overhead.',
      'many-to-many': 'Many user threads → pool of kernel threads. Best of both worlds.'
    };
    const el = document.getElementById('modelExplanation');
    if (el) el.textContent = explanations[model] || '';

    this.resetSimulation();
  },

  addThreadFromForm() {
    const name = document.getElementById('threadName')?.value.trim() || `T${SimEngine.userThreads.length + 1}`;
    const priority = parseInt(document.getElementById('threadPriority')?.value) || 1;
    const burst = parseInt(document.getElementById('threadBurst')?.value) || 0;
    SimEngine.addThread(name, priority, burst || null);
    Viz.update(SimEngine.getSnapshot());
    document.getElementById('threadName').value = '';
  },

  removeThread(id) {
    SimEngine.removeThread(id);
    Viz.update(SimEngine.getSnapshot());
  },

  loadPreloadedScenario(name) {
    this.resetSimulation();

    const scenarios = {
      default: () => {
        ['T1', 'T2', 'T3'].forEach((n, i) => SimEngine.addThread(n, i + 1, 5 + i));
      },
      highload: () => {
        for (let i = 1; i <= 6; i++) SimEngine.addThread(`W${i}`, Math.ceil(i / 2), 4 + i);
      },
      priority: () => {
        SimEngine.schedulingAlg = 'priority';
        document.getElementById('schedSelect').value = 'priority';
        [['Critical', 5, 3], ['High', 4, 4], ['Normal', 2, 6], ['Low', 1, 8]].forEach(([n, p, b]) =>
          SimEngine.addThread(n, p, b)
        );
      },
      io: () => {
        for (let i = 1; i <= 4; i++) SimEngine.addThread(`IO${i}`, 1, 8);
      },
      manyToOne: () => {
        document.getElementById('modelSelect').value = ThreadModel.MANY_TO_ONE;
        SimEngine.model = ThreadModel.MANY_TO_ONE;
        SimEngine.setupKernelThreads(4);
        for (let i = 1; i <= 4; i++) SimEngine.addThread(`UT${i}`, 1, 5);
        const el = document.getElementById('modelExplanation');
        if (el) el.textContent = 'Many user threads → 1 kernel thread. Simple but blocks entire process on I/O.';
      },
      manyToMany: () => {
        document.getElementById('modelSelect').value = ThreadModel.MANY_TO_MANY;
        SimEngine.model = ThreadModel.MANY_TO_MANY;
        SimEngine.setupKernelThreads(5);
        for (let i = 1; i <= 5; i++) SimEngine.addThread(`T${i}`, Math.ceil(Math.random() * 3), 4 + i);
        const el = document.getElementById('modelExplanation');
        if (el) el.textContent = 'Many user threads → pool of kernel threads. Best of both worlds.';
      }
    };

    if (scenarios[name]) {
      scenarios[name]();
      Viz.update(SimEngine.getSnapshot());
      this.log(`Scenario "${name}" loaded with ${SimEngine.userThreads.length} threads.`);
    }
  },

  // ─── SYNC SCENARIOS ───────────────────────────────────────────────────────

  startProducerConsumer() {
    if (this.pcInterval) return;
    const bufSize = parseInt(document.getElementById('pcBufferSize')?.value) || 5;
    const nProd = parseInt(document.getElementById('pcProducers')?.value) || 2;
    const nCons = parseInt(document.getElementById('pcConsumers')?.value) || 2;

    this.pcScenario = new ProducerConsumerScenario(bufSize);
    for (let i = 1; i <= nProd; i++) this.pcScenario.addProducer(i);
    for (let i = nProd + 1; i <= nProd + nCons; i++) this.pcScenario.addConsumer(i);

    this.pcInterval = setInterval(() => {
      this.pcScenario.step();
      if (this.activeTab === 'sync') this.renderPCState();
    }, 600);

    this.log(`Producer-Consumer started: ${nProd} producers, ${nCons} consumers, buffer=${bufSize}`);
  },

  stopProducerConsumer() {
    clearInterval(this.pcInterval);
    this.pcInterval = null;
    this.log('Producer-Consumer stopped.');
  },

  renderPCState() {
    if (!this.pcScenario) return;
    const s = this.pcScenario.getState();

    // Buffer visualization
    const bufEl = document.getElementById('pcBuffer');
    if (bufEl) {
      let html = '';
      for (let i = 0; i < s.bufferSize; i++) {
        const item = s.buffer[i];
        html += `<div class="pc-slot ${item !== undefined ? 'filled' : 'empty'}">${item !== undefined ? item : ''}</div>`;
      }
      bufEl.innerHTML = html;
    }

    // Semaphore states
    this.renderSemState('pcSemMutex', s.mutex);
    this.renderSemState('pcSemEmpty', s.empty);
    this.renderSemState('pcSemFull', s.full);

    // Logs
    const logEl = document.getElementById('pcLog');
    if (logEl) logEl.innerHTML = s.log.map(l =>
      `<div class="log-entry"><span class="log-tick">T${l.tick}</span><span class="log-msg">${l.msg}</span></div>`
    ).join('');

    // Producer/consumer states
    const pEl = document.getElementById('pcProducerStates');
    if (pEl) pEl.innerHTML = s.producers.map(p =>
      `<div class="pc-agent producer ${p.state}"><span>P${p.id}</span><span>${p.state}</span></div>`
    ).join('');

    const cEl = document.getElementById('pcConsumerStates');
    if (cEl) cEl.innerHTML = s.consumers.map(c =>
      `<div class="pc-agent consumer ${c.state}"><span>C${c.id}</span><span>${c.state}</span></div>`
    ).join('');
  },

  renderSemState(elId, sem) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = `
      <div class="sem-name">${sem.name}</div>
      <div class="sem-value">${sem.value}/${sem.maxValue}</div>
      <div class="sem-bar"><div class="sem-fill" style="width:${(sem.value / (sem.maxValue || 1)) * 100}%"></div></div>
      <div class="sem-queue">${sem.waitQueue.length ? 'Waiting: T' + sem.waitQueue.join(', T') : 'No waiters'}</div>`;
  },

  startDiningPhilosophers() {
    if (this.dpInterval) return;
    const n = parseInt(document.getElementById('dpCount')?.value) || 5;
    this.dpScenario = new DiningPhilosophersScenario(n);

    this.dpInterval = setInterval(() => {
      this.dpScenario.step();
      if (this.activeTab === 'sync') this.renderDPState();
    }, 700);

    this.log(`Dining Philosophers started with ${n} philosophers.`);
  },

  stopDiningPhilosophers() {
    clearInterval(this.dpInterval);
    this.dpInterval = null;
    this.log('Dining Philosophers stopped.');
  },

  renderDPState() {
    if (!this.dpScenario) return;
    const s = this.dpScenario.getState();
    const canvas = document.getElementById('dpCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.35, r = 20;
    ctx.clearRect(0, 0, W, H);

    const n = s.philosophers.length;
    const stateColors = { thinking: '#6366f1', hungry: '#ffd166', eating: '#06d6a0' };

    // Draw table
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw forks
    s.forks.forEach((fork, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2 + (Math.PI / n);
      const fx = cx + R * 0.72 * Math.cos(angle);
      const fy = cy + R * 0.72 * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(fx, fy, 8, 0, Math.PI * 2);
      ctx.fillStyle = fork.value > 0 ? 'rgba(255,255,255,0.6)' : '#ff6b6b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.stroke();

      // Fork label
      ctx.fillStyle = '#fff';
      ctx.font = '9px IBM Plex Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`F${i + 1}`, fx, fy);
    });

    // Draw philosophers
    s.philosophers.forEach((p, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      const px = cx + R * Math.cos(angle);
      const py = cy + R * Math.sin(angle);
      const color = stateColors[p.state];

      // Glow for eating
      if (p.state === 'eating') {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
      }

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color + '33';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px IBM Plex Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.name, px, py - 4);
      ctx.font = '9px IBM Plex Mono';
      ctx.fillStyle = color;
      ctx.fillText(p.state, px, py + 7);

      // Eats counter
      ctx.font = '9px IBM Plex Mono';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`×${p.totalEats}`, px, py + 20);
    });

    // Deadlock warning
    if (s.deadlockDetected) {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 14px IBM Plex Mono';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ DEADLOCK DETECTED', cx, H - 20);
    }

    // Log
    const logEl = document.getElementById('dpLog');
    if (logEl) logEl.innerHTML = s.log.slice(0, 15).map(l =>
      `<div class="log-entry"><span class="log-tick">T${l.tick}</span><span class="log-msg">${l.msg}</span></div>`
    ).join('');
  },

  // ─── MANUAL SEM/MON CONTROLS ─────────────────────────────────────────────

  _manualSem: null,

  manualSemWait() {
    if (!this._manualSem) this._manualSem = new Semaphore(2, 'manual');
    const tid = parseInt(document.getElementById('semThreadId')?.value) || 1;
    this._manualSem.wait(tid);
    this.renderManualSem();
  },

  manualSemSignal() {
    if (!this._manualSem) return;
    const tid = parseInt(document.getElementById('semThreadId')?.value) || 1;
    this._manualSem.signal(tid);
    this.renderManualSem();
  },

  renderManualSem() {
    if (!this._manualSem) return;
    this.renderSemState('manualSemDisplay', this._manualSem.getState());
    const histEl = document.getElementById('semHistory');
    if (histEl) {
      histEl.innerHTML = this._manualSem.history.slice(-8).reverse().map(h =>
        `<div class="log-entry"><span class="log-tick">T${h.tick}</span><span class="log-msg">Thread T${h.threadId} ${h.action} (val=${h.value})</span></div>`
      ).join('');
    }
  },

  _manualMon: null,

  manualMonEnter() {
    if (!this._manualMon) {
      this._manualMon = new Monitor('manual');
      this._manualMon.addCondition('notEmpty');
    }
    const tid = parseInt(document.getElementById('monThreadId')?.value) || 1;
    this._manualMon.enter(tid);
    this.renderManualMon();
  },

  manualMonExit() {
    if (!this._manualMon) return;
    const tid = parseInt(document.getElementById('monThreadId')?.value) || 1;
    this._manualMon.exit(tid);
    this.renderManualMon();
  },

  renderManualMon() {
    if (!this._manualMon) return;
    const s = this._manualMon.getState();
    const el = document.getElementById('manualMonDisplay');
    if (!el) return;
    el.innerHTML = `
      <div class="mon-state">
        <div>Lock held by: <strong>${s.lock !== null ? 'T' + s.lock : 'free'}</strong></div>
        <div>Entry queue: ${s.entryQueue.length ? 'T' + s.entryQueue.join(', T') : 'empty'}</div>
      </div>
      <div class="mon-hist">${s.history.slice(-5).reverse().map(h =>
        `<div class="log-entry"><span class="log-tick">T${h.tick}</span><span class="log-msg">T${h.threadId} ${h.action}</span></div>`
      ).join('')}</div>`;
  },

  // ─── TAB SWITCHING ────────────────────────────────────────────────────────

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    if (tab === 'main') {
      Viz.initCharts();
      Viz.update(SimEngine.getSnapshot());
    }
  },

  toggleTheme() {
    this.darkMode = !this.darkMode;
    document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
    document.getElementById('themeToggle').textContent = this.darkMode ? '☀ Light' : '🌙 Dark';
    Viz.initCharts();
    Viz.update(SimEngine.getSnapshot());
  },

  log(msg) {
    const el = document.getElementById('uiLog');
    if (el) {
      el.innerHTML = `<div class="log-entry highlight"><span class="log-msg">${msg}</span></div>` + el.innerHTML;
    }
  }
};

window.UIController = UIController;
