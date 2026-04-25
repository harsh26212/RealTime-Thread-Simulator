/**
 * simulationEngine.js
 * Core simulation engine managing threads, kernel threads, and CPU execution.
 * Implements Many-to-One, One-to-One, and Many-to-Many threading models.
 */

const ThreadState = {
  NEW: 'new',
  READY: 'ready',
  RUNNING: 'running',
  WAITING: 'waiting',
  BLOCKED: 'blocked',
  TERMINATED: 'terminated'
};

const ThreadModel = {
  MANY_TO_ONE: 'many-to-one',
  ONE_TO_ONE: 'one-to-one',
  MANY_TO_MANY: 'many-to-many'
};

let threadIdCounter = 1;
let kernelThreadIdCounter = 1;

class UserThread {
  constructor(name, priority = 1, burstTime = null) {
    this.id = threadIdCounter++;
    this.name = name || `T${this.id}`;
    this.state = ThreadState.NEW;
    this.priority = priority;
    this.burstTime = burstTime || Math.floor(Math.random() * 6) + 2; // 2-7 ticks
    this.remainingTime = this.burstTime;
    this.waitTime = 0;
    this.kernelThreadId = null; // assigned kernel thread
    this.createdAt = Date.now();
    this.startedAt = null;
    this.finishedAt = null;
    this.color = this.generateColor();
    this.history = []; // state history for timeline
    this.ioWaitRemaining = 0;
  }

  generateColor() {
    const colors = [
      '#00d4ff', '#ff6b6b', '#ffd166', '#06d6a0',
      '#a855f7', '#f97316', '#ec4899', '#14b8a6',
      '#84cc16', '#f59e0b', '#6366f1', '#10b981'
    ];
    return colors[(this.id - 1) % colors.length];
  }

  transitionTo(newState, reason = '') {
    const prev = this.state;
    this.state = newState;
    this.history.push({ tick: SimEngine.tick, from: prev, to: newState, reason });
    if (newState === ThreadState.RUNNING && !this.startedAt) {
      this.startedAt = SimEngine.tick;
    }
    if (newState === ThreadState.TERMINATED) {
      this.finishedAt = SimEngine.tick;
    }
    SimEngine.log(`Thread ${this.name} → ${newState.toUpperCase()}${reason ? ' (' + reason + ')' : ''}`);
    return this;
  }
}

class KernelThread {
  constructor() {
    this.id = kernelThreadIdCounter++;
    this.name = `KT${this.id}`;
    this.assignedUserThreads = []; // Many-to-Many: multiple user threads can be bound
    this.activeUserThread = null;
    this.isBusy = false;
    this.cpuId = null;
  }
}

class CPU {
  constructor(id) {
    this.id = id;
    this.name = `CPU${id}`;
    this.runningKernelThread = null;
    this.runningUserThread = null;
    this.utilization = 0; // 0-100
    this.totalBusyTicks = 0;
  }
}

/**
 * Core Simulation Engine (singleton)
 */
const SimEngine = {
  tick: 0,
  running: false,
  paused: false,
  speed: 500, // ms per tick
  intervalId: null,

  model: ThreadModel.ONE_TO_ONE,
  schedulingAlg: 'round-robin',
  timeQuantum: 3,
  quantumCounter: 0,

  userThreads: [],
  kernelThreads: [],
  cpus: [],
  numCPUs: 1,

  readyQueue: [],
  waitingQueue: [],
  logs: [],
  ganttData: [], // { tick, threadId, threadName, color, cpuId }
  cpuUtilHistory: [], // per-tick utilization %
  waitTimeHistory: [],

  // Callbacks for UI
  onTick: null,
  onLog: null,
  onStateChange: null,

  init(config = {}) {
    this.tick = 0;
    this.running = false;
    this.paused = false;
    threadIdCounter = 1;
    kernelThreadIdCounter = 1;

    this.model = config.model || ThreadModel.ONE_TO_ONE;
    this.schedulingAlg = config.schedulingAlg || 'round-robin';
    this.timeQuantum = config.timeQuantum || 3;
    this.numCPUs = config.numCPUs || 1;
    this.speed = config.speed || 500;
    this.quantumCounter = 0;

    this.userThreads = [];
    this.kernelThreads = [];
    this.cpus = [];
    this.readyQueue = [];
    this.waitingQueue = [];
    this.logs = [];
    this.ganttData = [];
    this.cpuUtilHistory = [];
    this.waitTimeHistory = [];

    // Create CPUs
    for (let i = 1; i <= this.numCPUs; i++) {
      this.cpus.push(new CPU(i));
    }

    // Create initial kernel threads based on model
    this.setupKernelThreads(config.initialThreadCount || 3);
  },

  setupKernelThreads(userCount) {
    this.kernelThreads = [];
    kernelThreadIdCounter = 1;

    if (this.model === ThreadModel.MANY_TO_ONE) {
      // Single kernel thread for all user threads
      this.kernelThreads.push(new KernelThread());
    } else if (this.model === ThreadModel.ONE_TO_ONE) {
      // One kernel thread per user thread
      for (let i = 0; i < userCount; i++) {
        this.kernelThreads.push(new KernelThread());
      }
    } else if (this.model === ThreadModel.MANY_TO_MANY) {
      // Fewer kernel threads than user threads (pool)
      const ktCount = Math.max(2, Math.ceil(userCount / 2));
      for (let i = 0; i < ktCount; i++) {
        this.kernelThreads.push(new KernelThread());
      }
    }
  },

  addThread(name, priority, burstTime) {
    const t = new UserThread(name, priority, burstTime);

    if (this.model === ThreadModel.ONE_TO_ONE) {
      // Create a new kernel thread for this user thread
      const kt = new KernelThread();
      kt.assignedUserThreads.push(t);
      t.kernelThreadId = kt.id;
      this.kernelThreads.push(kt);
    } else if (this.model === ThreadModel.MANY_TO_ONE) {
      // Assign to the single kernel thread
      const kt = this.kernelThreads[0];
      kt.assignedUserThreads.push(t);
      t.kernelThreadId = kt.id;
    } else {
      // Many-to-Many: assign to least loaded kernel thread
      const kt = this.leastLoadedKernelThread();
      kt.assignedUserThreads.push(t);
      t.kernelThreadId = kt.id;
    }

    t.transitionTo(ThreadState.READY, 'created');
    this.userThreads.push(t);
    this.readyQueue.push(t);

    if (this.schedulingAlg === 'priority') {
      this.readyQueue.sort((a, b) => b.priority - a.priority);
    }

    this.log(`Thread ${t.name} created [Burst: ${t.burstTime} ticks, Priority: ${t.priority}]`);
    return t;
  },

  leastLoadedKernelThread() {
    return this.kernelThreads.reduce((min, kt) =>
      kt.assignedUserThreads.length < min.assignedUserThreads.length ? kt : min,
      this.kernelThreads[0]
    );
  },

  removeThread(threadId) {
    const t = this.userThreads.find(t => t.id === threadId);
    if (!t || t.state === ThreadState.RUNNING) return;
    t.transitionTo(ThreadState.TERMINATED, 'manually removed');
    this.readyQueue = this.readyQueue.filter(x => x.id !== threadId);
    this.waitingQueue = this.waitingQueue.filter(x => x.id !== threadId);
  },

  step() {
    this.tick++;
    this.quantumCounter++;

    // Process waiting threads (I/O completion simulation)
    this.processWaiting();

    // Schedule threads onto CPUs
    this.schedule();

    // Execute running threads
    this.execute();

    // Collect stats
    this.collectStats();

    // Callback
    if (this.onTick) this.onTick(this.getSnapshot());
  },

  processWaiting() {
    const nowReady = [];
    this.waitingQueue = this.waitingQueue.filter(t => {
      t.ioWaitRemaining--;
      if (t.ioWaitRemaining <= 0) {
        t.transitionTo(ThreadState.READY, 'I/O complete');
        this.readyQueue.push(t);
        if (this.schedulingAlg === 'priority') {
          this.readyQueue.sort((a, b) => b.priority - a.priority);
        }
        return false;
      }
      return true;
    });
  },

  schedule() {
    for (const cpu of this.cpus) {
      if (cpu.runningUserThread) {
        const t = cpu.runningUserThread;

        // Round-robin preemption
        if (this.schedulingAlg === 'round-robin' && this.quantumCounter >= this.timeQuantum) {
          if (this.readyQueue.length > 0) {
            t.transitionTo(ThreadState.READY, 'quantum expired');
            this.readyQueue.push(t);
            cpu.runningUserThread = null;
            cpu.runningKernelThread = null;
          }
        }
      }

      // Assign next from ready queue if CPU is free
      if (!cpu.runningUserThread && this.readyQueue.length > 0) {
        let next;
        if (this.schedulingAlg === 'priority') {
          this.readyQueue.sort((a, b) => b.priority - a.priority);
          next = this.readyQueue.shift();
        } else if (this.schedulingAlg === 'fcfs') {
          next = this.readyQueue.shift(); // already ordered by creation
        } else {
          // round-robin
          next = this.readyQueue.shift();
        }

        // For Many-to-One: check if kernel thread is free
        if (this.model === ThreadModel.MANY_TO_ONE) {
          const kt = this.kernelThreads[0];
          if (kt.isBusy) {
            // Put back and skip
            this.readyQueue.unshift(next);
            continue;
          }
          kt.isBusy = true;
          kt.activeUserThread = next;
          next.kernelThreadId = kt.id;
        }

        next.transitionTo(ThreadState.RUNNING, 'scheduled');
        cpu.runningUserThread = next;
        cpu.runningKernelThread = this.kernelThreads.find(kt => kt.id === next.kernelThreadId);
        this.quantumCounter = 0;
      }
    }
  },

  execute() {
    for (const cpu of this.cpus) {
      const t = cpu.runningUserThread;
      if (!t) continue;

      t.remainingTime--;

      // Record Gantt
      this.ganttData.push({
        tick: this.tick,
        threadId: t.id,
        threadName: t.name,
        color: t.color,
        cpuId: cpu.id
      });

      cpu.totalBusyTicks++;

      // Random I/O wait (10% chance)
      if (Math.random() < 0.10 && t.remainingTime > 1) {
        t.ioWaitRemaining = Math.floor(Math.random() * 3) + 1;
        t.transitionTo(ThreadState.WAITING, 'I/O request');
        this.waitingQueue.push(t);
        if (this.model === ThreadModel.MANY_TO_ONE) {
          this.kernelThreads[0].isBusy = false;
          this.kernelThreads[0].activeUserThread = null;
        }
        cpu.runningUserThread = null;
        cpu.runningKernelThread = null;
        continue;
      }

      if (t.remainingTime <= 0) {
        t.transitionTo(ThreadState.TERMINATED, 'execution complete');
        if (this.model === ThreadModel.MANY_TO_ONE) {
          this.kernelThreads[0].isBusy = false;
          this.kernelThreads[0].activeUserThread = null;
        }
        cpu.runningUserThread = null;
        cpu.runningKernelThread = null;
      }
    }

    // Increment wait time for ready threads
    for (const t of this.readyQueue) {
      t.waitTime++;
    }
  },

  collectStats() {
    const totalCPUTicks = this.cpus.reduce((s, c) => s + c.totalBusyTicks, 0);
    const maxPossible = this.cpus.length * this.tick;
    const util = maxPossible > 0 ? Math.round((totalCPUTicks / maxPossible) * 100) : 0;
    this.cpuUtilHistory.push({ tick: this.tick, util });

    const avgWait = this.userThreads.length > 0
      ? Math.round(this.userThreads.reduce((s, t) => s + t.waitTime, 0) / this.userThreads.length)
      : 0;
    this.waitTimeHistory.push({ tick: this.tick, avgWait });
  },

  getSnapshot() {
    return {
      tick: this.tick,
      model: this.model,
      schedulingAlg: this.schedulingAlg,
      userThreads: this.userThreads.map(t => ({ ...t })),
      kernelThreads: this.kernelThreads.map(kt => ({ ...kt })),
      cpus: this.cpus.map(c => ({ ...c })),
      readyQueue: this.readyQueue.map(t => t.id),
      waitingQueue: this.waitingQueue.map(t => t.id),
      ganttData: [...this.ganttData].slice(-100), // last 100 entries
      cpuUtilHistory: [...this.cpuUtilHistory].slice(-50),
      waitTimeHistory: [...this.waitTimeHistory].slice(-50),
      logs: [...this.logs].slice(-50),
      activeCount: this.userThreads.filter(t => t.state !== ThreadState.TERMINATED).length,
      terminatedCount: this.userThreads.filter(t => t.state === ThreadState.TERMINATED).length,
      throughput: this.tick > 0
        ? (this.userThreads.filter(t => t.state === ThreadState.TERMINATED).length / this.tick).toFixed(2)
        : 0
    };
  },

  log(msg) {
    const entry = { tick: this.tick, msg, time: new Date().toLocaleTimeString() };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();
    if (this.onLog) this.onLog(entry);
  },

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.intervalId = setInterval(() => {
      if (!this.paused) this.step();
    }, this.speed);
    this.log('Simulation started');
  },

  pause() {
    this.paused = !this.paused;
    this.log(this.paused ? 'Simulation paused' : 'Simulation resumed');
  },

  stop() {
    this.running = false;
    this.paused = false;
    clearInterval(this.intervalId);
    this.log('Simulation stopped');
  },

  stepOnce() {
    if (!this.running) this.running = true;
    this.paused = true;
    this.step();
  },

  setSpeed(ms) {
    this.speed = ms;
    if (this.running && !this.paused) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        if (!this.paused) this.step();
      }, this.speed);
    }
  },

  reset() {
    this.stop();
    this.init({
      model: this.model,
      schedulingAlg: this.schedulingAlg,
      timeQuantum: this.timeQuantum,
      numCPUs: this.numCPUs,
      speed: this.speed
    });
    this.log('Simulation reset');
    if (this.onTick) this.onTick(this.getSnapshot());
  }
};

window.SimEngine = SimEngine;
window.ThreadState = ThreadState;
window.ThreadModel = ThreadModel;
