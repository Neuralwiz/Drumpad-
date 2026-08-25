(() => {
  const KEYS = ["1", "2", "3", "4", "q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"];
  const TUTORIAL = [
    {
      title: "Välkommen till PULSE",
      body: "<p>Oldschool jungle-padd. Amen-breaks, 30-sekunders pads, låg latens och multi-touch.</p>",
    },
    {
      title: "Spela",
      body: "<ol><li>Tryck flera pads samtidigt — upp till 8 fingrar.</li><li>Hårdare tryck = högre velocity och öppnare filter.</li><li>Håll en pad för loop. ROLL gör 16th/32nd-virvlar.</li></ol>",
    },
    {
      title: "Rec + scener",
      body: "<ol><li>REC + PLAY spelar in med overdub. Varje scene A–D har sitt eget beat.</li><li>Importerade packs och patterns sparas i webbläsaren.</li><li>⎘ kopierar scenen, ↩ ångrar sista slaget. Exportera WAV till TikTok/IG.</li></ol>",
    },
  ];

  const state = {
    engine: null,
    kits: [],
    kitIndex: 0,
    scene: 0,
    scenes: [0, 1, 2, 3],
    banks: null,
    bpm: 164,
    swing: 0.08,
    quantize: true,
    qStrength: 0.7,
    playing: false,
    recording: false,
    metro: false,
    bars: 2,
    schedulerId: 0,
    nextNoteTime: 0,
    step: 0,
    pattern: [],
    editMode: false,
    rollMode: false,
    rollDiv: 16,
    inspectIndex: 0,
    haptics: true,
    particlesOn: true,
    holdLoops: new Map(),
    rolls: new Map(),
    pointers: new Map(),
    tapTimes: [],
    deferredPrompt: null,
  };

  const els = {};

  const $ = (id) => document.getElementById(id);

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.tid);
    toast.tid = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function currentKit() {
    return state.kits[state.kitIndex];
  }

  function makeBank(kitIndex = 0, bpm = 164) {
    return { kitId: null, kitIndex, pattern: [], bpm, bars: 2 };
  }

  function snapshotBank() {
    return {
      kitId: currentKit()?.id || null,
      kitIndex: state.kitIndex,
      pattern: state.pattern.map(({ armedAt, ...rest }) => rest),
      bpm: state.bpm,
      bars: state.bars,
    };
  }

  function persistSoon() {
    clearTimeout(persistSoon.tid);
    persistSoon.tid = window.setTimeout(persistNow, 700);
  }

  async function persistNow() {
    if (!state.engine || !state.banks) return;
    state.banks[state.scene] = snapshotBank();
    const imported = state.kits
      .filter((kit) => !kit.builtIn)
      .map((kit) => window.PulseStore.serializeKit(state.engine, kit));
    await window.PulseStore.put("session", {
      banks: state.banks,
      scene: state.scene,
      swing: state.swing,
      quantize: state.quantize,
      qStrength: state.qStrength,
      metro: state.metro,
      haptics: state.haptics,
      particlesOn: state.particlesOn,
      rollDiv: state.rollDiv,
      imported,
    });
  }

  function loopLength() {
    return (60 / state.bpm) * 4 * state.bars;
  }

  function swingOffset(step16, stepLen) {
    if (step16 % 2 === 1) return stepLen * state.swing;
    return 0;
  }

  function quantizeTime(rawTime) {
    if (!state.quantize) return rawTime;
    const stepLen = (60 / state.bpm) / 4;
    const target = Math.round(rawTime / stepLen) * stepLen;
    return rawTime + (target - rawTime) * state.qStrength;
  }

  function haptic(velocity) {
    if (!state.haptics || !navigator.vibrate) return;
    navigator.vibrate(velocity > 0.8 ? 16 : 8);
  }

  function velocityFromEvent(event) {
    if (event.pressure > 0 && event.pointerType !== "mouse") {
      return Math.min(1, 0.18 + event.pressure * 0.92);
    }
    if (typeof event.force === "number" && event.force > 0) {
      return Math.min(1, Math.max(0.15, event.force));
    }
    const radius = Math.max(event.width || 0, event.height || 0);
    if (radius > 0) return Math.min(1, Math.max(0.28, radius / 42));
    return 0.86;
  }

  function drawWave(canvas, buffer, color) {
    if (!canvas || !buffer) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(8, canvas.clientWidth);
    const h = Math.max(8, canvas.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const data = buffer.getChannelData(0);
    ctx.strokeStyle = color || "#00e5ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / w));
    for (let x = 0; x < w; x += 1) {
      let max = 0;
      for (let i = 0; i < step; i += 1) max = Math.max(max, Math.abs(data[x * step + i] || 0));
      const y = (1 - max) * h * 0.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function padGridDims(count) {
    if (count <= 4) return { cols: 2, rows: Math.max(2, Math.ceil(count / 2)) };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 8) return { cols: 4, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(count / 4) };
  }

  function renderPads() {
    const kit = currentKit();
    if (!kit) return;
    const { cols, rows } = padGridDims(kit.pads.length);
    els.grid.style.setProperty("--pad-cols", String(cols));
    els.grid.style.setProperty("--pad-rows", String(rows));
    els.grid.classList.toggle("is-compact", kit.pads.length <= 9);
    els.grid.innerHTML = "";
    kit.pads.forEach((pad) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pad";
      btn.dataset.index = String(pad.index);
      btn.style.setProperty("--accent", pad.color);
      btn.innerHTML = `
        <span class="pad-led"></span>
        <canvas class="pad-wave"></canvas>
        <span class="pad-name">${pad.name}</span>
        <span class="pad-role">${pad.role}${pad.mode === "loop" ? " · loop" : ""}</span>
      `;
      els.grid.appendChild(btn);
      const buffer = state.engine.getBuffer(pad.bufferId);
      drawWave(btn.querySelector(".pad-wave"), buffer, pad.color);
    });
  }

  function flashPad(index, velocity) {
    const padEl = els.grid.querySelector(`[data-index="${index}"]`);
    if (!padEl) return;
    padEl.classList.add("hit");
    window.setTimeout(() => padEl.classList.remove("hit"), 90);
    spawnRipple(padEl, velocity);
    if (state.particlesOn && velocity > 0.78) spawnParticles(padEl, velocity);
  }

  function spawnRipple(padEl, velocity) {
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    const size = 40 + velocity * 90;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = "50%";
    ripple.style.top = "50%";
    padEl.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  function spawnParticles(padEl, velocity) {
    const rect = padEl.getBoundingClientRect();
    const canvas = els.particles;
    const ctx = canvas.getContext("2d");
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const count = 10 + Math.floor(velocity * 10);
    const bits = [];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.4 * velocity;
      bits.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: getComputedStyle(padEl).getPropertyValue("--accent") || "#00e5ff",
      });
    }
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(32, now - last);
      last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bits.forEach((bit) => {
        bit.x += bit.vx * (dt / 16);
        bit.y += bit.vy * (dt / 16);
        bit.life -= 0.03;
        ctx.globalAlpha = Math.max(0, bit.life);
        ctx.fillStyle = bit.color.trim();
        ctx.beginPath();
        ctx.arc(bit.x, bit.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      if (bits.some((bit) => bit.life > 0)) requestAnimationFrame(tick);
      else {
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(tick);
  }

  function hitPad(index, velocity, origin = "live") {
    const kit = currentKit();
    const pad = kit.pads[index];
    if (!pad) return;
    const when = state.engine.ctx.currentTime;
    const played = state.engine.playPad({ ...pad, kit }, velocity, when);
    flashPad(index, velocity);
    haptic(velocity);
    if (state.recording && state.playing && origin === "live" && played) {
      const start = state.loopStart || when;
      const local = (when - start) % loopLength();
      state.pattern.push({
        pad: index,
        time: quantizeTime(local),
        velocity,
        bufferId: pad.bufferId,
        pitch: pad.pitch,
        volume: pad.volume,
        reverb: pad.reverb,
        armedAt: state.loopStart + Math.ceil((when - state.loopStart + 0.0001) / loopLength()) * loopLength(),
      });
      updatePatternMeta();
      persistSoon();
    }
    return played;
  }

  function toggleLoop(index, velocity) {
    if (state.holdLoops.has(index)) {
      state.engine.stopPad(index);
      state.holdLoops.delete(index);
      els.grid.querySelector(`[data-index="${index}"]`)?.classList.remove("looping");
      return;
    }
    const kit = currentKit();
    const pad = { ...kit.pads[index], kit, mode: "loop" };
    state.engine.playPad(pad, velocity);
    state.holdLoops.set(index, true);
    els.grid.querySelector(`[data-index="${index}"]`)?.classList.add("looping");
  }

  function startRoll(index, velocity) {
    stopRoll(index);
    const ctx = state.engine.ctx;
    const step = (60 / state.bpm) / (state.rollDiv / 4);
    const roll = { next: ctx.currentTime, timer: 0 };
    const tick = () => {
      if (!state.rolls.has(index)) return;
      while (roll.next < ctx.currentTime + 0.035) {
        const kit = currentKit();
        const pad = kit.pads[index];
        if (pad) {
          state.engine.playPad({ ...pad, kit }, velocity, roll.next);
          flashPad(index, velocity);
        }
        roll.next += step;
      }
      roll.timer = window.setTimeout(tick, 10);
    };
    state.rolls.set(index, roll);
    tick();
  }

  function stopRoll(index) {
    const roll = state.rolls.get(index);
    if (roll?.timer) window.clearTimeout(roll.timer);
    state.rolls.delete(index);
  }

  function onPadDown(event) {
    const padEl = event.target.closest(".pad");
    if (!padEl) return;
    event.preventDefault();
    padEl.setPointerCapture(event.pointerId);
    const index = Number(padEl.dataset.index);
    if (state.editMode) {
      openInspector(index);
      return;
    }
    const velocity = velocityFromEvent(event);
    if (state.rollMode) {
      startRoll(index, velocity);
      state.pointers.set(event.pointerId, { index, velocity, holdTimer: 0, held: true });
      return;
    }
    const pad = currentKit().pads[index];
    if (pad.mode === "loop") {
      toggleLoop(index, velocity);
      state.pointers.set(event.pointerId, { index, velocity, holdTimer: 0, held: false, latched: true });
      return;
    }
    const holdTimer = window.setTimeout(() => {
      const info = state.pointers.get(event.pointerId);
      if (!info) return;
      info.held = true;
      toggleLoop(index, velocity);
    }, 280);
    state.pointers.set(event.pointerId, { index, velocity, holdTimer, held: false });
    hitPad(index, velocity);
  }

  function onPadUp(event) {
    const info = state.pointers.get(event.pointerId);
    if (!info) return;
    window.clearTimeout(info.holdTimer);
    if (state.rollMode) stopRoll(info.index);
    if (info.held && !state.rollMode) {
      const pad = currentKit().pads[info.index];
      if (pad.mode !== "loop") toggleLoop(info.index, info.velocity);
    }
    state.pointers.delete(event.pointerId);
  }

  function scheduler() {
    if (!state.playing) return;
    const ctx = state.engine.ctx;
    const stepLen = (60 / state.bpm) / 4;
    while (state.nextNoteTime < ctx.currentTime + state.engine.lookahead) {
      const step = state.step;
      const t = state.nextNoteTime + swingOffset(step, stepLen);
      if (state.metro && step % 4 === 0) {
        state.engine.click(t, step % 16 === 0);
        pulseMetro(step % 16 === 0);
      }
      const stepsPerLoop = Math.max(1, Math.round(loopLength() / stepLen));
      const stepInLoop = step % stepsPerLoop;
      for (const event of state.pattern) {
        if (event.armedAt && t < event.armedAt - 0.0001) continue;
        const eventStep = Math.round(event.time / stepLen) % stepsPerLoop;
        if (eventStep === stepInLoop) {
          const pad = currentKit().pads[event.pad];
          if (pad) state.engine.playPad({ ...pad, kit: currentKit() }, event.velocity, t);
          flashPad(event.pad, event.velocity);
        }
      }
      updatePlayhead(step);
      state.step += 1;
      state.nextNoteTime += stepLen;
    }
    state.schedulerId = window.setTimeout(scheduler, 12);
  }

  function pulseMetro(accent) {
    els.metroPulse.classList.add("on");
    els.metroPulse.classList.toggle("beat", accent);
    window.setTimeout(() => els.metroPulse.classList.remove("on", "beat"), 80);
  }

  function renderPlayhead() {
    els.playhead.innerHTML = Array.from({ length: 16 }, () => "<i></i>").join("");
  }

  function updatePlayhead(step) {
    const idx = ((step % 16) + 16) % 16;
    els.playhead.querySelectorAll("i").forEach((el, i) => {
      el.classList.toggle("on", i === idx);
      el.classList.toggle("beat", i === idx && i % 4 === 0);
    });
  }

  function markScenes() {
    document.querySelectorAll(".scene-btn").forEach((btn) => {
      const index = Number(btn.dataset.scene);
      const bank = index === state.scene ? snapshotBank() : state.banks?.[index];
      btn.classList.toggle("filled", (bank?.pattern?.length || 0) > 0);
      btn.classList.toggle("active", index === state.scene);
    });
  }

  function startTransport() {
    state.playing = true;
    state.step = 0;
    state.loopStart = state.engine.ctx.currentTime + 0.04;
    state.nextNoteTime = state.loopStart;
    els.play.classList.add("active");
    els.play.setAttribute("aria-pressed", "true");
    els.play.textContent = "STOP";
    scheduler();
  }

  function stopTransport() {
    state.playing = false;
    window.clearTimeout(state.schedulerId);
    els.play.classList.remove("active");
    els.play.setAttribute("aria-pressed", "false");
    els.play.textContent = "PLAY";
  }

  function updatePatternMeta() {
    els.patternMeta.textContent = `${"ABCD"[state.scene]} · ${state.pattern.length} hits`;
    markScenes();
  }

  function applyTransportReadouts() {
    els.bpm.value = String(state.bpm);
    els.bpmOut.textContent = String(state.bpm);
    $("bars").value = String(state.bars);
    state.engine.setDelayTime(60 / state.bpm);
  }

  function setKit(index, { keepBpm = false, quiet = false } = {}) {
    state.kitIndex = index;
    state.scenes[state.scene] = index;
    const kit = currentKit();
    if (!keepBpm && kit.bpm) {
      state.bpm = kit.bpm;
      applyTransportReadouts();
    }
    els.kitSelect.value = kit.id;
    renderPads();
    if (!quiet) toast(kit.name);
    persistSoon();
  }

  function applyBank(bank, { quiet = true } = {}) {
    const byId = bank.kitId ? state.kits.findIndex((kit) => kit.id === bank.kitId) : -1;
    state.kitIndex = byId >= 0 ? byId : Math.min(bank.kitIndex ?? 0, state.kits.length - 1);
    state.pattern = (bank.pattern || []).map((event) => ({ ...event }));
    if (bank.bpm) state.bpm = bank.bpm;
    if (bank.bars) state.bars = bank.bars;
    applyTransportReadouts();
    els.kitSelect.value = currentKit().id;
    renderPads();
    updatePatternMeta();
    if (!quiet) toast(currentKit().name);
  }

  function setScene(scene) {
    if (scene === state.scene) return;
    state.banks[state.scene] = snapshotBank();
    state.scene = scene;
    applyBank(state.banks[scene] || makeBank(scene));
    persistSoon();
  }

  function fillKitSelect() {
    els.kitSelect.innerHTML = state.kits
      .map((kit) => `<option value="${kit.id}">${kit.name}</option>`)
      .join("");
  }

  function openSheet(id) {
    document.querySelectorAll(".sheet").forEach((sheet) => {
      sheet.classList.toggle("open", sheet.id === id);
      sheet.setAttribute("aria-hidden", String(sheet.id !== id));
    });
    $("sheet-backdrop").classList.add("open");
  }

  function closeSheets() {
    document.querySelectorAll(".sheet").forEach((sheet) => {
      sheet.classList.remove("open");
      sheet.setAttribute("aria-hidden", "true");
    });
    $("sheet-backdrop").classList.remove("open");
  }

  function openInspector(index) {
    state.inspectIndex = index;
    const pad = currentKit().pads[index];
    $("inspector-title").textContent = pad.name;
    $("pad-vol").value = String(Math.round(pad.volume * 100));
    $("pad-pitch").value = String(pad.pitch);
    $("pad-a").value = String(Math.round(pad.attack * 1000));
    $("pad-d").value = String(Math.round(pad.decay * 1000));
    $("pad-s").value = String(Math.round(pad.sustain * 100));
    $("pad-r").value = String(Math.round(pad.release * 1000));
    $("pad-filter").value = pad.filter;
    $("pad-cutoff").value = String(pad.cutoff);
    $("pad-rev").value = String(Math.round(pad.reverb * 100));
    $("pad-dly").value = String(Math.round(pad.delay * 100));
    $("pad-mode").value = pad.mode;
    $("pad-choke").value = String(pad.choke || 0);
    openSheet("sheet-inspector");
  }

  function bindInspector() {
    const apply = () => {
      const pad = currentKit().pads[state.inspectIndex];
      pad.volume = Number($("pad-vol").value) / 100;
      pad.pitch = Number($("pad-pitch").value);
      pad.attack = Number($("pad-a").value) / 1000;
      pad.decay = Number($("pad-d").value) / 1000;
      pad.sustain = Number($("pad-s").value) / 100;
      pad.release = Number($("pad-r").value) / 1000;
      pad.filter = $("pad-filter").value;
      pad.cutoff = Number($("pad-cutoff").value);
      pad.reverb = Number($("pad-rev").value) / 100;
      pad.delay = Number($("pad-dly").value) / 100;
      pad.mode = $("pad-mode").value;
      pad.choke = Number($("pad-choke").value);
      renderPads();
      persistSoon();
    };
    $("sheet-inspector").querySelectorAll("input,select").forEach((input) => {
      input.addEventListener("input", apply);
      input.addEventListener("change", apply);
    });
  }

  function tapTempo() {
    const now = performance.now();
    state.tapTimes.push(now);
    state.tapTimes = state.tapTimes.filter((t) => now - t < 2500);
    if (state.tapTimes.length < 2) return;
    const spans = [];
    for (let i = 1; i < state.tapTimes.length; i += 1) spans.push(state.tapTimes[i] - state.tapTimes[i - 1]);
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    const bpm = Math.round(60000 / avg);
    state.bpm = Math.min(200, Math.max(60, bpm));
    els.bpm.value = String(state.bpm);
    els.bpmOut.textContent = String(state.bpm);
    state.engine.setDelayTime(60 / state.bpm);
  }

  async function exportWav(share) {
    if (!state.pattern.length) {
      toast("Inget pattern att exportera");
      return;
    }
    toast("Renderar WAV…");
    const duration = loopLength();
    const buffer = await state.engine.renderOffline(state.pattern, duration, state.bpm);
    const blob = window.PulseAudio.bufferToWav(buffer);
    const file = new File([blob], `pulse-scene-${state.scene + 1}.wav`, { type: "audio/wav" });
    if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "PULSE beat", text: "Finger-drummat i PULSE" });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    $("import-status").textContent = "Avkodar samples…";
    try {
      const kit = await window.PulseImport.importList(state.engine, fileList);
      state.kits.push(kit);
      fillKitSelect();
      setKit(state.kits.length - 1);
      $("import-status").textContent = `${kit.name} mappad till pads. Sparas i webbläsaren.`;
      toast("Pack importerat · sparat");
      persistSoon();
    } catch (error) {
      $("import-status").textContent = error.message;
    }
  }

  function showTutorial(step = 0) {
    if (localStorage.getItem("pulse.tutorial") === "done") return;
    const page = TUTORIAL[step];
    if (!page) {
      localStorage.setItem("pulse.tutorial", "done");
      els.tutorial.classList.add("hidden");
      return;
    }
    $("tutorial-title").textContent = page.title;
    $("tutorial-body").innerHTML = page.body;
    els.tutorial.classList.remove("hidden");
    els.tutorialNext.onclick = () => showTutorial(step + 1);
    els.tutorialSkip.onclick = () => {
      localStorage.setItem("pulse.tutorial", "done");
      els.tutorial.classList.add("hidden");
    };
  }

  function bindUi() {
    els.grid.addEventListener("pointerdown", onPadDown);
    els.grid.addEventListener("pointerup", onPadUp);
    els.grid.addEventListener("pointercancel", onPadUp);
    els.grid.addEventListener("lostpointercapture", onPadUp);

    els.play.addEventListener("click", () => (state.playing ? stopTransport() : startTransport()));
    els.record.addEventListener("click", () => {
      state.recording = !state.recording;
      els.record.classList.toggle("active", state.recording);
      els.record.setAttribute("aria-pressed", String(state.recording));
      if (state.recording && !state.playing) startTransport();
      toast(state.recording ? "Overdub armed" : "Rec off");
    });
    $("btn-tap").addEventListener("click", tapTempo);
    $("btn-clear").addEventListener("click", () => {
      state.pattern = [];
      updatePatternMeta();
      persistSoon();
      toast("Pattern rensat");
    });
    $("btn-undo").addEventListener("click", () => {
      state.pattern.pop();
      updatePatternMeta();
      persistSoon();
      toast("Ångrade sista slaget");
    });
    $("btn-copy").addEventListener("click", () => {
      const next = (state.scene + 1) % 4;
      state.banks[state.scene] = snapshotBank();
      state.banks[next] = {
        ...snapshotBank(),
        pattern: state.pattern.map((event) => ({ ...event })),
      };
      markScenes();
      persistSoon();
      toast(`Kopierade ${"ABCD"[state.scene]} → ${"ABCD"[next]}`);
    });

    els.bpm.addEventListener("input", () => {
      state.bpm = Number(els.bpm.value);
      els.bpmOut.textContent = String(state.bpm);
      state.engine.setDelayTime(60 / state.bpm);
      persistSoon();
    });
    $("swing").addEventListener("input", () => {
      state.swing = Number($("swing").value) / 100;
      $("swing-out").textContent = `${$("swing").value}%`;
    });
    $("master").addEventListener("input", () => state.engine.setMaster(Number($("master").value) / 100));
    $("reverb").addEventListener("input", () => state.engine.setReverb(Number($("reverb").value) / 100));
    $("delay").addEventListener("input", () => state.engine.setDelay(Number($("delay").value) / 100));
    $("q-strength").addEventListener("input", () => {
      state.qStrength = Number($("q-strength").value) / 100;
      /* readout lives in settings */
    });
    $("chk-metro").addEventListener("change", (e) => {
      state.metro = e.target.checked;
    });
    $("chk-quantize").addEventListener("change", (e) => {
      state.quantize = e.target.checked;
    });
    $("chk-sidechain").addEventListener("change", (e) => {
      state.engine.sidechain = e.target.checked;
    });
    $("bars").addEventListener("change", (e) => {
      state.bars = Number(e.target.value);
      persistSoon();
    });

    els.kitSelect.addEventListener("change", () => {
      const index = state.kits.findIndex((kit) => kit.id === els.kitSelect.value);
      if (index >= 0) setKit(index);
    });
    document.querySelectorAll(".scene-btn").forEach((btn) => {
      btn.addEventListener("click", () => setScene(Number(btn.dataset.scene)));
    });

    $("btn-edit").addEventListener("click", () => {
      state.editMode = !state.editMode;
      $("btn-edit").setAttribute("aria-pressed", String(state.editMode));
      toast(state.editMode ? "Edit: tryck en pad" : "Play mode");
    });
    $("btn-roll").addEventListener("click", () => {
      state.rollMode = !state.rollMode;
      $("btn-roll").setAttribute("aria-pressed", String(state.rollMode));
      toast(state.rollMode ? "Roll-läge" : "Roll off");
    });
    $("btn-import").addEventListener("click", () => openSheet("sheet-import"));
    $("btn-settings").addEventListener("click", () => {
      $("engine-info").textContent = `Audio: ${state.engine.ctx.sampleRate} Hz · latens ~${Math.round(state.engine.outputLatency * 1000)} ms`;
      openSheet("sheet-settings");
    });
    $("btn-share").addEventListener("click", () => openSheet("sheet-share"));
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", closeSheets);
    });
    $("sheet-backdrop").addEventListener("click", closeSheets);

    $("latency-comp").addEventListener("input", (e) => {
      state.engine.latencyComp = Number(e.target.value) / 1000;
    });
    $("lookahead").addEventListener("input", (e) => {
      state.engine.lookahead = Number(e.target.value) / 1000;
    });
    $("chk-haptics").addEventListener("change", (e) => {
      state.haptics = e.target.checked;
    });
    $("chk-particles").addEventListener("change", (e) => {
      state.particlesOn = e.target.checked;
    });
    $("roll-div").addEventListener("change", (e) => {
      state.rollDiv = Number(e.target.value);
    });

    $("file-input").addEventListener("change", (e) => handleFiles(e.target.files));
    const zone = $("dropzone");
    ["dragenter", "dragover"].forEach((type) => {
      zone.addEventListener(type, (e) => {
        e.preventDefault();
        zone.classList.add("over");
      });
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      handleFiles(e.dataTransfer.files);
    });

    $("btn-export-wav").addEventListener("click", () => exportWav(false));
    $("btn-native-share").addEventListener("click", () => exportWav(true));

    window.addEventListener("keydown", (e) => {
      if (e.repeat || e.target.matches("input,select,textarea")) return;
      const index = KEYS.indexOf(e.key.toLowerCase());
      if (index >= 0) hitPad(index, e.shiftKey ? 1 : 0.82);
      if (e.code === "Space") {
        e.preventDefault();
        state.playing ? stopTransport() : startTransport();
      }
    });

    let swipeX = null;
    els.grid.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) swipeX = e.touches[0].clientX;
    }, { passive: true });
    els.grid.addEventListener("touchend", (e) => {
      if (swipeX == null || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - swipeX;
      if (Math.abs(dx) > 80) setScene((state.scene + (dx < 0 ? 1 : 3)) % 4);
      swipeX = null;
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      $("install-bar").classList.remove("hidden");
    });
    $("btn-install").addEventListener("click", async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      $("install-bar").classList.add("hidden");
    });
    $("btn-install-dismiss").addEventListener("click", () => $("install-bar").classList.add("hidden"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistNow();
    });
  }

  function resizeParticles() {
    els.particles.width = window.innerWidth;
    els.particles.height = window.innerHeight;
  }

  async function boot() {
    els.toast = $("toast");
    els.grid = $("pad-grid");
    els.play = $("btn-play");
    els.record = $("btn-record");
    els.bpm = $("bpm");
    els.bpmOut = $("bpm-out");
    els.kitSelect = $("kit-select");
    els.metroPulse = $("metro-pulse");
    els.patternMeta = $("pattern-meta");
    els.playhead = $("playhead");
    els.particles = $("particles");
    els.tutorial = $("tutorial");
    els.tutorialNext = $("tutorial-next");
    els.tutorialSkip = $("tutorial-skip");

    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".file-input, .sheet")) e.preventDefault();
    });

    $("btn-start").addEventListener("click", async () => {
      state.engine = new window.PulseAudio.AudioEngine();
      await state.engine.resume();
      $("boot").querySelector("p").textContent = "Bygger amen-breaks och 30-sekunders pads…";
      state.kits = await window.PulseKits.buildKits(state.engine);
      state.banks = [0, 1, 2, 3].map((i) => makeBank(Math.min(i, state.kits.length - 1), state.kits[i]?.bpm || 164));
      try {
        const saved = await window.PulseStore.get("session");
        if (saved?.imported?.length) {
          for (const pack of saved.imported) {
            state.kits.push(window.PulseStore.restoreKit(state.engine, pack));
          }
        }
        if (saved?.banks) {
          state.banks = saved.banks;
          state.scene = saved.scene ?? 0;
          state.swing = saved.swing ?? state.swing;
          state.quantize = saved.quantize ?? state.quantize;
          state.qStrength = saved.qStrength ?? state.qStrength;
          state.metro = saved.metro ?? state.metro;
          state.haptics = saved.haptics ?? state.haptics;
          state.particlesOn = saved.particlesOn ?? state.particlesOn;
          state.rollDiv = saved.rollDiv ?? state.rollDiv;
        }
      } catch {
        /* first run or private mode */
      }
      fillKitSelect();
      bindUi();
      bindInspector();
      renderPlayhead();
      resizeParticles();
      window.addEventListener("resize", resizeParticles);
      $("swing").value = String(Math.round(state.swing * 100));
      $("swing-out").textContent = `${Math.round(state.swing * 100)}%`;
      $("chk-metro").checked = state.metro;
      $("chk-quantize").checked = state.quantize;
      $("q-strength").value = String(Math.round(state.qStrength * 100));
      $("chk-haptics").checked = state.haptics;
      $("chk-particles").checked = state.particlesOn;
      $("roll-div").value = String(state.rollDiv);
      applyBank(state.banks[state.scene] || makeBank(0), { quiet: true });
      $("boot").classList.add("hidden");
      window.PulseApp = { get engine() { return state.engine; }, get kits() { return state.kits; }, persist: persistNow };
      showTutorial(0);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js");
      }
    });
  }

  boot();
})();
