class CyberVerseGame {
  constructor() {
    this.scenarios = [];
    this.currentIdx = 0;
    this.score = 100;
    this.timer = null;
    this.timeLeft = 0;

    this.playerName = "Valued Citizen";
    this.language = "en";

    // Per-level progress used to drive the Mission Dashboard:
    // status: 'locked' | 'unlocked' | 'completed', result: null | 'correct' | 'incorrect'
    this.levelStates = [];
    this._lockedMsgTimeout = null;

    // One thumbnail icon per level, in scenarios.json order.
    this.levelIcons = ['💰', '👨‍👩‍👧‍👦', '🕵️', '🚨', '🏷️', '🤖', '👮', '🏥', '🎰', '⚡', '💼', '📦', '🖥️', '📱', '📶'];

    // Procedural music + SFX engine (no external audio files needed).
    this.audio = new AudioManager();

    // Spoken narration engine (reads the question, options, praise & tips
    // aloud using a female text-to-speech voice).
    this.voice = new VoiceManager();

    // YOUR GOOGLE APPS SCRIPT WEB APP URL HERE:
    this.scriptURL = "https://script.google.com/macros/s/AKfycbzUYBRfNXKygNCXru8gfb3J9np90FeIP7SG0nlpa9lEmMJProVZGqUmEHKfw-oFWiMQ/exec";

    // DOM Elements
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.dashboardScreen = document.getElementById('dashboard-screen');
    this.gameWorkspace = document.getElementById('game-workspace');
    this.endgameScreen = document.getElementById('endgame-screen');
    this.stage = document.getElementById('game-stage');
    this.scoreDisplay = document.getElementById('score-display');
    this.modal = document.getElementById('feedback-modal');

    this.bindEvents();
  }

  bindEvents() {
    document.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.lang-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        opt.querySelector('input').checked = true;
      });
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      const nameInput = document.getElementById('player-name').value.trim();
      if (!nameInput) {
        alert("Please enter your name / कृपया अपना नाम लिखें");
        return;
      }
      this.playerName = nameInput;
      this.language = document.querySelector('input[name="lang"]:checked').value;

      // This click is our first guaranteed user gesture — the right moment
      // to spin up the AudioContext and start the background music.
      this.audio.init();
      this.audio.playClick();
      this.audio.startMusic();

      this.welcomeScreen.classList.add('hidden');
      this.updateUiLanguage();
      this.init();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      this.audio.playClick();
      this.nextLevel();
    });
    document.getElementById('btn-restart').addEventListener('click', () => location.reload());

    const mapBtn = document.getElementById('btn-back-dashboard');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        this.audio.playClick();
        this.voice.stop();
        clearInterval(this.timer);
        this.renderDashboard();
      });
    }

    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        this.audio.init();
        this.audio.resume();
        const muted = this.audio.toggleMute();
        audioBtn.textContent = muted ? '🔇' : '🔊';
      });
    }

    const voiceBtn = document.getElementById('voice-toggle');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        const enabled = this.voice.toggle();
        voiceBtn.textContent = enabled ? '🗣️' : '🔕';
        voiceBtn.classList.toggle('is-muted', !enabled);
      });
    }
  }

  updateUiLanguage() {
    if (this.language === 'hi') {
      document.getElementById('lbl-player').textContent = "खिलाड़ी:";
      document.getElementById('lbl-level').textContent = "लेवल:";
      document.getElementById('lbl-time').textContent = "समय:";
      document.getElementById('lbl-score').textContent = "सुरक्षा स्कोर:";
      document.getElementById('btn-next').textContent = "जारी रखें ➡️";

      const mapLbl = document.getElementById('lbl-map-btn');
      if (mapLbl) mapLbl.textContent = "मैप";

      const dashTitle = document.getElementById('dash-title');
      if (dashTitle) dashTitle.textContent = "मिशन डैशबोर्ड";
      const dashSub = document.getElementById('dash-subtitle');
      if (dashSub) dashSub.textContent = "शुरू करने के लिए एक लेवल चुनें";
      const dashLblPlayer = document.getElementById('dash-lbl-player');
      if (dashLblPlayer) dashLblPlayer.textContent = "खिलाड़ी";
      const dashLblScore = document.getElementById('dash-lbl-score');
      if (dashLblScore) dashLblScore.textContent = "सुरक्षा स्कोर";
      const dashLblProgress = document.getElementById('dash-lbl-progress');
      if (dashLblProgress) dashLblProgress.textContent = "पूरे किए गए लेवल";
      const lockedMsg = document.getElementById('dash-locked-msg');
      if (lockedMsg) lockedMsg.textContent = "🔒 इसे अनलॉक करने के लिए पिछला लेवल पूरा करें!";
    }
    document.getElementById('player-display').textContent = this.playerName;
    const dashName = document.getElementById('dash-player-name');
    if (dashName) dashName.textContent = this.playerName;
  }

  t(obj) {
    if (!obj) return "";
    if (typeof obj === 'string') return obj;
    return obj[this.language] || obj['en'] || "";
  }

  async init() {
    try {
      const res = await fetch('scenarios.json');
      if (!res.ok) throw new Error("Not found");
      this.scenarios = await res.json();
    } catch (e) {
      console.warn("scenarios.json load failed, using embedded fallback", e);
      this.scenarios = this.getFallbackData();
    }

    // Level 1 starts open; everything else unlocks as the player clears levels.
    this.levelStates = this.scenarios.map((_, i) => ({
      status: i === 0 ? 'unlocked' : 'locked',
      result: null
    }));

    this.renderDashboard();
  }

  // ------------------------------------------------------------------------
  // MISSION DASHBOARD
  // ------------------------------------------------------------------------
  renderDashboard() {
    this.endgameScreen.classList.add('hidden');
    this.gameWorkspace.classList.add('hidden');
    this.dashboardScreen.classList.remove('hidden');

    document.getElementById('dash-player-name').textContent = this.playerName;
    document.getElementById('dash-score').textContent = `${this.score}%`;

    const total = this.scenarios.length;
    const completed = this.levelStates.filter(s => s.status === 'completed').length;
    document.getElementById('dash-progress-text').textContent = `${completed}/${total}`;
    const fill = document.getElementById('dash-progress-fill');
    if (fill) fill.style.width = `${total ? (completed / total) * 100 : 0}%`;

    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    this.scenarios.forEach((level, idx) => {
      const state = this.levelStates[idx];
      const card = document.createElement('div');
      card.className = `level-card ${state.status}`;
      if (state.status === 'completed') {
        card.classList.add(state.result === 'incorrect' ? 'result-incorrect' : 'result-correct');
      }

      const icon = this.levelIcons[idx] || '🎮';
      const title = this.t(level.title) || `Level ${idx + 1}`;

      let badge = '';
      if (state.status === 'locked') badge = `<div class="level-lock-overlay">🔒</div>`;
      else if (state.status === 'completed') badge = `<div class="level-check-badge">${state.result === 'incorrect' ? '❌' : '✅'}</div>`;
      else badge = `<div class="level-play-badge">▶</div>`;

      card.innerHTML = `
        <div class="level-thumb">
          <span class="level-num">${String(idx + 1).padStart(2, '0')}</span>
          <span class="level-icon">${icon}</span>
          ${badge}
        </div>
        <div class="level-title">${title}</div>
      `;

      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', state.status === 'locked' ? '-1' : '0');
      card.setAttribute('aria-label', title + (state.status === 'locked' ? ' - locked' : ''));

      const activate = () => {
        if (state.status === 'locked') {
          this.flashLockedMessage(card);
          return;
        }
        this.audio.playClick();
        this.startLevel(idx);
      };

      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });

      grid.appendChild(card);
    });
  }

  flashLockedMessage(card) {
    card.classList.remove('shake');
    void card.offsetWidth; // force reflow so the animation can restart
    card.classList.add('shake');

    const msg = document.getElementById('dash-locked-msg');
    if (msg) {
      msg.classList.remove('hidden');
      clearTimeout(this._lockedMsgTimeout);
      this._lockedMsgTimeout = setTimeout(() => msg.classList.add('hidden'), 2200);
    }
  }

  startLevel(idx) {
    this.currentIdx = idx;
    this.dashboardScreen.classList.add('hidden');
    this.gameWorkspace.classList.remove('hidden');
    this.loadLevel();
  }

  loadLevel() {
    if (this.currentIdx >= this.scenarios.length) {
      this.showEndgame();
      return;
    }

    clearInterval(this.timer);
    this.stage.innerHTML = '';
    const current = this.scenarios[this.currentIdx];

    document.getElementById('level-display').textContent = `${this.currentIdx + 1}/${this.scenarios.length}`;
    document.getElementById('instruction-text').textContent = this.t(current.instruction);

    this.timeLeft = current.time_limit || 15;
    document.getElementById('timer-display').textContent = `${this.timeLeft}s`;

    this.timer = setInterval(() => {
      this.timeLeft--;
      document.getElementById('timer-display').textContent = `${this.timeLeft}s`;
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.triggerEndGame(false, this.language === 'hi' ? "⏰ समय समाप्त! आप समय पर सही निर्णय नहीं ले पाए!" : "⏰ TIME OUT! You failed to take action in time!");
      }
    }, 1000);

    switch(current.game_type) {
      case 'upi_decision': this.renderUpiDecision(current); break;
      case 'family_group_defend': this.renderFamilyGroup(current); break;
      case 'reverse_hacker': this.renderReverseHacker(current); break;
      case 'panic_room': this.renderPanicRoom(current); break;
      case 'qr_peel': this.renderQrPeel(current); break;
      case 'ai_detective': this.renderAiDetective(current); break;
      case 'incoming_call': this.renderIncomingCall(current); break;
      case 'whatsapp_chat': this.renderWhatsAppChat(current); break;
      case 'drag_drop_trash': this.renderDragDropTrash(current); break;
      case 'spot_flags': this.renderSpotFlags(current); break;
      case 'choice_select': default: this.renderChoiceSelect(current); break;
    }

    // 🗣️ Read the question aloud, followed by the available options.
    this.speakLevelIntro(current);
  }

  /**
   * Collects the on-screen option / choice labels for the current level's
   * game_type, so they can be read aloud after the question.
   */
  collectOptionTexts(level) {
    switch (level.game_type) {
      case 'upi_decision':
        return (level.interactive_elements || []).map(e => this.t(e.label));
      case 'ai_detective':
        return (level.content.options || []).map(o => this.t(o.label));
      case 'incoming_call':
        return [this.t(level.content.accept_label), this.t(level.content.reject_label)];
      case 'choice_select':
        return (level.options || []).map(o => this.t(o.title));
      case 'panic_room':
        return (level.content.steps || []).map(s => this.t(s.label));
      case 'family_group_defend':
        return [this.t(level.content.del_btn_text)];
      case 'drag_drop_trash':
        return [this.t(level.content.bin_text)];
      case 'qr_peel':
        return [this.t(level.content.tip_text)];
      case 'spot_flags':
        return (level.targets || []).map(tg => this.t(tg.label));
      case 'whatsapp_chat':
        return [this.t(level.content.fake_input_text)];
      default:
        return [];
    }
  }

  /** Speaks the level's question/instruction followed by its options. */
  speakLevelIntro(level) {
    const question = this.t(level.instruction) || this.t(level.title);
    const options = this.collectOptionTexts(level);
    this.voice.speakParts([question, ...options], this.language);
  }

  renderUpiDecision(level) {
    const container = document.createElement('div');
    container.className = 'upi-screen';
    container.innerHTML = `
      <div style="background:#0f172a; padding:0.6rem; border-radius:6px; color:#94a3b8; font-size:0.9rem; margin-bottom:0.8rem;">📱 Request From: <strong style="color:#fff">${this.t(level.content.sender)}</strong></div>
      <div class="upi-amount">${level.content.amount}</div>
      <div class="upi-note">💬 "${this.t(level.content.note)}"</div>
      <div style="color:#ff2a5f; font-weight:bold; margin-bottom:1.2rem; font-size:0.85rem;">⚠️ ${this.t(level.content.warning_text)}</div>
      <div id="opts"></div>
    `;
    this.stage.appendChild(container);

    const optsDiv = container.querySelector('#opts');
    level.interactive_elements.forEach(btn => {
      const b = document.createElement('button');
      b.className = `btn-action ${btn.type}`;
      b.innerHTML = `${btn.type === 'safe' ? '🟢' : '🔴'} ${this.t(btn.label)}`;
      b.addEventListener('click', () => {
        clearInterval(this.timer);
        this.triggerEndGame(btn.id === level.correct_action);
      });
      optsDiv.appendChild(b);
    });
  }

  renderFamilyGroup(level) {
    const container = document.createElement('div');
    container.className = 'wa-screen';
    container.innerHTML = `
      <div class="wa-header">
        <div class="wa-user"><div class="wa-avatar">👨‍👩‍👧‍👦</div><div><div class="wa-name">${this.t(level.content.group_name)}</div><div class="wa-status">Active Now</div></div></div>
      </div>
      <div class="wa-body" style="justify-content:flex-end; gap:0.8rem; background:#0d141a;">
        <div class="wa-bubble" style="border-left-color:#38bdf8; background:#202c33; margin:0;">
          <div style="font-size:0.8rem; font-weight:bold; color:#38bdf8;">${this.t(level.content.msg1_sender)}</div>
          <div>${this.t(level.content.msg1_text)}</div>
          <button id="del-btn" style="background:#ff2a5f; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer; margin-top:0.6rem;">${this.t(level.content.del_btn_text)}</button>
        </div>
        <div class="wa-bubble" style="border-left-color:#00ff66; background:#202c33; margin:0;">
          <div style="font-size:0.8rem; font-weight:bold; color:#00ff66;">${this.t(level.content.msg2_sender)}</div>
          <div>${this.t(level.content.msg2_text)}</div>
        </div>
      </div>
    `;
    this.stage.appendChild(container);

    container.querySelector('#del-btn').addEventListener('click', () => {
      clearInterval(this.timer);
      setTimeout(() => this.triggerEndGame(true), 400);
    });
  }

  renderReverseHacker(level) {
    let selectedWords = [];
    const container = document.createElement('div');
    container.style.cssText = "width:100%; max-width:550px; background:#0f172a; border:2px solid #00f0ff; border-radius:12px; padding:1.5rem; text-align:center;";
    container.innerHTML = `
      <h3 style="color:#38bdf8; margin-bottom:0.5rem;">🦹‍♂️ ${this.t(level.content.prompt)}</h3>
      <div id="sms-view" style="background:#1e293b; padding:1.2rem; border-radius:8px; border:1px dashed #64748b; font-family:monospace; font-size:1.05rem; margin:1rem 0; min-height:70px; display:flex; align-items:center; justify-content:center; color:#38bdf8;">[ Tap words below... ]</div>
      <div id="pool" style="display:flex; flex-wrap:wrap; gap:0.8rem; justify-content:center; margin-top:1.5rem;"></div>
    `;
    this.stage.appendChild(container);

    const pool = container.querySelector('#pool');
    const smsView = container.querySelector('#sms-view');

    level.content.options.forEach(word => {
      const chip = document.createElement('div');
      chip.style.cssText = "background:#334155; color:#fff; padding:0.6rem 1rem; border-radius:20px; font-weight:bold; cursor:pointer; border:1px solid #475569;";
      chip.textContent = word;
      chip.addEventListener('click', () => {
        if (!selectedWords.includes(word)) {
          selectedWords.push(word);
          chip.style.background = '#00f0ff'; chip.style.color = '#000';
          smsView.textContent = selectedWords.join(' ');
          if (level.content.target_words.every(tw => selectedWords.includes(tw))) {
            clearInterval(this.timer);
            setTimeout(() => this.triggerEndGame(true), 400);
          }
        }
      });
      pool.appendChild(chip);
    });
  }

  renderPanicRoom(level) {
    let currentStepExpected = 1;
    const container = document.createElement('div');
    container.className = 'panic-box';
    container.innerHTML = `
      <div class="panic-screen">${this.t(level.content.alert_text)}</div>
      <div style="color:#ffb700; font-weight:bold; margin-bottom:1rem;">👉 Click steps in exact sequence (1 -> 2 -> 3):</div>
      <div id="grid" class="step-grid"></div>
    `;
    this.stage.appendChild(container);

    const grid = container.querySelector('#grid');
    level.content.steps.forEach(step => {
      const btn = document.createElement('div');
      btn.className = 'panic-btn';
      btn.innerHTML = `<div class="step-num">${step.order}</div><div>${this.t(step.label)}</div>`;
      btn.addEventListener('click', () => {
        if (step.order === currentStepExpected) {
          btn.classList.add('completed');
          currentStepExpected++;
          if (currentStepExpected > 3) {
            clearInterval(this.timer);
            setTimeout(() => this.triggerEndGame(true), 300);
          }
        } else {
          clearInterval(this.timer);
          this.triggerEndGame(false, this.language === 'hi' ? "💥 गलत क्रम! पहले फ्लाइट मोड, फिर बैंक फ्रीज, और अंत में 1930 डायल करना था!" : "💥 Wrong sequence! You must cut internet first (Flight Mode), freeze bank, then dial 1930!");
        }
      });
      grid.appendChild(btn);
    });
  }

  renderQrPeel(level) {
    const container = document.createElement('div');
    container.style.textAlign = "center";
    container.innerHTML = `
      <h3 style="color:#38bdf8; margin-bottom:1rem;">🏪 ${this.t(level.content.shop_name)}</h3>
      <div style="width:280px; background:#fff; padding:1.5rem; border-radius:16px; border:6px solid #0284c7; text-align:center; position:relative; cursor:pointer; color:#000; margin:0 auto; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <div style="font-size:3.5rem; margin:0.5rem 0;">🏁</div>
        <div style="font-weight:bold; color:#0284c7;">${this.t(level.content.real_qr_text)}</div>
        <div id="fake-layer" style="position:absolute; top:10px; left:10px; right:10px; bottom:10px; background:#fef08a; border:3px dashed #ff2a5f; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:all 0.4s ease;">
          <div style="font-size:3rem;">🛑</div>
          <div style="font-weight:bold; color:#dc2626; padding:0 0.5rem; font-size:0.9rem;">${this.t(level.content.fake_qr_text)}</div>
          <div style="font-size:0.75rem; background:#000; color:#fff; padding:2px 6px; border-radius:4px; margin-top:0.5rem;">${this.t(level.content.tip_text)}</div>
        </div>
      </div>
    `;
    this.stage.appendChild(container);

    const fakeLayer = container.querySelector('#fake-layer');
    fakeLayer.addEventListener('click', () => {
      fakeLayer.style.transform = "rotate(45deg) translate(200px, -100px)";
      fakeLayer.style.opacity = "0";
      clearInterval(this.timer);
      setTimeout(() => this.triggerEndGame(true), 500);
    });
  }

  renderAiDetective(level) {
    const container = document.createElement('div');
    container.style.cssText = "width:100%; max-width:480px; background:#111827; border:2px solid #8b5cf6; border-radius:16px; padding:1.5rem; text-align:center;";
    container.innerHTML = `
      <div style="color:#a78bfa; font-weight:bold; margin-bottom:0.5rem;">🤖 ${this.t(level.content.caller)}</div>
      <div style="font-size:2rem; margin:1rem 0; animation:pulse 0.8s infinite;">🔊 ▂▃▅▇█▅▃▂ 🔊</div>
      <div style="background:#1f2937; padding:1rem; border-radius:8px; font-style:italic; margin-bottom:1.5rem; border:1px solid #374151;">"${this.t(level.content.audio_text)}"</div>
      <div id="ai-opts" style="display:flex; flex-direction:column; gap:0.8rem;"></div>
    `;
    this.stage.appendChild(container);

    const optsDiv = container.querySelector('#ai-opts');
    level.content.options.forEach(opt => {
      const b = document.createElement('button');
      b.className = `btn-action ${opt.safe ? 'safe' : 'neutral'}`;
      b.style.margin = "0";
      b.textContent = this.t(opt.label);
      b.addEventListener('click', () => {
        clearInterval(this.timer);
        this.triggerEndGame(opt.safe);
      });
      optsDiv.appendChild(b);
    });
  }

  renderIncomingCall(level) {
    const container = document.createElement('div');
    container.className = 'call-screen';
    container.innerHTML = `
      <div>
        <div class="call-avatar">👮‍♂️</div>
        <div style="font-size:1.3rem; font-weight:800; color:#fff;">${this.t(level.content.caller_name)}</div>
        <div style="color:#94a3b8; font-size:0.85rem; margin-bottom:1rem;">${level.content.caller_number}</div>
        <div style="color:#f87171; font-weight:bold; font-size:0.9rem; animation:pulse 1s infinite;">${this.t(level.content.status_text)}</div>
      </div>
      <div class="call-actions">
        <div><button id="btn-accept" class="call-btn accept">📹</button><div style="font-size:0.8rem; font-weight:bold; margin-top:0.5rem;">${this.t(level.content.accept_label)}</div></div>
        <div><button id="btn-reject" class="call-btn reject">📵</button><div style="font-size:0.8rem; font-weight:bold; margin-top:0.5rem;">${this.t(level.content.reject_label)}</div></div>
      </div>
    `;
    this.stage.appendChild(container);

    container.querySelector('#btn-reject').addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(true); });
    container.querySelector('#btn-accept').addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(false); });
  }

  renderWhatsAppChat(level) {
    const container = document.createElement('div');
    container.className = 'wa-screen';
    container.innerHTML = `
      <div class="wa-header">
        <div class="wa-user"><div class="wa-avatar">👤</div><div><div class="wa-name">${this.t(level.content.sender)}</div><div class="wa-status">${this.t(level.content.status)}</div></div></div>
        <div class="wa-icons"><span id="wa-call" title="Call Normal Network">📞</span><span id="wa-block" title="Block">⋮</span></div>
      </div>
      <div class="wa-body"><div class="wa-bubble">${this.t(level.content.message)}</div></div>
      <div class="wa-footer"><div id="wa-input" class="wa-input-fake">${this.t(level.content.fake_input_text)}</div></div>
    `;
    this.stage.appendChild(container);

    container.querySelector('#wa-call').addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(true); });
    container.querySelector('#wa-block').addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(true); });
    container.querySelector('#wa-input').addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(false); });
  }

  renderDragDropTrash(level) {
    const container = document.createElement('div');
    container.className = 'trash-game';
    container.innerHTML = `
      <div id="drag-card" class="draggable-card" draggable="true">
        <div style="background:rgba(255,183,0,0.2); color:#ffb700; padding:0.3rem 0.8rem; border-radius:20px; font-size:0.8rem; font-weight:bold; display:inline-block; margin-bottom:0.8rem;">${this.t(level.content.tag)}</div>
        <h3 style="color:#00f0ff; margin-bottom:0.5rem; font-size:1.2rem;">${this.t(level.content.title)}</h3>
        <p style="color:#cbd5e1; font-size:0.95rem; line-height:1.5;">${this.t(level.content.desc)}</p>
        <div style="margin-top:1rem; font-size:0.8rem; color:#ffb700;">${this.t(level.content.tip_text)}</div>
      </div>
      <div id="dustbin" class="dustbin-zone"><span style="font-size:2rem;">🗑️</span><span>${this.t(level.content.bin_text)}</span></div>
    `;
    this.stage.appendChild(container);

    const card = container.querySelector('#drag-card');
    const dustbin = container.querySelector('#dustbin');

    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'scam'); });
    dustbin.addEventListener('dragover', (e) => { e.preventDefault(); dustbin.classList.add('drag-over'); });
    dustbin.addEventListener('dragleave', () => { dustbin.classList.remove('drag-over'); });
    dustbin.addEventListener('drop', (e) => { e.preventDefault(); clearInterval(this.timer); this.triggerEndGame(true); });

    dustbin.addEventListener('click', () => { clearInterval(this.timer); this.triggerEndGame(true); });
    card.addEventListener('click', () => {
      card.style.transform = "translateY(150px) scale(0.2)";
      card.style.opacity = "0";
      clearInterval(this.timer);
      setTimeout(() => this.triggerEndGame(true), 300);
    });
  }

  renderSpotFlags(level) {
    let foundCount = 0;
    const totalTargets = level.targets.length;
    const container = document.createElement('div');
    container.className = 'spot-box';
    container.innerHTML = `
      <div style="margin-bottom:1.2rem; font-size:1.1rem;"><strong>From:</strong> <span class="flag-target" id="t1">${level.content.sender}</span></div>
      <div style="font-size:1.1rem; line-height:1.6;"><strong>Message:</strong> <span class="flag-target" id="t2">${this.t(level.content.message)}</span></div>
      <div id="tip-text" style="margin-top:1.8rem; color:#ffb700; font-weight:bold; font-size:0.95rem; background:rgba(0,0,0,0.4); padding:0.8rem; border-radius:8px;">${this.t(level.content.tip_text)} (${foundCount}/${totalTargets})</div>
    `;
    this.stage.appendChild(container);

    level.targets.forEach(target => {
      const el = document.getElementById(target.id);
      if (el) {
        el.addEventListener('click', () => {
          if (!el.classList.contains('found')) {
            el.classList.add('found');
            foundCount++;
            const tipEl = document.getElementById('tip-text');
            if (tipEl) tipEl.textContent = `👉 Found: (${foundCount}/${totalTargets})`;
            if (foundCount === totalTargets) {
              clearInterval(this.timer);
              setTimeout(() => this.triggerEndGame(true), 400);
            }
          }
        });
      }
    });
  }

  renderChoiceSelect(level) {
    const container = document.createElement('div');
    container.style.width = "100%";
    container.innerHTML = `
      <div style="background:#1e293b; padding:1rem 1.2rem; border-radius:8px; margin-bottom:1.5rem; display:flex; align-items:center; gap:0.6rem; border:1px solid #334155; font-size:1.05rem;">
        <span>🔍 Query / Demand:</span> <strong style="color:#fff;">"${this.t(level.content.search_query)}"</strong>
      </div>
      <div id="opts" class="options-grid"></div>
    `;
    this.stage.appendChild(container);

    const optsDiv = container.querySelector('#opts');
    level.options.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'option-card';
      card.innerHTML = `<div class="option-title">🌐 ${this.t(opt.title)}</div><div class="option-url">${opt.url || ''}</div>`;
      card.addEventListener('click', () => {
        clearInterval(this.timer);
        this.triggerEndGame(opt.is_correct === true);
      });
      optsDiv.appendChild(card);
    });
  }

  triggerEndGame(won, customMsg = null) {
    const idx = this.currentIdx;
    const current = this.scenarios[idx];
    const state = this.levelStates[idx];
    const firstAttempt = !state || state.status !== 'completed';

    const modalTitle = document.getElementById('modal-title');
    const modalBadge = document.getElementById('modal-tactic');
    const modalDesc = document.getElementById('modal-desc');

    if (won) {
      if (modalTitle) { modalTitle.textContent = this.language === 'hi' ? "🎯 बिल्कुल सही जवाब!" : "🎯 MISSION SUCCESS!"; modalTitle.style.color = "#00ff66"; }
      if (modalBadge) modalBadge.textContent = this.t(current.feedback.verdict);
      if (modalDesc) modalDesc.textContent = this.t(current.feedback.rule);
      this.audio.playCorrect();

      const praise = this.language === 'hi'
        ? "बहुत बढ़िया! आपने बिल्कुल सही और सुरक्षित जवाब दिया।"
        : "Excellent job! That was the perfect, safe choice.";
      this.voice.speakParts([praise, this.t(current.feedback.rule)], this.language);
    } else {
      // Only dock the Trust Score the first time a level is failed — replaying
      // a level from the dashboard afterwards is for practice, not penalized.
      if (firstAttempt) {
        this.score = Math.max(0, Math.round(this.score - (100 / this.scenarios.length)));
        this.scoreDisplay.textContent = `${this.score}%`;
      }
      if (modalTitle) { modalTitle.textContent = this.language === 'hi' ? "💥 स्कैम हो गया!" : "💥 SCAM HO GAYA!"; modalTitle.style.color = "#ff2a5f"; }
      if (modalBadge) modalBadge.textContent = this.language === 'hi' ? "गलत कदम (Security Breach)" : "Wrong Action";
      if (modalDesc) modalDesc.textContent = customMsg || this.t(current.feedback.rule);
      this.audio.playIncorrect();

      const consolation = this.language === 'hi'
        ? "अरे नहीं! यह सुरक्षित जवाब नहीं था। यह जरूरी टिप ध्यान से सुनिए।"
        : "Oops! That wasn't the safe move. Listen carefully to this important tip.";
      this.voice.speakParts([consolation, customMsg || this.t(current.feedback.rule)], this.language);
    }

    if (state) {
      state.status = 'completed';
      state.result = won ? 'correct' : 'incorrect';
      const nextState = this.levelStates[idx + 1];
      if (nextState && nextState.status === 'locked') nextState.status = 'unlocked';
    }

    if (this.modal) this.modal.classList.remove('hidden');
  }

  nextLevel() {
    if (this.modal) this.modal.classList.add('hidden');
    this.voice.stop();

    const allDone = this.levelStates.length > 0 && this.levelStates.every(s => s.status === 'completed');
    if (allDone) {
      this.showEndgame();
    } else {
      this.renderDashboard();
    }
  }

  // --- GOOGLE SHEETS DATA LOGGING ---
  async logToGoogleSheet(verificationId) {
    if (!this.scriptURL) return;
    const formData = new FormData();
    formData.append("name", this.playerName);
    formData.append("score", `${this.score}%`);
    formData.append("verificationId", verificationId);
    formData.append("dateTime", new Date().toLocaleString('en-IN'));

    try {
      await fetch(this.scriptURL, { method: "POST", body: formData, mode: "no-cors" });
      console.log("✅ Logged to TechDefenders Google Sheet!");
    } catch (e) { console.error("Sheet Error:", e); }
  }

  // --- ENDGAME & CERTIFICATE GENERATION ---
  showEndgame() {
    this.gameWorkspace.classList.add('hidden');
    this.dashboardScreen.classList.add('hidden');
    this.endgameScreen.classList.remove('hidden');

    const titleEl = document.getElementById('endgame-title');
    const subEl = document.getElementById('endgame-subtitle');
    const certBox = document.getElementById('cert-container');

    if (this.score >= 60) {
      titleEl.textContent = this.language === 'hi' ? "🎉 बधाई हो! आप विजेता हैं!" : "🎉 CONGRATULATIONS! CHALLENGE PASSED!";
      titleEl.style.color = "#00ff66";
      subEl.textContent = this.language === 'hi'
        ? `आपका फाइनल सुरक्षा स्कोर ${this.score}% रहा! आपने साइबर खतरों को सफलतापूर्वक हराया है।`
        : `Your Final Trust Score is ${this.score}%! You demonstrated excellent resilience against real-world cyber threats.`;

      certBox.classList.remove('hidden');
      this.generateCertificate();
    } else {
      titleEl.textContent = this.language === 'hi' ? "🚫 सुरक्षा प्रमाणीकरण अस्वीकृत" : "🚫 CERTIFICATION DENIED";
      titleEl.style.color = "#ff2a5f";
      subEl.textContent = this.language === 'hi'
        ? `आपका स्कोर ${this.score}% रहा। प्रमाण पत्र पाने के लिए 60% या अधिक स्कोर आवश्यक है। दोबारा प्रयास करें!`
        : `Your Final Score is ${this.score}%. A score of 60% or higher is required to earn the CyberVerse : The Safe Click Challenge certificate. Try again!`;
      certBox.classList.add('hidden');
    }
  }

  generateCertificate() {
    const canvas = document.getElementById('cert-canvas');
    const ctx = canvas.getContext('2d');

    // Generate Unique Verification ID
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const verificationId = `TD-2026-${randomHex}`;

    this.logToGoogleSheet(verificationId);

    // Load Tech Defender Logo to draw on certificate!
    const logoImg = new Image();
    logoImg.src = 'logos1.png';

    // Elegant Ornate Cyber Navy Background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8; ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.lineWidth = 2; ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

    logoImg.onload = () => {
      // Draw your Tech Defender logo at top-center of the certificate!
      ctx.drawImage(logoImg, canvas.width / 2 - 50, 45, 100, 100);
      this.drawCertificateText(canvas, ctx, verificationId);
    };

    logoImg.onerror = () => {
      this.drawCertificateText(canvas, ctx, verificationId);
    };

    // Bind jsPDF Landscape Download
    document.getElementById('btn-download-pdf').onclick = () => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 0, 0, 297, 210);
      pdf.save(`${this.playerName}_TechDefenders_Certificate.pdf`);
    };
  }

  drawCertificateText(canvas, ctx, verificationId) {
    ctx.textAlign = 'center';

    // Header
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.fillText('CERTIFICATE OF CYBER RESILIENCE', canvas.width / 2, 180);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('PRESENTED BY TECHDEFENDERS(THE CYBER SECURITY EXPERTS)', canvas.width / 2, 210);

    // Subtitle
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillText('This official digital verification is proudly awarded to', canvas.width / 2, 260);

    // Participant Name
    ctx.fillStyle = '#00ff66';
    ctx.font = 'bold 46px system-ui, -apple-system, sans-serif';
    ctx.fillText(this.playerName.toUpperCase(), canvas.width / 2, 320);

    // Underline
    ctx.beginPath(); ctx.moveTo(canvas.width / 2 - 250, 335); ctx.lineTo(canvas.width / 2 + 250, 335);
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2; ctx.stroke();

    // Achievement text
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.fillText('for mastering real-world phishing detection and social engineering defense', canvas.width / 2, 385);
    ctx.fillText('with an official TechDefenders(The Cyber Security Experts) verified accuracy score of:', canvas.width / 2, 415);

    // Score Badge
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 50px monospace';
    ctx.fillText(`${this.score}% SCORE`, canvas.width / 2, 485);

    // Footer Issue Date & Verification ID
    const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Date of Issue: ${today}`, 70, 540);

    ctx.textAlign = 'right';
    ctx.fillText(`ID: ${verificationId}`, canvas.width - 70, 540);

    // Update PNG download button
    const btnPng = document.getElementById('btn-download-png');
    btnPng.href = canvas.toDataURL('image/png');
    btnPng.download = `${this.playerName}_TechDefenders_Certificate.png`;
  }

  getFallbackData() {
    return [
      {
        "id": 1, "game_type": "upi_decision", "time_limit": 15,
        "title": { "en": "Level 1: OLX / UPI Payment Scam", "hi": "लेवल 1: OLX / UPI पेमेंट स्कैम" },
        "instruction": { "en": "ACTION REQUIRED: OLX buyer sent ₹4,500 UPI request. Click the right button!", "hi": "एक्शन जरूरी: OLX खरीदार ने ₹4,500 लेने के लिए UPI रिक्वेस्ट भेजी है। सही बटन दबाएं!" },
        "content": { "sender": { "en": "Rahul Kumar", "hi": "राहुल कुमार" }, "amount": "₹ 4,500", "note": { "en": "Enter PIN to RECEIVE money.", "hi": "पैसे प्राप्त करने के लिए PIN डालें।" }, "warning_text": { "en": "You are entering UPI PIN", "hi": "सावधानी: आप UPI PIN डाल रहे हैं" } },
        "interactive_elements": [
          { "id": "enter_pin", "label": { "en": "Enter UPI PIN & Receive", "hi": "PIN डालें और प्राप्त करें" }, "type": "danger" },
          { "id": "reject", "label": { "en": "CANCEL / DECLINE (Scam)", "hi": "कैंसल करें (यह स्कैम है)" }, "type": "safe" }
        ],
        "correct_action": "reject",
        "feedback": { "verdict": { "en": "🎉 PERFECT ACTION!", "hi": "🎉 बिल्कुल सही कदम!" }, "rule": { "en": "UPI PIN is ONLY entered to SEND money. Never to receive!", "hi": "UPI PIN सिर्फ पैसे भेजने के लिए डाला जाता है। प्राप्त करने के लिए कभी नहीं!" } }
      }
    ];
  }
}

window.addEventListener('DOMContentLoaded', () => new CyberVerseGame());
