(() => {
  const canvas = document.getElementById('arcadeCanvas');
  const ctx = canvas.getContext('2d');
  const domGame = document.getElementById('domGame');
  const gameListEl = document.getElementById('gameList');
  const gameTitleEl = document.getElementById('gameTitle');
  const gameSubtitleEl = document.getElementById('gameSubtitle');
  const controlHintEl = document.getElementById('controlHint');
  const scoreboardEl = document.getElementById('scoreboard');
  const eventsEl = document.getElementById('events');
  const recommendationsEl = document.getElementById('recommendations');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const installBtn = document.getElementById('installBtn');

  const SCORE_KEY = 'arcade-nexus-best-scores';
  const PLAY_KEY = 'arcade-nexus-play-stats';

  const state = {
    selectedId: 'snake',
    current: null,
    running: false,
    paused: false,
    lastTs: performance.now(),
    events: [],
    bestScores: loadJson(SCORE_KEY, {}),
    playStats: loadJson(PLAY_KEY, {}),
    flags: {},
    pointer: { x: 0, y: 0 },
    shared: {
      currentScore: 0,
      sessionScore: 0,
      attempts: 0,
      progressText: 'Ready.',
      extra: []
    }
  };

  const catalog = [
    {
      id: 'snake',
      name: 'Neon Snake Arena',
      tag: 'Arcade',
      summary: 'Classic snake with smooth speed ramp, best-score saving, and wraparound movement.',
      controls: 'Move with Arrow keys or WASD. Eat cores, avoid yourself, and keep growing.',
      mode: 'canvas',
      recommend: ['Meteor Dodge X', 'Target Tap Blitz']
    },
    {
      id: 'dodge',
      name: 'Meteor Dodge X',
      tag: 'Action',
      summary: 'Survive an endless meteor rain. The longer you last, the faster it gets.',
      controls: 'Move with Arrow keys or WASD. Avoid meteors and survive as long as possible.',
      mode: 'canvas',
      recommend: ['Neon Snake Arena', 'Code Breaker Vault']
    },
    {
      id: 'tap',
      name: 'Target Tap Blitz',
      tag: 'Reflex',
      summary: 'Hit moving targets on the canvas before the timer runs out.',
      controls: 'Click or tap targets quickly. Each hit scores points. Misses reduce your combo.',
      mode: 'canvas',
      recommend: ['Memory Flip Plus', 'Meteor Dodge X']
    },
    {
      id: 'memory',
      name: 'Memory Flip Plus',
      tag: 'Puzzle',
      summary: 'Flip cards, memorize symbols, and clear the grid in as few moves as possible.',
      controls: 'Click cards to reveal them and match all pairs.',
      mode: 'dom',
      recommend: ['Code Breaker Vault', 'Target Tap Blitz']
    },
    {
      id: 'code',
      name: 'Code Breaker Vault',
      tag: 'Logic',
      summary: 'Crack a hidden 4-digit code with exact and misplaced hints after each guess.',
      controls: 'Enter four unique digits, submit, and use the clues to solve the vault.',
      mode: 'dom',
      recommend: ['Memory Flip Plus', 'Neon Snake Arena']
    }
  ];

  const games = {
    snake: createSnakeGame(),
    dodge: createDodgeGame(),
    tap: createTapGame(),
    memory: createMemoryGame(),
    code: createCodeGame()
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function postTelemetry(name, properties) {
    fetch('/api/v1/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, properties })
    }).catch(() => {});
  }

  async function loadFlags() {
    try {
      const res = await fetch('/api/v1/feature-flags');
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      for (const flag of list) state.flags[flag.key] = !!flag.enabled;
    } catch (_) {}
  }

  function logEvent(message) {
    state.events.unshift({ at: new Date().toLocaleTimeString(), message });
    state.events = state.events.slice(0, 18);
    renderEvents();
  }

  function renderEvents() {
    eventsEl.innerHTML = state.events.map(item => `
      <div class="log-item">
        <strong>${escapeHtml(item.message)}</strong>
        <div class="muted">${escapeHtml(item.at)}</div>
      </div>
    `).join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentCatalog() {
    return catalog.find(item => item.id === state.selectedId) || catalog[0];
  }

  function updateRecommendations() {
    const selected = currentCatalog();
    const smart = state.flags.smartRecommendations !== false;
    const suggested = smart ? selected.recommend : catalog.filter(item => item.id !== selected.id).slice(0, 2).map(item => item.name);
    recommendationsEl.innerHTML = [
      `<div class="list-card"><strong>${escapeHtml(selected.tag)} mode</strong><div class="muted">${escapeHtml(selected.summary)}</div></div>`,
      ...suggested.map(name => `<div class="list-card"><strong>Try next</strong><div class="muted">${escapeHtml(name)}</div></div>`),
      state.flags.dailyChallenges !== false
        ? `<div class="list-card"><strong>Daily challenge</strong><div class="muted">Beat your best score in ${escapeHtml(selected.name)}.</div></div>`
        : `<div class="list-card"><strong>Quick play</strong><div class="muted">Jump into any game with one click.</div></div>`
    ].join('');
  }

  function renderCatalog() {
    gameListEl.innerHTML = catalog.map(item => `
      <button class="game-nav-btn ${item.id === state.selectedId ? 'active' : ''}" data-game-id="${item.id}">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.tag)} · ${escapeHtml(item.summary)}</span>
      </button>
    `).join('');

    gameListEl.querySelectorAll('[data-game-id]').forEach(btn => {
      btn.addEventListener('click', () => selectGame(btn.dataset.gameId));
    });
  }

  function renderScoreboard() {
    const selected = currentCatalog();
    const best = Number(state.bestScores[selected.id] || 0);
    const plays = Number(state.playStats[selected.id] || 0);
    const data = state.shared;
    scoreboardEl.innerHTML = `
      <div class="score-box">
        <div class="stat-chip"><div class="muted">Current score</div><strong>${Math.max(0, Math.round(data.currentScore || 0))}</strong></div>
        <div class="stat-chip"><div class="muted">Best score</div><strong>${Math.max(0, Math.round(best))}</strong></div>
        <div class="stat-chip"><div class="muted">Runs played</div><strong>${plays}</strong></div>
        <div class="stat-chip"><div class="muted">Attempts / moves</div><strong>${Math.max(0, Math.round(data.attempts || 0))}</strong></div>
      </div>
      <div class="log-item" style="margin-top:10px;">
        <strong>Status</strong>
        <div class="muted">${escapeHtml(data.progressText || 'Ready.')}</div>
      </div>
      ${(data.extra || []).map(row => `<div class="log-item"><strong>${escapeHtml(row.label)}</strong><div class="muted">${escapeHtml(row.value)}</div></div>`).join('')}
    `;
  }

  function updateMetaText() {
    const selected = currentCatalog();
    gameTitleEl.textContent = selected.name;
    gameSubtitleEl.textContent = `${selected.tag} · ${selected.summary}`;
    controlHintEl.textContent = selected.controls;
    updateRecommendations();
    renderScoreboard();
    renderCatalog();
  }

  function markPlayed(gameId) {
    state.playStats[gameId] = Number(state.playStats[gameId] || 0) + 1;
    saveJson(PLAY_KEY, state.playStats);
  }

  function recordScore(score, note) {
    const selected = state.selectedId;
    state.shared.currentScore = score;
    const best = Number(state.bestScores[selected] || 0);
    if (score > best) {
      state.bestScores[selected] = score;
      saveJson(SCORE_KEY, state.bestScores);
      logEvent(`New best score in ${currentCatalog().name}: ${Math.round(score)}`);
      postTelemetry('best_score', { gameId: selected, score: Math.round(score) });
    }
    if (note) logEvent(note);
    renderScoreboard();
  }

  function resetShared() {
    state.shared.currentScore = 0;
    state.shared.sessionScore = 0;
    state.shared.attempts = 0;
    state.shared.progressText = 'Ready.';
    state.shared.extra = [];
  }

  function selectGame(gameId) {
    if (!games[gameId]) return;
    if (state.current && state.current.destroy) state.current.destroy();
    state.selectedId = gameId;
    state.current = games[gameId];
    state.running = false;
    state.paused = false;
    pauseBtn.textContent = 'Pause';
    resetShared();
    state.current.init();
    updateMetaText();
    logEvent(`Selected ${currentCatalog().name}.`);
    postTelemetry('game_selected', { gameId });
  }

  function startCurrent() {
    if (!state.current) return;
    resetShared();
    state.running = true;
    state.paused = false;
    pauseBtn.textContent = 'Pause';
    markPlayed(state.selectedId);
    state.current.start();
    updateMetaText();
    logEvent(`Started ${currentCatalog().name}.`);
    postTelemetry('game_started', { gameId: state.selectedId });
  }

  function resetCurrent() {
    if (!state.current) return;
    resetShared();
    state.running = false;
    state.paused = false;
    state.current.reset();
    updateMetaText();
    logEvent(`Reset ${currentCatalog().name}.`);
    postTelemetry('game_reset', { gameId: state.selectedId });
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    state.shared.progressText = state.paused ? 'Paused.' : 'Running.';
    renderScoreboard();
  }

  function endRun(score, message) {
    state.running = false;
    state.paused = false;
    pauseBtn.textContent = 'Pause';
    recordScore(score, message);
    postTelemetry('game_finished', { gameId: state.selectedId, score: Math.round(score) });
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function switchMode(mode) {
    if (mode === 'dom') {
      canvas.classList.add('hidden');
      domGame.classList.remove('hidden');
      clearCanvas();
    } else {
      domGame.classList.add('hidden');
      canvas.classList.remove('hidden');
      domGame.innerHTML = '';
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    if (state.current) {
      if (state.current.mode === 'canvas') {
        if (state.running && !state.paused) state.current.update(dt);
        state.current.draw();
      } else if (state.current.draw) {
        state.current.draw();
      }
    }
    requestAnimationFrame(loop);
  }

  function createSnakeGame() {
    const cell = 30;
    const cols = 20;
    const rows = 12;
    const board = { x: 180, y: 90, w: cols * cell, h: rows * cell };
    const game = {
      mode: 'canvas',
      snake: [],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      food: { x: 8, y: 5 },
      timer: 0,
      step: 0.18,
      init() {
        switchMode('canvas');
        this.reset();
      },
      start() {
        this.reset();
        state.shared.progressText = 'Collect cores and keep the chain alive.';
      },
      reset() {
        this.snake = [
          { x: 10, y: 6 },
          { x: 9, y: 6 },
          { x: 8, y: 6 }
        ];
        this.dir = { x: 1, y: 0 };
        this.nextDir = { x: 1, y: 0 };
        this.timer = 0;
        this.step = 0.18;
        this.food = this.randomFreeCell();
        state.shared.currentScore = 0;
        state.shared.attempts = 0;
        state.shared.extra = [{ label: 'Speed', value: 'Normal' }];
      },
      randomFreeCell() {
        while (true) {
          const point = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
          if (!this.snake.some(part => part.x === point.x && part.y === point.y)) return point;
        }
      },
      setDirection(x, y) {
        if (this.dir.x === -x && this.dir.y === -y) return;
        this.nextDir = { x, y };
      },
      update(dt) {
        this.timer += dt;
        if (this.timer < this.step) return;
        this.timer = 0;
        this.dir = { ...this.nextDir };
        const head = { ...this.snake[0] };
        head.x = (head.x + this.dir.x + cols) % cols;
        head.y = (head.y + this.dir.y + rows) % rows;
        if (this.snake.some(part => part.x === head.x && part.y === head.y)) {
          endRun(state.shared.currentScore, `Snake chain snapped at ${Math.round(state.shared.currentScore)}.`);
          return;
        }
        this.snake.unshift(head);
        if (head.x === this.food.x && head.y === this.food.y) {
          state.shared.currentScore += 10;
          state.shared.attempts += 1;
          this.step = Math.max(0.08, this.step - 0.006);
          this.food = this.randomFreeCell();
          state.shared.extra = [{ label: 'Speed', value: this.step <= 0.12 ? 'Fast' : 'Normal' }];
        } else {
          this.snake.pop();
        }
        renderScoreboard();
      },
      draw() {
        clearCanvas();
        const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bg.addColorStop(0, '#081726');
        bg.addColorStop(1, '#09111d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(34, 211, 238, 0.04)';
        for (let x = 0; x < cols; x += 1) {
          for (let y = 0; y < rows; y += 1) {
            ctx.fillRect(board.x + x * cell + 1, board.y + y * cell + 1, cell - 2, cell - 2);
          }
        }

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(board.x + this.food.x * cell + cell / 2, board.y + this.food.y * cell + cell / 2, 10, 0, Math.PI * 2);
        ctx.fill();

        this.snake.forEach((part, index) => {
          ctx.fillStyle = index === 0 ? '#22d3ee' : '#8b5cf6';
          ctx.fillRect(board.x + part.x * cell + 2, board.y + part.y * cell + 2, cell - 4, cell - 4);
        });

        drawCanvasHeader('Neon Snake Arena', `Score ${state.shared.currentScore} · Apples ${state.shared.attempts}`);
      },
      destroy() {}
    };
    return game;
  }

  function createDodgeGame() {
    const game = {
      mode: 'canvas',
      player: null,
      meteors: [],
      spawnTimer: 0,
      elapsed: 0,
      init() { switchMode('canvas'); this.reset(); },
      start() { this.reset(); state.shared.progressText = 'Stay alive. Speed ramps every few seconds.'; },
      reset() {
        this.player = { x: canvas.width / 2, y: canvas.height - 60, r: 14, speed: 340, hp: 3 };
        this.meteors = [];
        this.spawnTimer = 0;
        this.elapsed = 0;
        state.shared.currentScore = 0;
        state.shared.attempts = 0;
        state.shared.extra = [{ label: 'Shield', value: '3 hits' }];
      },
      update(dt) {
        this.elapsed += dt;
        const input = readAxis();
        this.player.x += input.x * this.player.speed * dt;
        this.player.y += input.y * this.player.speed * dt;
        this.player.x = clamp(this.player.x, 22, canvas.width - 22);
        this.player.y = clamp(this.player.y, 70, canvas.height - 22);

        const spawnRate = Math.max(0.22, 0.8 - this.elapsed * 0.02);
        this.spawnTimer += dt;
        if (this.spawnTimer >= spawnRate) {
          this.spawnTimer = 0;
          this.meteors.push({
            x: 28 + Math.random() * (canvas.width - 56),
            y: -20,
            r: 12 + Math.random() * 12,
            vy: 180 + Math.random() * 140 + this.elapsed * 6,
            vx: -40 + Math.random() * 80
          });
        }

        for (const meteor of this.meteors) {
          meteor.x += meteor.vx * dt;
          meteor.y += meteor.vy * dt;
          const dx = meteor.x - this.player.x;
          const dy = meteor.y - this.player.y;
          const dist = Math.hypot(dx, dy);
          if (dist < meteor.r + this.player.r) {
            meteor.hit = true;
            this.player.hp -= 1;
            state.shared.attempts += 1;
            state.shared.extra = [{ label: 'Shield', value: `${Math.max(0, this.player.hp)} hits` }];
            if (this.player.hp <= 0) {
              endRun(Math.round(this.elapsed * 10), `Meteor Dodge X ended at ${Math.round(this.elapsed)}s.`);
              return;
            }
          }
        }

        this.meteors = this.meteors.filter(meteor => !meteor.hit && meteor.y < canvas.height + 40);
        state.shared.currentScore = Math.round(this.elapsed * 10);
        state.shared.progressText = `Survived ${this.elapsed.toFixed(1)}s.`;
        renderScoreboard();
      },
      draw() {
        clearCanvas();
        const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bg.addColorStop(0, '#090f1d');
        bg.addColorStop(1, '#131b31');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 60; i += 1) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(34,211,238,0.05)';
          ctx.fillRect((i * 137) % canvas.width, (i * 83) % canvas.height, 2, 2);
        }

        for (const meteor of this.meteors) {
          ctx.fillStyle = '#fb7185';
          ctx.beginPath();
          ctx.arc(meteor.x, meteor.y, meteor.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (this.player) {
          ctx.save();
          ctx.translate(this.player.x, this.player.y);
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(14, 14);
          ctx.lineTo(0, 8);
          ctx.lineTo(-14, 14);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        drawCanvasHeader('Meteor Dodge X', `Time ${this.elapsed.toFixed(1)}s · Shield ${this.player ? this.player.hp : 0}`);
      },
      destroy() {}
    };
    return game;
  }

  function createTapGame() {
    const game = {
      mode: 'canvas',
      targets: [],
      timer: 20,
      spawnTimer: 0,
      combo: 0,
      init() { switchMode('canvas'); this.reset(); },
      start() { this.reset(); state.shared.progressText = 'Hit as many targets as possible in 20 seconds.'; },
      reset() {
        this.targets = [];
        this.timer = 20;
        this.spawnTimer = 0;
        this.combo = 0;
        state.shared.currentScore = 0;
        state.shared.attempts = 0;
        state.shared.extra = [{ label: 'Combo', value: '0x' }];
      },
      spawnTarget() {
        const radius = 18 + Math.random() * 18;
        this.targets.push({
          x: 40 + Math.random() * (canvas.width - 80),
          y: 90 + Math.random() * (canvas.height - 130),
          r: radius,
          life: 1.2 + Math.random() * 0.9
        });
      },
      update(dt) {
        this.timer -= dt;
        this.spawnTimer += dt;
        if (this.spawnTimer > 0.5) {
          this.spawnTimer = 0;
          this.spawnTarget();
        }
        for (const target of this.targets) target.life -= dt;
        const removed = this.targets.filter(target => target.life <= 0).length;
        if (removed) {
          this.combo = 0;
          state.shared.extra = [{ label: 'Combo', value: '0x' }];
        }
        this.targets = this.targets.filter(target => target.life > 0);
        state.shared.progressText = `${Math.max(0, this.timer).toFixed(1)}s left.`;
        renderScoreboard();
        if (this.timer <= 0) endRun(state.shared.currentScore, `Target Tap Blitz finished with ${Math.round(state.shared.currentScore)} points.`);
      },
      click(x, y) {
        if (!state.running || state.paused) return;
        const hit = this.targets.findIndex(target => Math.hypot(target.x - x, target.y - y) <= target.r);
        if (hit >= 0) {
          this.targets.splice(hit, 1);
          this.combo += 1;
          state.shared.currentScore += 8 + this.combo * 2;
          state.shared.attempts += 1;
          state.shared.extra = [{ label: 'Combo', value: `${this.combo}x` }];
          renderScoreboard();
        } else {
          this.combo = 0;
          state.shared.extra = [{ label: 'Combo', value: '0x' }];
          renderScoreboard();
        }
      },
      draw() {
        clearCanvas();
        const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bg.addColorStop(0, '#081220');
        bg.addColorStop(1, '#1a0f2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const target of this.targets) {
          const alpha = clamp(target.life / 2, 0.2, 1);
          ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
          ctx.beginPath();
          ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.beginPath();
          ctx.arc(target.x, target.y, target.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        drawCanvasHeader('Target Tap Blitz', `Score ${state.shared.currentScore} · Time ${Math.max(0, this.timer).toFixed(1)}s`);
      },
      destroy() {}
    };
    return game;
  }

  function createMemoryGame() {
    const icons = ['◆', '◆', '●', '●', '▲', '▲', '✦', '✦', '■', '■', '✚', '✚'];
    const game = {
      mode: 'dom',
      deck: [],
      revealed: [],
      lock: false,
      matches: 0,
      init() { switchMode('dom'); this.reset(); this.render(); },
      start() { this.reset(); this.render(); state.running = true; state.shared.progressText = 'Match all pairs with as few moves as possible.'; renderScoreboard(); },
      reset() {
        this.deck = shuffle(icons).map((value, index) => ({ id: `${value}-${index}`, value, revealed: false, matched: false }));
        this.revealed = [];
        this.lock = false;
        this.matches = 0;
        state.shared.currentScore = 0;
        state.shared.attempts = 0;
        state.shared.extra = [{ label: 'Pairs', value: '0 / 6' }];
      },
      click(index) {
        if (!state.running || state.paused || this.lock) return;
        const card = this.deck[index];
        if (!card || card.matched || card.revealed) return;
        card.revealed = true;
        this.revealed.push(card);
        this.render();
        if (this.revealed.length === 2) {
          state.shared.attempts += 1;
          this.lock = true;
          const [a, b] = this.revealed;
          if (a.value === b.value) {
            a.matched = true;
            b.matched = true;
            this.matches += 1;
            state.shared.currentScore += 18;
            state.shared.extra = [{ label: 'Pairs', value: `${this.matches} / 6` }];
            this.revealed = [];
            this.lock = false;
            this.render();
            if (this.matches === 6) {
              const bonus = Math.max(0, 60 - state.shared.attempts * 4);
              state.shared.currentScore += bonus;
              endRun(state.shared.currentScore, `Memory board cleared in ${state.shared.attempts} moves.`);
            }
          } else {
            setTimeout(() => {
              a.revealed = false;
              b.revealed = false;
              this.revealed = [];
              this.lock = false;
              this.render();
            }, 650);
          }
          renderScoreboard();
        }
      },
      render() {
        domGame.innerHTML = `
          <div class="section-head"><h2>Memory Flip Plus</h2><span class="badge">Puzzle</span></div>
          <div class="muted">Reveal cards, remember positions, and clear all six pairs.</div>
          <div class="memory-grid">
            ${this.deck.map((card, index) => `
              <button class="memory-card ${card.revealed ? 'revealed' : ''} ${card.matched ? 'matched' : ''}" data-memory-index="${index}">
                ${card.revealed || card.matched ? escapeHtml(card.value) : '?'}
              </button>
            `).join('')}
          </div>
        `;
        domGame.querySelectorAll('[data-memory-index]').forEach(btn => {
          btn.addEventListener('click', () => this.click(Number(btn.dataset.memoryIndex)));
        });
      },
      draw() {}
    };
    return game;
  }

  function createCodeGame() {
    const game = {
      mode: 'dom',
      secret: '',
      history: [],
      init() { switchMode('dom'); this.reset(); this.render(); },
      start() { this.reset(); this.render(); state.running = true; state.shared.progressText = 'Crack the vault code in 8 guesses or less.'; renderScoreboard(); },
      reset() {
        this.secret = generateCode();
        this.history = [];
        state.shared.currentScore = 0;
        state.shared.attempts = 0;
        state.shared.extra = [{ label: 'Limit', value: '8 guesses' }];
      },
      submitGuess(raw) {
        if (!state.running || state.paused) return;
        const guess = String(raw || '').trim();
        if (!/^\d{4}$/.test(guess) || new Set(guess).size !== 4) {
          this.render('Enter exactly 4 unique digits.', 'warn');
          return;
        }
        state.shared.attempts += 1;
        let exact = 0;
        let present = 0;
        for (let i = 0; i < 4; i += 1) {
          if (guess[i] === this.secret[i]) exact += 1;
          else if (this.secret.includes(guess[i])) present += 1;
        }
        this.history.unshift({ guess, exact, present });
        if (exact === 4) {
          state.shared.currentScore = Math.max(20, 120 - (state.shared.attempts - 1) * 12);
          endRun(state.shared.currentScore, `Vault opened in ${state.shared.attempts} guess(es).`);
          this.render('Vault opened. You cracked the code!', 'success');
          return;
        }
        if (state.shared.attempts >= 8) {
          endRun(0, `Vault stayed locked. Secret was ${this.secret}.`);
          this.render(`Out of guesses. Secret was ${this.secret}.`, 'warn');
          return;
        }
        this.render(`Hint: ${exact} exact, ${present} misplaced.`, 'warn');
        renderScoreboard();
      },
      render(message = 'Use the clues to narrow down the code.', tone = '') {
        domGame.innerHTML = `
          <div class="section-head"><h2>Code Breaker Vault</h2><span class="badge">Logic</span></div>
          <div class="muted">Guess a hidden 4-digit code with no repeated digits.</div>
          <form id="codeForm" class="inline-form">
            <input id="codeGuess" maxlength="4" placeholder="e.g. 4821" inputmode="numeric">
            <button type="submit">Submit Guess</button>
          </form>
          <div class="status-banner ${tone}">${escapeHtml(message)}</div>
          <div class="stack" style="margin-top:14px;">
            ${this.history.map(row => `
              <div class="log-item">
                <strong>${escapeHtml(row.guess)}</strong>
                <div class="muted">${row.exact} exact · ${row.present} misplaced</div>
              </div>
            `).join('') || '<div class="log-item">No guesses yet.</div>'}
          </div>
        `;
        const form = document.getElementById('codeForm');
        const input = document.getElementById('codeGuess');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          this.submitGuess(input.value);
          input.value = '';
          input.focus();
        });
        input.focus();
      },
      draw() {}
    };
    return game;
  }

  function drawCanvasHeader(title, subtext) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 24px Segoe UI';
    ctx.fillText(title, 28, 40);
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = '16px Segoe UI';
    ctx.fillText(subtext, 28, 66);
  }

  function readAxis() {
    const axis = { x: 0, y: 0 };
    if (keys.has('arrowleft') || keys.has('a')) axis.x -= 1;
    if (keys.has('arrowright') || keys.has('d')) axis.x += 1;
    if (keys.has('arrowup') || keys.has('w')) axis.y -= 1;
    if (keys.has('arrowdown') || keys.has('s')) axis.y += 1;
    return axis;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffle(source) {
    const list = source.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function generateCode() {
    const digits = shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    return digits.slice(0, 4).join('');
  }

  const keys = new Set();
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'a', 's', 'd', 'w'].includes(key)) event.preventDefault();
    keys.add(key);
    if (!state.current) return;
    if (state.selectedId === 'snake') {
      if (key === 'arrowleft' || key === 'a') state.current.setDirection(-1, 0);
      if (key === 'arrowright' || key === 'd') state.current.setDirection(1, 0);
      if (key === 'arrowup' || key === 'w') state.current.setDirection(0, -1);
      if (key === 'arrowdown' || key === 's') state.current.setDirection(0, 1);
    }
    if (key === 'p') togglePause();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    state.pointer.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('click', (event) => {
    if (state.selectedId !== 'tap' || !state.current || typeof state.current.click !== 'function') return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    state.current.click(x, y);
  });

  startBtn.addEventListener('click', () => startCurrent());
  resetBtn.addEventListener('click', () => resetCurrent());
  pauseBtn.addEventListener('click', () => togglePause());

  function setupDesktopFeatures() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installBtn) installBtn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      if (installBtn) installBtn.classList.add('hidden');
      logEvent('Arcade Nexus was installed for app-style launching.');
    });

    if (installBtn) {
      const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (standalone) installBtn.classList.add('hidden');
      installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
          logEvent('Install prompt is not available yet. Use run-app.ps1 for desktop-style launch.');
          return;
        }
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch (_) {}
        deferredInstallPrompt = null;
        installBtn.classList.add('hidden');
      });
    }
  }

  loadFlags().finally(() => {
    selectGame(state.selectedId);
    renderEvents();
    requestAnimationFrame(loop);
    logEvent('Arcade Nexus ready. Choose a game and press Start.');
    setupDesktopFeatures();
  });
})();
