/**
 * synchronization.js
 * Implements Semaphores, Monitors, Producer-Consumer, and Dining Philosophers.
 * These run as overlay scenarios on top of the simulation engine.
 */

// ─── SEMAPHORE ───────────────────────────────────────────────────────────────

class Semaphore {
  /**
   * @param {number} initialValue  - Binary (0/1) or counting semaphore value
   * @param {string} name
   */
  constructor(initialValue = 1, name = 'sem') {
    this.value = initialValue;
    this.name = name;
    this.waitQueue = []; // thread ids waiting
    this.history = [];   // { tick, action, threadId }
    this.maxValue = initialValue;
  }

  /**
   * wait() / P() operation - acquire semaphore
   * Returns true if acquired, false if thread must block
   */
  wait(threadId) {
    if (this.value >0) {
      this.value--;
      const entry = { tick: SimEngine.tick, action: 'acquired', threadId, value: this.value };
      this.history.push(entry);
      SimEngine.log(`[SEM] Thread T${threadId} acquired semaphore "${this.name}" (value=${this.value})`);
      return true;
    } else {
      if (!this.waitQueue.includes(threadId)) {
        this.waitQueue.push(threadId);
      }
      const entry = { tick: SimEngine.tick, action: 'blocked', threadId, value: this.value };
      this.history.push(entry);
      SimEngine.log(`[SEM] Thread T${threadId} blocked on semaphore "${this.name}" (value=${this.value})`);
      return false;
    }
  }

  /**
   * signal() / V() operation - release semaphore
   */
  signal(threadId) {
    if (this.waitQueue.length > 0) {
      const unblocked = this.waitQueue.shift();
      const entry = { tick: SimEngine.tick, action: 'signaled', threadId, unblocked, value: this.value };
      this.history.push(entry);
      SimEngine.log(`[SEM] Thread T${threadId} signaled "${this.name}" → T${unblocked} unblocked`);
      return unblocked;
    } else {
      this.value = Math.min(this.value + 1, this.maxValue);
      const entry = { tick: SimEngine.tick, action: 'released', threadId, value: this.value };
      this.history.push(entry);
      SimEngine.log(`[SEM] Thread T${threadId} released semaphore "${this.name}" (value=${this.value})`);
      return null;
    }
  }

  getState() {
    return {
      name: this.name,
      value: this.value,
      maxValue: this.maxValue,
      waitQueue: [...this.waitQueue],
      history: this.history.slice(-10)
    };
  }
}

// ─── MONITOR ─────────────────────────────────────────────────────────────────

class ConditionVariable {
  constructor(name) {
    this.name = name;
    this.waitQueue = []; // thread ids
  }

  wait(threadId, monitor) {
    monitor.unlock(threadId);
    this.waitQueue.push(threadId);
    SimEngine.log(`[MON] Thread T${threadId} waiting on condition "${this.name}"`);
  }

  signal(threadId) {
    if (this.waitQueue.length > 0) {
      const woken = this.waitQueue.shift();
      SimEngine.log(`[MON] Condition "${this.name}" signaled → T${woken} woken`);
      return woken;
    }
    return null;
  }

  signalAll() {
    const woken = [...this.waitQueue];
    this.waitQueue = [];
    return woken;
  }
}

class Monitor {
  constructor(name) {
    this.name = name;
    this.lock = null; // thread id holding lock, null if free
    this.entryQueue = []; // threads waiting to enter monitor
    this.conditions = {};
    this.history = [];
  }

  addCondition(name) {
    this.conditions[name] = new ConditionVariable(name);
    return this.conditions[name];
  }

  enter(threadId) {
    if (this.lock === null) {
      this.lock = threadId;
      this.history.push({ tick: SimEngine.tick, action: 'entered', threadId });
      SimEngine.log(`[MON] Thread T${threadId} entered monitor "${this.name}"`);
      return true;
    } else {
      this.entryQueue.push(threadId);
      this.history.push({ tick: SimEngine.tick, action: 'queued', threadId });
      SimEngine.log(`[MON] Thread T${threadId} waiting to enter monitor "${this.name}"`);
      return false;
    }
  }

  exit(threadId) {
    if (this.lock !== threadId) return;
    this.lock = null;
    this.history.push({ tick: SimEngine.tick, action: 'exited', threadId });
    SimEngine.log(`[MON] Thread T${threadId} exited monitor "${this.name}"`);

    // Let next thread in entry queue enter
    if (this.entryQueue.length > 0) {
      const next = this.entryQueue.shift();
      this.lock = next;
      SimEngine.log(`[MON] Thread T${next} now entered monitor "${this.name}"`);
      return next;
    }
    return null;
  }

  unlock(threadId) {
    if (this.lock === threadId) {
      this.lock = null;
    }
  }

  getState() {
    return {
      name: this.name,
      lock: this.lock,
      entryQueue: [...this.entryQueue],
      conditions: Object.fromEntries(
        Object.entries(this.conditions).map(([k, v]) => [k, { waitQueue: [...v.waitQueue] }])
      ),
      history: this.history.slice(-10)
    };
  }
}

// ─── PRODUCER-CONSUMER SCENARIO ──────────────────────────────────────────────

class ProducerConsumerScenario {
  constructor(bufferSize = 5) {
    this.bufferSize = bufferSize;
    this.buffer = [];
    this.mutex = new Semaphore(1, 'mutex');
    this.empty = new Semaphore(bufferSize, 'empty');
    this.full = new Semaphore(0, 'full');
    this.full.maxValue = bufferSize;

    this.producers = [];
    this.consumers = [];
    this.tickInterval = null;
    this.tick = 0;
    this.log = [];
  }

  addProducer(threadId) {
    this.producers.push({ id: threadId, state: 'idle', item: null });
  }

  addConsumer(threadId) {
    this.consumers.push({ id: threadId, state: 'idle', item: null });
  }

  stepProducers() {
    for (const p of this.producers) {
      if (p.state === 'idle' && Math.random() < 0.4) {
        // Try to produce
        if (this.empty.wait(p.id)) {
          if (this.mutex.wait(p.id)) {
            const item = Math.floor(Math.random() * 100);
            this.buffer.push(item);
            p.item = item;
            p.state = 'produced';
            this.addLog(`Producer T${p.id} produced item ${item} [buffer: ${this.buffer.length}/${this.bufferSize}]`);
            this.mutex.signal(p.id);
            this.full.signal(p.id);
          }
        } else {
          p.state = 'waiting-empty';
        }
      } else if (p.state !== 'idle') {
        p.state = 'idle';
      }
    }
  }

  stepConsumers() {
    for (const c of this.consumers) {
      if (c.state === 'idle' && Math.random() < 0.4) {
        if (this.full.wait(c.id)) {
          if (this.mutex.wait(c.id)) {
            const item = this.buffer.shift();
            c.item = item;
            c.state = 'consumed';
            this.addLog(`Consumer T${c.id} consumed item ${item} [buffer: ${this.buffer.length}/${this.bufferSize}]`);
            this.mutex.signal(c.id);
            this.empty.signal(c.id);
          }
        } else {
          c.state = 'waiting-full';
        }
      } else if (c.state !== 'idle') {
        c.state = 'idle';
      }
    }
  }

  addLog(msg) {
    this.log.unshift({ tick: this.tick, msg });
    if (this.log.length > 50) this.log.pop();
  }

  step() {
    this.tick++;
    this.stepProducers();
    this.stepConsumers();
  }

  getState() {
    return {
      tick: this.tick,
      buffer: [...this.buffer],
      bufferSize: this.bufferSize,
      producers: this.producers.map(p => ({ ...p })),
      consumers: this.consumers.map(c => ({ ...c })),
      mutex: this.mutex.getState(),
      empty: this.empty.getState(),
      full: this.full.getState(),
      log: this.log.slice(0, 20)
    };
  }
}

// ─── DINING PHILOSOPHERS SCENARIO ────────────────────────────────────────────

const PhilosopherState = { THINKING: 'thinking', HUNGRY: 'hungry', EATING: 'eating' };

class DiningPhilosophersScenario {
  constructor(n = 5) {
    this.n = n;
    this.philosophers = Array.from({ length: n }, (_, i) => ({
      id: i,
      name: `P${i + 1}`,
      state: PhilosopherState.THINKING,
      thinkTimer: Math.floor(Math.random() * 4) + 2,
      eatTimer: 0,
      totalEats: 0
    }));
    // Forks = semaphores
    this.forks = Array.from({ length: n }, (_, i) => new Semaphore(1, `fork${i + 1}`));
    this.tick = 0;
    this.log = [];
    this.deadlockDetected = false;
  }

  step() {
    this.tick++;
    this.deadlockDetected = false;

    for (const p of this.philosophers) {
      const left = p.id;
      const right = (p.id + 1) % this.n;

      if (p.state === PhilosopherState.THINKING) {
        p.thinkTimer--;
        if (p.thinkTimer <= 0) {
          p.state = PhilosopherState.HUNGRY;
          this.addLog(`${p.name} is hungry`);
        }
      } else if (p.state === PhilosopherState.HUNGRY) {
        // Asymmetric fork picking to avoid deadlock (last philosopher picks right first)
        const firstFork = p.id === this.n - 1 ? right : left;
        const secondFork = p.id === this.n - 1 ? left : right;

        if (this.forks[firstFork].value > 0 && this.forks[secondFork].value > 0) {
          this.forks[firstFork].wait(p.id);
          this.forks[secondFork].wait(p.id);
          p.state = PhilosopherState.EATING;
          p.eatTimer = Math.floor(Math.random() * 3) + 2;
          this.addLog(`${p.name} starts eating (forks ${firstFork + 1} & ${secondFork + 1})`);
        }
      } else if (p.state === PhilosopherState.EATING) {
        p.eatTimer--;
        if (p.eatTimer <= 0) {
          const firstFork = p.id === this.n - 1 ? right : left;
          const secondFork = p.id === this.n - 1 ? left : right;
          this.forks[firstFork].signal(p.id);
          this.forks[secondFork].signal(p.id);
          p.state = PhilosopherState.THINKING;
          p.thinkTimer = Math.floor(Math.random() * 4) + 2;
          p.totalEats++;
          this.addLog(`${p.name} finished eating (total: ${p.totalEats})`);
        }
      }
    }

    // Simple deadlock detection: all hungry, no one eating
    const allHungry = this.philosophers.every(p => p.state === PhilosopherState.HUNGRY);
    if (allHungry) {
      this.deadlockDetected = true;
      this.addLog('⚠️ DEADLOCK DETECTED! All philosophers hungry, no forks available.');
    }
  }

  addLog(msg) {
    this.log.unshift({ tick: this.tick, msg });
    if (this.log.length > 50) this.log.pop();
  }

  getState() {
    return {
      tick: this.tick,
      philosophers: this.philosophers.map(p => ({ ...p })),
      forks: this.forks.map(f => ({ name: f.name, value: f.value, waitQueue: [...f.waitQueue] })),
      log: this.log.slice(0, 20),
      deadlockDetected: this.deadlockDetected
    };
  }
}

window.Semaphore = Semaphore;
window.Monitor = Monitor;
window.ProducerConsumerScenario = ProducerConsumerScenario;
window.DiningPhilosophersScenario = DiningPhilosophersScenario;
window.PhilosopherState = PhilosopherState;
