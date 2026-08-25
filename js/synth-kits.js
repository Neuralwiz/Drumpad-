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

  function toneAt(ctx, dest, type, freqStart, freqEnd, peak, attack, decay, when) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, when);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), when + Math.min(decay, 0.2));
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    osc.connect(gain).connect(dest);
    osc.start(when);
    osc.stop(when + attack + decay + 0.03);
  }

  function playNoiseAt(ctx, dest, seconds, color, filterType, freq, q, peak, attack, decay, when) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, seconds, color);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    src.connect(filter).connect(gain).connect(dest);
    src.start(when);
  }

  let dummyCtx = null;
  let amenCorePromise = null;

  function allocStereo(seconds) {
    if (!dummyCtx || dummyCtx.sampleRate !== SR) {
      dummyCtx = new OfflineAudioContext(2, 1, SR);
    }
    return dummyCtx.createBuffer(2, Math.max(1, Math.ceil(SR * seconds)), SR);
  }

  function cloneBuffer(src) {
    const dest = allocStereo(src.duration);
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      dest.copyToChannel(src.getChannelData(Math.min(ch, src.numberOfChannels - 1)), ch);
    }
    return dest;
  }

  function vintageBuffer(buffer) {
    const step = 1 / 1800;
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const data = buffer.getChannelData(ch);
      let rumble = 0;
      for (let i = 0; i < data.length; i += 1) {
        const crushed = Math.round(data[i] / step) * step;
        const pop = Math.random() < 0.00055 ? (Math.random() * 2 - 1) * 0.09 : 0;
        rumble = rumble * 0.996 + (Math.random() * 2 - 1) * 0.0018;
        data[i] = Math.tanh(crushed * 1.15) * 0.94 + pop + rumble;
      }
    }
    return buffer;
  }

  function hitAmen(ctx, dest, kind, when, vel) {
    switch (kind) {
      case "k":
        toneAt(ctx, dest, "sine", 156, 48, 0.92 * vel, 0.0015, 0.17, when);
        toneAt(ctx, dest, "sine", 78, 46, 0.38 * vel, 0.001, 0.1, when);
        toneAt(ctx, dest, "triangle", 1900, 420, 0.16 * vel, 0.001, 0.012, when);
        playNoiseAt(ctx, dest, 0.03, "white", "bandpass", 220, 2.2, 0.1 * vel, 0.001, 0.018, when);
        break;
      case "sn":
        toneAt(ctx, dest, "triangle", 228, 164, 0.4 * vel, 0.001, 0.09, when);
        toneAt(ctx, dest, "sine", 186, 148, 0.24 * vel, 0.001, 0.07, when);
        playNoiseAt(ctx, dest, 0.18, "white", "bandpass", 1720, 0.92, 0.74 * vel, 0.001, 0.12, when);
        playNoiseAt(ctx, dest, 0.12, "pink", "bandpass", 880, 1.05, 0.3 * vel, 0.001, 0.09, when);
        playNoiseAt(ctx, dest, 0.05, "white", "highpass", 6400, 0.55, 0.3 * vel, 0.001, 0.028, when);
        break;
      case "gs":
        playNoiseAt(ctx, dest, 0.07, "white", "bandpass", 2100, 1.1, 0.22 * vel, 0.001, 0.04, when);
        toneAt(ctx, dest, "triangle", 210, 170, 0.08 * vel, 0.001, 0.04, when);
        break;
      case "h":
        playNoiseAt(ctx, dest, 0.055, "white", "highpass", 7800, 0.75, 0.2 * vel, 0.001, 0.028, when);
        playNoiseAt(ctx, dest, 0.03, "white", "bandpass", 10400, 2.1, 0.12 * vel, 0.001, 0.016, when);
        break;
      case "oh":
        playNoiseAt(ctx, dest, 0.28, "white", "highpass", 6900, 0.65, 0.22 * vel, 0.001, 0.2, when);
        playNoiseAt(ctx, dest, 0.16, "white", "bandpass", 9800, 1.4, 0.1 * vel, 0.001, 0.12, when);
        break;
      case "cr":
        playNoiseAt(ctx, dest, 0.9, "white", "highpass", 3800, 0.42, 0.38 * vel, 0.002, 0.72, when);
        playNoiseAt(ctx, dest, 0.25, "white", "bandpass", 7600, 0.8, 0.16 * vel, 0.001, 0.18, when);
        break;
      default: {
        const _never = kind;
        void _never;
      }
    }
  }

  const JUNGLE_BPM = 164;
  const AMEN_STEPS = 32;

  const AMEN_GROOVE = [
    ["k", "h"], ["h"], ["sn", "h"], ["k", "h"],
    ["k", "h"], ["h"], ["sn", "h"], ["h"],
    ["h"], ["k", "h"], ["sn", "h"], ["h"],
    ["k", "h"], ["h"], ["sn", "oh"], ["h"],
    ["k", "h"], ["h"], ["sn", "h"], ["k", "gs", "h"],
    ["k", "h"], ["h"], ["sn", "h"], ["gs", "h"],
    ["h"], ["k", "h"], ["sn", "h"], ["h"],
    ["k", "h"], ["gs", "h"], ["sn", "oh"], ["h"],
  ];

  const AMEN_CHOP_MAP = [
    2, 2, 2, 3, 6, 6, 7, 2,
    10, 10, 10, 11, 14, 14, 15, 6,
    2, 6, 6, 6, 10, 14, 14, 2,
    0, 0, 4, 4, 14, 14, 14, 15,
  ];

  const AMEN_RIDE_BARS = [
    "full", "full", "chop", "chop",
    "snare", "full", "stutter", "full",
    "chop", "snare", "full", "stutter",
    "full", "chop", "snare", "full",
    "chop", "stutter", "full", "full",
    "chop", "snare",
  ];

  function stepTime(step) {
    const sixteenth = 60 / JUNGLE_BPM / 4;
    const swing = step % 2 === 1 ? sixteenth * 0.07 : 0;
    return step * sixteenth + swing;
  }

  async function renderAmenGroove() {
    const loopDur = stepTime(AMEN_STEPS);
    const rendered = await render(loopDur + 0.28, (ctx) => {
      const bus = ctx.createGain();
      bus.gain.value = 1;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 42;
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 2050;
      mid.gain.value = 3.8;
      mid.Q.value = 0.75;
      const air = ctx.createBiquadFilter();
      air.type = "highshelf";
      air.frequency.value = 6500;
      air.gain.value = 1.6;
      bus.connect(hp).connect(mid).connect(air).connect(ctx.destination);

      AMEN_GROOVE.forEach((hits, step) => {
        const when = stepTime(step);
        hits.forEach((kind) => {
          const vel = kind === "k" ? 0.92 : kind === "sn" ? 1 : kind === "gs" ? 0.55 : 0.72;
          hitAmen(ctx, bus, kind, when, vel);
        });
      });
    });
    const dest = allocStereo(loopDur);
    const loopLen = dest.length;
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      const src = rendered.getChannelData(Math.min(ch, rendered.numberOfChannels - 1));
      const out = dest.getChannelData(ch);
      out.set(src.subarray(0, loopLen));
      for (let i = loopLen; i < src.length; i += 1) {
        out[i - loopLen] += src[i];
      }
    }
    return vintageBuffer(dest);
  }

  function getAmenCore() {
    if (!amenCorePromise) amenCorePromise = renderAmenGroove();
    return amenCorePromise;
  }

  function sliceCopy(dest, destOff, src, srcStart, srcLen, gain) {
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      const d = dest.getChannelData(ch);
      const s = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
      for (let i = 0; i < srcLen && destOff + i < d.length; i += 1) {
        d[destOff + i] += (s[srcStart + i] || 0) * gain;
      }
    }
  }

  function rearrangeAmen(src, map) {
    const dest = allocStereo(src.duration);
    const slice = Math.floor(src.length / AMEN_STEPS);
    map.forEach((from, to) => {
      sliceCopy(dest, to * slice, src, from * slice, slice, 1);
    });
    return dest;
  }

  async function renderAmenFill() {
    const core = await getAmenCore();
    const dest = cloneBuffer(core);
    const slice = Math.floor(core.length / AMEN_STEPS);
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      dest.getChannelData(ch).fill(0, 24 * slice);
    }
    const roll = await render(stepTime(8) + 0.4, (ctx) => {
      const bus = ctx.createGain();
      bus.gain.value = 0.72;
      bus.connect(ctx.destination);
      for (let i = 0; i < 16; i += 1) {
        const when = (60 / JUNGLE_BPM / 8) * i;
        const vel = 0.48 + (i / 16) * 0.38;
        hitAmen(ctx, bus, i === 15 ? "cr" : "sn", when, vel);
      }
    });
    const start = 24 * slice;
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      sliceCopy(dest, start, roll, 0, roll.length, 0.85);
    }
    return vintageBuffer(dest);
  }

  async function renderAmenRide() {
    const core = await getAmenCore();
    const chop = rearrangeAmen(core, AMEN_CHOP_MAP);
    const dest = allocStereo(30);
    const bar = Math.floor(core.length / 2);
    const sixteenth = Math.floor(core.length / AMEN_STEPS);
    let offset = 0;
    let barIndex = 0;
    while (offset < dest.length) {
      const kind = AMEN_RIDE_BARS[barIndex % AMEN_RIDE_BARS.length];
      if (kind === "full") {
        const srcOff = (barIndex % 2) * bar;
        sliceCopy(dest, offset, core, srcOff, bar, 1);
      } else if (kind === "chop") {
        const srcOff = (barIndex % 2) * bar;
        sliceCopy(dest, offset, chop, srcOff, bar, 1);
      } else if (kind === "snare") {
        for (let i = 0; i < 16; i += 1) {
          const from = [2, 6, 10, 14][i % 4] * sixteenth;
          sliceCopy(dest, offset + i * sixteenth, core, from, sixteenth, 0.92);
        }
      } else if (kind === "stutter") {
        const hit = 6 * sixteenth;
        for (let i = 0; i < 16; i += 1) {
          const len = i % 4 === 3 ? sixteenth : Math.floor(sixteenth * 0.55);
          sliceCopy(dest, offset + i * sixteenth, core, hit, len, 0.88 + (i % 4) * 0.03);
        }
      } else {
        const _never = kind;
        void _never;
      }
      offset += bar;
      barIndex += 1;
    }
    const fade = Math.floor(SR * 2.4);
    for (let ch = 0; ch < dest.numberOfChannels; ch += 1) {
      const data = dest.getChannelData(ch);
      for (let i = 0; i < fade; i += 1) {
        data[i] *= i / fade;
        const back = data.length - 1 - i;
        if (back >= 0) data[back] *= i / fade;
      }
    }
    return dest;
  }

  function padEnvelope(t, dur) {
    const attack = 1.05;
    const release = 3.4;
    if (t < attack) return (t / attack) ** 1.15;
    if (t > dur - release) return Math.max(0, (dur - t) / release) ** 1.05;
    return 1;
  }

  function oscSample(type, phase) {
    const p = phase - Math.floor(phase);
    switch (type) {
      case "sine":
        return Math.sin(p * Math.PI * 2);
      case "triangle":
        return 1 - 4 * Math.abs(p - 0.5);
      case "square":
        return p < 0.5 ? 1 : -1;
      case "saw":
        return 2 * p - 1;
      default: {
        const _never = type;
        void _never;
        return 0;
      }
    }
  }

  function fillLushPad(seconds, layers, opts = {}) {
    const buf = allocStereo(seconds);
    const left = buf.getChannelData(0);
    const right = buf.getChannelData(1);
    const voices = layers.map((layer, index) => ({
      type: layer.type || "saw",
      freq: layer.freq,
      amp: layer.amp ?? 0.08,
      phase: (index * 0.19) % 1,
      detune: layer.detune || 0,
    }));
    const bright0 = opts.bright0 ?? 1400;
    const bright1 = opts.bright1 ?? 2800;
    const move = opts.move ?? 0.08;
    const drive = opts.drive ?? 1.35;
    const air = opts.air ?? 0.04;
    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const t = i / SR;
      const env = padEnvelope(t, seconds);
      const sweep = t / seconds;
      const lfo = 0.5 + 0.5 * Math.sin(t * move * Math.PI * 2);
      const cut = bright0 + (bright1 - bright0) * sweep * 0.72 + lfo * (opts.lfoHz ?? 380);
      const coeff = Math.exp((-2 * Math.PI * Math.max(80, cut)) / SR);
      let sl = 0;
      let sr = 0;
      for (const voice of voices) {
        const freq = voice.freq * (1 + voice.detune);
        voice.phase += freq / SR;
        if (voice.phase >= 1) voice.phase -= Math.floor(voice.phase);
        sl += oscSample(voice.type, voice.phase) * voice.amp;
        sr += oscSample(voice.type, voice.phase + 0.008 + lfo * 0.004) * voice.amp;
      }
      sl += (Math.random() * 2 - 1) * air;
      sr += (Math.random() * 2 - 1) * air;
      lpL = lpL * coeff + sl * (1 - coeff);
      lpR = lpR * coeff + sr * (1 - coeff);
      left[i] = Math.tanh(lpL * drive) * env;
      right[i] = Math.tanh(lpR * drive) * env;
    }
    return Promise.resolve(buf);
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
    amenLoop: async () => cloneBuffer(await getAmenCore()),
    amenChop: async () => rearrangeAmen(await getAmenCore(), AMEN_CHOP_MAP),
    amenFill: () => renderAmenFill(),
    amenRide: () => renderAmenRide(),
    padReese: () => fillLushPad(30, [
      { type: "square", freq: 51.91, amp: 0.16, detune: -0.006 },
      { type: "square", freq: 51.91, amp: 0.16, detune: 0.007 },
      { type: "saw", freq: 51.91, amp: 0.08, detune: 0.002 },
      { type: "sine", freq: 25.96, amp: 0.14 },
      { type: "sine", freq: 103.83, amp: 0.05 },
    ], { bright0: 280, bright1: 720, move: 0.045, drive: 1.8, lfoHz: 90, air: 0.012 }),
    padWarm: () => fillLushPad(30, [
      { type: "saw", freq: 138.59, amp: 0.09, detune: -0.004 },
      { type: "saw", freq: 138.59, amp: 0.09, detune: 0.005 },
      { type: "saw", freq: 164.81, amp: 0.07 },
      { type: "saw", freq: 207.65, amp: 0.065, detune: 0.003 },
      { type: "saw", freq: 246.94, amp: 0.055 },
      { type: "sine", freq: 311.13, amp: 0.055 },
      { type: "sine", freq: 69.3, amp: 0.1 },
      { type: "triangle", freq: 415.3, amp: 0.04 },
    ], { bright0: 900, bright1: 2600, move: 0.07, drive: 1.38, lfoHz: 420, air: 0.03 }),
    padChoir: () => fillLushPad(30, [
      { type: "sine", freq: 110, amp: 0.13 },
      { type: "sine", freq: 164.81, amp: 0.1, detune: 0.002 },
      { type: "sine", freq: 220, amp: 0.09 },
      { type: "sine", freq: 261.63, amp: 0.08, detune: -0.002 },
      { type: "sine", freq: 329.63, amp: 0.065 },
      { type: "triangle", freq: 440, amp: 0.045 },
      { type: "sine", freq: 554.37, amp: 0.036 },
      { type: "sine", freq: 55, amp: 0.08 },
    ], { bright0: 1600, bright1: 4200, move: 0.055, drive: 1.16, lfoHz: 260, air: 0.05 }),
    padHornet: () => fillLushPad(30, [
      { type: "saw", freq: 87.31, amp: 0.09, detune: -0.005 },
      { type: "saw", freq: 87.31, amp: 0.09, detune: 0.006 },
      { type: "saw", freq: 130.81, amp: 0.07 },
      { type: "saw", freq: 207.65, amp: 0.065 },
      { type: "saw", freq: 233.08, amp: 0.05, detune: 0.003 },
      { type: "triangle", freq: 311.13, amp: 0.05 },
      { type: "sine", freq: 43.65, amp: 0.09 },
    ], { bright0: 620, bright1: 1900, move: 0.06, drive: 1.5, lfoHz: 340, air: 0.022 }),
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
    pad: { color: "#e8c36a", choke: 0 },
    break: { color: "#ffb020", choke: 3 },
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

  const lushPad = {
    mode: "oneshot",
    attack: 0.16,
    decay: 2.8,
    sustain: 0.84,
    release: 2.6,
    filter: "lowpass",
  };

  const kitDefs = [
    {
      id: "jungle",
      name: "94 Amen",
      bpm: 164,
      pads: [
        pad("Amen", "loop", "amenLoop", {
          mode: "loop",
          choke: 3,
          color: "#ffb020",
          delay: 0.16,
          reverb: 0.1,
          cutoff: 13000,
        }),
        pad("Chop", "loop", "amenChop", {
          mode: "loop",
          choke: 3,
          color: "#ff7a18",
          delay: 0.2,
          reverb: 0.12,
        }),
        pad("Fill", "break", "amenFill", {
          mode: "oneshot",
          choke: 3,
          color: "#ff4d4d",
          reverb: 0.18,
          delay: 0.1,
        }),
        pad("Ride", "break", "amenRide", {
          mode: "oneshot",
          choke: 3,
          color: "#ffd36a",
          attack: 0.04,
          decay: 1.2,
          sustain: 0.8,
          release: 1.8,
          reverb: 0.16,
          delay: 0.12,
          volume: 0.92,
        }),
        pad("Reese", "pad", "padReese", {
          ...lushPad,
          color: "#5cff7a",
          volume: 0.58,
          cutoff: 3800,
          reverb: 0.2,
          delay: 0.08,
        }),
        pad("Warm", "pad", "padWarm", {
          ...lushPad,
          color: "#e8c36a",
          volume: 0.62,
          cutoff: 8200,
          reverb: 0.5,
          delay: 0.24,
        }),
        pad("Choir", "pad", "padChoir", {
          ...lushPad,
          color: "#c5a7ff",
          volume: 0.6,
          cutoff: 10000,
          reverb: 0.58,
          delay: 0.28,
        }),
        pad("Hornet", "pad", "padHornet", {
          ...lushPad,
          color: "#ff6b3c",
          volume: 0.6,
          cutoff: 6400,
          reverb: 0.42,
          delay: 0.2,
        }),
      ],
    },
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
    dummyCtx = new OfflineAudioContext(2, 1, SR);
    amenCorePromise = null;
    const needed = [...new Set(kitDefs.flatMap((def) => def.pads.map((src) => src.recipe)))];
    const cache = new Map();
    await Promise.all(needed.map(async (id) => {
      cache.set(id, await recipes[id]());
    }));
    const kits = [];
    for (const def of kitDefs) {
      const pads = [];
      for (let i = 0; i < def.pads.length; i += 1) {
        const src = def.pads[i];
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
