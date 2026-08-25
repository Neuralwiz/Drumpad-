(() => {
  let SR = 44100;

  async function render(seconds, setup) {
    const length = Math.max(1, Math.ceil(SR * seconds));
    const offline = new OfflineAudioContext(2, length, SR);
    setup(offline);
    return offline.startRendering();
  }

  function envGain(ctx, peak, attack, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, 0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
    return gain;
  }

  function noiseBuffer(ctx, seconds, color = "white") {
    const length = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "pink") {
        last = last * 0.96 + white * 0.04;
        data[i] = last * 3.2;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  function playNoise(ctx, seconds, color, filterType, freq, q, peak, attack, decay) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, seconds, color);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = envGain(ctx, peak, attack, decay);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  function tone(ctx, type, freqStart, freqEnd, peak, attack, decay) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, 0);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), Math.min(decay, 0.18));
    }
    const gain = envGain(ctx, peak, attack, decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(attack + decay + 0.02);
  }

  const recipes = {
    kick808: () => render(1.05, (ctx) => {
      tone(ctx, "sine", 172, 38, 1, 0.002, 0.88);
      tone(ctx, "sine", 96, 46, 0.5, 0.001, 0.32);
      tone(ctx, "triangle", 2100, 380, 0.26, 0.001, 0.01);
      playNoise(ctx, 0.03, "white", "bandpass", 180, 2.4, 0.12, 0.001, 0.02);
    }),
    kickPunch: () => render(0.55, (ctx) => {
      tone(ctx, "sine", 210, 58, 0.95, 0.001, 0.38);
      tone(ctx, "square", 80, 55, 0.12, 0.001, 0.08);
      playNoise(ctx, 0.08, "white", "highpass", 1800, 0.6, 0.18, 0.001, 0.03);
    }),
    kickTech: () => render(0.62, (ctx) => {
      tone(ctx, "sine", 150, 49, 1, 0.001, 0.42);
      tone(ctx, "triangle", 90, 50, 0.28, 0.001, 0.16);
      playNoise(ctx, 0.05, "white", "bandpass", 4200, 2.2, 0.2, 0.001, 0.018);
    }),
    kickAcoustic: () => render(0.7, (ctx) => {
      tone(ctx, "sine", 126, 62, 0.86, 0.002, 0.46);
      playNoise(ctx, 0.12, "pink", "bandpass", 280, 1.1, 0.35, 0.002, 0.11);
      playNoise(ctx, 0.05, "white", "highpass", 2500, 0.7, 0.16, 0.001, 0.03);
    }),
    snare: () => render(0.45, (ctx) => {
      tone(ctx, "triangle", 198, 160, 0.42, 0.001, 0.14);
      playNoise(ctx, 0.28, "white", "bandpass", 2200, 0.85, 0.7, 0.001, 0.2);
      playNoise(ctx, 0.08, "white", "highpass", 6000, 0.5, 0.28, 0.001, 0.04);
    }),
    snareDust: () => render(0.5, (ctx) => {
      tone(ctx, "sine", 184, 150, 0.3, 0.002, 0.16);
      playNoise(ctx, 0.36, "pink", "bandpass", 1800, 0.7, 0.62, 0.002, 0.26);
    }),
    snareRim: () => render(0.22, (ctx) => {
      tone(ctx, "triangle", 420, 300, 0.28, 0.001, 0.06);
      playNoise(ctx, 0.12, "white", "highpass", 2800, 0.8, 0.55, 0.001, 0.07);
    }),
    clap: () => render(0.42, (ctx) => {
      [0, 0.012, 0.024, 0.04].forEach((offset, i) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.18, "white");
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1400 + i * 180;
        bp.Q.value = 0.9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, offset);
        g.gain.exponentialRampToValueAtTime(0.55 - i * 0.08, offset + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, offset + 0.16);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(offset);
      });
    }),
    hatClosed: () => render(0.16, (ctx) => {
      [1, 1.47, 1.83, 2.21, 2.74].forEach((ratio) => {
        tone(ctx, "square", 310 * ratio, 310 * ratio, 0.045, 0.001, 0.045);
      });
      playNoise(ctx, 0.12, "white", "highpass", 7200, 0.8, 0.28, 0.001, 0.05);
      playNoise(ctx, 0.08, "white", "bandpass", 9800, 2.4, 0.22, 0.001, 0.03);
    }),
    hatOpen: () => render(0.7, (ctx) => {
      [1, 1.47, 1.83, 2.21, 2.74, 3.13].forEach((ratio) => {
        tone(ctx, "square", 290 * ratio, 290 * ratio, 0.03, 0.001, 0.38);
      });
      playNoise(ctx, 0.62, "white", "highpass", 6800, 0.7, 0.26, 0.001, 0.42);
      playNoise(ctx, 0.4, "white", "bandpass", 10500, 1.6, 0.16, 0.001, 0.28);
    }),
    hatPedal: () => render(0.12, (ctx) => {
      playNoise(ctx, 0.08, "white", "highpass", 5400, 1.1, 0.32, 0.001, 0.04);
    }),
    perc: () => render(0.28, (ctx) => {
      tone(ctx, "sine", 540, 220, 0.35, 0.001, 0.12);
      playNoise(ctx, 0.14, "white", "bandpass", 2400, 1.8, 0.28, 0.001, 0.08);
    }),
    shaker: () => render(0.22, (ctx) => {
      playNoise(ctx, 0.18, "white", "bandpass", 6200, 1.4, 0.34, 0.004, 0.12);
    }),
    tomLo: () => render(0.7, (ctx) => {
      tone(ctx, "sine", 148, 78, 0.7, 0.002, 0.48);
      playNoise(ctx, 0.1, "pink", "bandpass", 420, 1, 0.16, 0.002, 0.08);
    }),
    tomHi: () => render(0.55, (ctx) => {
      tone(ctx, "sine", 230, 128, 0.62, 0.002, 0.36);
      playNoise(ctx, 0.08, "pink", "bandpass", 700, 1, 0.14, 0.002, 0.06);
    }),
    rim: () => render(0.16, (ctx) => {
      tone(ctx, "square", 780, 520, 0.14, 0.001, 0.03);
      playNoise(ctx, 0.08, "white", "bandpass", 1800, 2.6, 0.4, 0.001, 0.04);
    }),
    ride: () => render(1.1, (ctx) => {
      playNoise(ctx, 1, "white", "highpass", 6400, 0.5, 0.18, 0.002, 0.85);
      tone(ctx, "triangle", 740, 740, 0.06, 0.001, 0.7);
    }),
    crash: () => render(1.6, (ctx) => {
      playNoise(ctx, 1.5, "white", "highpass", 4200, 0.45, 0.42, 0.002, 1.25);
      playNoise(ctx, 0.4, "white", "bandpass", 7800, 0.8, 0.22, 0.001, 0.3);
    }),
    fxRise: () => render(1.2, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, 0);
      osc.frequency.exponentialRampToValueAtTime(920, 1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, 0);
      filter.frequency.exponentialRampToValueAtTime(8000, 1.05);
      const g = envGain(ctx, 0.22, 0.05, 1.05);
      osc.connect(filter).connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(1.15);
    }),
    stab: () => render(0.4, (ctx) => {
      [220, 277, 330].forEach((freq) => tone(ctx, "sawtooth", freq, freq, 0.12, 0.004, 0.22));
      playNoise(ctx, 0.08, "white", "lowpass", 1800, 0.4, 0.08, 0.001, 0.05);
    }),
    loopPulse: () => render(1, (ctx) => {
      for (let i = 0; i < 8; i += 1) {
        const t = i * 0.125;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = i % 4 === 0 ? 70 : 110;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i % 4 === 0 ? 0.28 : 0.08, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      }
    }),
  };

  const roleMeta = {
    kick: { color: "#ff2ec4", choke: 0 },
    snare: { color: "#00e5ff", choke: 0 },
    clap: { color: "#7cfffb", choke: 0 },
    hat: { color: "#9b6bff", choke: 1 },
    perc: { color: "#b8ff3c", choke: 0 },
    tom: { color: "#ffb020", choke: 0 },
    cym: { color: "#c5a7ff", choke: 2 },
    fx: { color: "#ff7ad1", choke: 0 },
    loop: { color: "#e8f7ff", choke: 0 },
  };

  function pad(name, role, recipe, extra = {}) {
    const meta = roleMeta[role] || roleMeta.perc;
    return {
      name,
      role,
      recipe,
      color: extra.color || meta.color,
      mode: extra.mode || "oneshot",
      choke: extra.choke ?? meta.choke,
      pitch: extra.pitch || 0,
      volume: extra.volume ?? 1,
      attack: extra.attack ?? 0.002,
      decay: extra.decay ?? 0.2,
      sustain: extra.sustain ?? 0,
      release: extra.release ?? 0.08,
      filter: extra.filter || "lowpass",
      cutoff: extra.cutoff ?? 14000,
      reverb: extra.reverb ?? 0.08,
      delay: extra.delay ?? 0,
    };
  }

  const kitDefs = [
    {
      id: "trap",
      name: "Neon Trap",
      bpm: 140,
      pads: [
        pad("808", "kick", "kick808", { decay: 0.7, cutoff: 6000 }),
        pad("Snare", "snare", "snare"),
        pad("Clap", "clap", "clap", { reverb: 0.18 }),
        pad("CHH", "hat", "hatClosed", { filter: "highpass", cutoff: 7000 }),
        pad("Kick", "kick", "kickPunch", { volume: 0.9 }),
        pad("Rim", "snare", "snareRim"),
        pad("Perc", "perc", "perc", { delay: 0.12 }),
        pad("OHH", "hat", "hatOpen", { choke: 1, reverb: 0.16, decay: 0.5 }),
        pad("Tom Lo", "tom", "tomLo"),
        pad("Tom Hi", "tom", "tomHi"),
        pad("Shaker", "perc", "shaker"),
        pad("Ride", "cym", "ride", { reverb: 0.22 }),
        pad("Rise", "fx", "fxRise", { mode: "oneshot", reverb: 0.3 }),
        pad("Crash", "cym", "crash", { reverb: 0.28, choke: 2 }),
        pad("Stab", "fx", "stab", { delay: 0.2 }),
        pad("Pulse", "loop", "loopPulse", { mode: "loop", volume: 0.7 }),
      ],
    },
    {
      id: "boombap",
      name: "Boom Bap",
      bpm: 92,
      pads: [
        pad("Kick", "kick", "kickPunch", { cutoff: 5000 }),
        pad("Snare", "snare", "snareDust", { reverb: 0.14 }),
        pad("Clap", "clap", "clap"),
        pad("CHH", "hat", "hatClosed"),
        pad("Kick 2", "kick", "kickAcoustic"),
        pad("Rim", "snare", "rim"),
        pad("Perc", "perc", "perc"),
        pad("OHH", "hat", "hatOpen", { choke: 1 }),
        pad("Tom Lo", "tom", "tomLo"),
        pad("Tom Hi", "tom", "tomHi"),
        pad("Shaker", "perc", "shaker"),
        pad("Ride", "cym", "ride"),
        pad("Stab", "fx", "stab"),
        pad("Crash", "cym", "crash"),
        pad("Pedal", "hat", "hatPedal", { choke: 1 }),
        pad("Loop", "loop", "loopPulse", { mode: "loop" }),
      ],
    },
    {
      id: "techno",
      name: "Techno",
      bpm: 132,
      pads: [
        pad("Kick", "kick", "kickTech", { cutoff: 4200 }),
        pad("Snare", "snare", "snareRim"),
        pad("Clap", "clap", "clap", { reverb: 0.24, delay: 0.16 }),
        pad("CHH", "hat", "hatClosed"),
        pad("Kick Sub", "kick", "kick808", { pitch: -2, volume: 0.85 }),
        pad("Rim", "snare", "rim"),
        pad("Perc", "perc", "perc", { delay: 0.22 }),
        pad("OHH", "hat", "hatOpen", { choke: 1 }),
        pad("Tom Lo", "tom", "tomLo"),
        pad("Tom Hi", "tom", "tomHi"),
        pad("Shaker", "perc", "shaker"),
        pad("Ride", "cym", "ride", { delay: 0.18 }),
        pad("Rise", "fx", "fxRise", { reverb: 0.32 }),
        pad("Crash", "cym", "crash"),
        pad("Stab", "fx", "stab"),
        pad("Pulse", "loop", "loopPulse", { mode: "loop" }),
      ],
    },
    {
      id: "acoustic",
      name: "Acoustic",
      bpm: 104,
      pads: [
        pad("Kick", "kick", "kickAcoustic"),
        pad("Snare", "snare", "snareDust"),
        pad("Rim", "snare", "rim"),
        pad("CHH", "hat", "hatClosed"),
        pad("Kick 2", "kick", "kickPunch", { volume: 0.8 }),
        pad("Snare 2", "snare", "snare"),
        pad("Perc", "perc", "perc"),
        pad("OHH", "hat", "hatOpen", { choke: 1, reverb: 0.2 }),
        pad("Tom Lo", "tom", "tomLo", { reverb: 0.16 }),
        pad("Tom Hi", "tom", "tomHi", { reverb: 0.16 }),
        pad("Shaker", "perc", "shaker"),
        pad("Ride", "cym", "ride", { reverb: 0.26 }),
        pad("Pedal", "hat", "hatPedal", { choke: 1 }),
        pad("Crash", "cym", "crash", { reverb: 0.34, choke: 2 }),
        pad("Stab", "fx", "stab"),
        pad("Room", "loop", "loopPulse", { mode: "loop", volume: 0.45, reverb: 0.2 }),
      ],
    },
  ];

  async function buildKits(engine) {
    SR = engine.ctx.sampleRate || 44100;
    const cache = new Map();
    const kits = [];
    for (const def of kitDefs) {
      const pads = [];
      for (let i = 0; i < def.pads.length; i += 1) {
        const src = def.pads[i];
        if (!cache.has(src.recipe)) {
          cache.set(src.recipe, await recipes[src.recipe]());
        }
        const bufferId = `${def.id}-${i}`;
        engine.registerBuffer(bufferId, cache.get(src.recipe));
        pads.push({ ...src, index: i, bufferId });
      }
      kits.push({ id: def.id, name: def.name, bpm: def.bpm, builtIn: true, pads });
    }
    return kits;
  }

  window.PulseKits = { buildKits, recipes, pad, roleMeta };
})();
