(() => {
  const VOICE_COUNT = 32;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class Voice {
    constructor(engine) {
      const ctx = engine.ctx;
      this.engine = engine;
      this.source = null;
      this.gain = ctx.createGain();
      this.filter = ctx.createBiquadFilter();
      this.sendRev = ctx.createGain();
      this.sendDly = ctx.createGain();
      this.filter.connect(this.gain);
      this.gain.connect(engine.busIn);
      this.gain.connect(this.sendRev);
      this.gain.connect(this.sendDly);
      this.sendRev.connect(engine.reverbIn);
      this.sendDly.connect(engine.delayIn);
      this.gain.gain.value = 0;
      this.sendRev.gain.value = 0;
      this.sendDly.gain.value = 0;
      this.filter.frequency.value = 12000;
      this.busyUntil = 0;
      this.padIndex = -1;
    }

    stop(when = 0) {
      const t = Math.max(when, this.engine.ctx.currentTime);
      try {
        this.gain.gain.cancelScheduledValues(t);
        this.gain.gain.setTargetAtTime(0.0001, t, 0.008);
        if (this.source) {
          this.source.stop(t + 0.03);
        }
      } catch {
        /* already stopped */
      }
      this.busyUntil = t + 0.04;
      this.padIndex = -1;
    }

    trigger(buffer, pad, velocity, when) {
      const ctx = this.engine.ctx;
      const time = Math.max(when, ctx.currentTime);
      if (this.source) {
        try {
          this.source.disconnect();
          this.source.stop(time);
        } catch {
          /* ignore */
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.pow(2, (pad.pitch || 0) / 12);
      source.loop = pad.mode === "loop";
      source.connect(this.filter);
      this.source = source;
      this.padIndex = pad.index;

      const vel = clamp(velocity, 0.05, 1);
      const cutoffBase = pad.cutoff ?? 12000;
      const cutoff = pad.filter === "highpass"
        ? clamp(cutoffBase * (0.45 + vel * 0.7), 80, 18000)
        : clamp(cutoffBase * (0.25 + vel * 0.9), 180, 18000);
      this.filter.type = pad.filter === "highpass" ? "highpass" : "lowpass";
      this.filter.frequency.setValueAtTime(cutoff, time);
      this.filter.Q.setValueAtTime(0.7 + vel * 0.4, time);

      this.sendRev.gain.setValueAtTime((pad.reverb ?? 0.08) * (0.6 + vel * 0.5), time);
      this.sendDly.gain.setValueAtTime((pad.delay ?? 0) * (0.5 + vel * 0.6), time);

      const peak = (pad.volume ?? 1) * vel * 0.95;
      const a = Math.max(0.001, (pad.attack ?? 0.002));
      const d = Math.max(0.01, (pad.decay ?? 0.18));
      const s = clamp(pad.sustain ?? 0, 0, 1);
      const r = Math.max(0.01, (pad.release ?? 0.08));
      const g = this.gain.gain;
      g.cancelScheduledValues(time);
      g.setValueAtTime(0.0001, time);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + a);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak * Math.max(s, 0.0002)), time + a + d);

      const duration = source.loop ? 3600 : buffer.duration / source.playbackRate.value;
      if (!source.loop) {
        const releaseAt = time + Math.max(a + d, duration - r);
        g.setTargetAtTime(0.0001, releaseAt, r / 3);
      }

      source.start(time);
      if (!source.loop) {
        source.stop(time + duration + 0.02);
      }
      this.busyUntil = source.loop ? time + 3600 : time + duration + 0.05;
      return { time, duration };
    }
  }

  function makeImpulse(ctx, seconds = 2.8, decay = 2.6) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  class AudioEngine {
    constructor() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive", sampleRate: 44100 });
      this.lookahead = 0.025;
      this.latencyComp = 0;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.82;
      this.busIn = this.ctx.createGain();
      this.kickBus = this.ctx.createGain();
      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1;
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 3.2;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.14;

      this.reverbIn = this.ctx.createGain();
      this.reverbIn.gain.value = 1;
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeImpulse(this.ctx);
      this.reverbWet = this.ctx.createGain();
      this.reverbWet.gain.value = 0.34;

      this.delayIn = this.ctx.createGain();
      this.delay = this.ctx.createDelay(1.2);
      this.delay.delayTime.value = 0.21;
      this.delayFb = this.ctx.createGain();
      this.delayFb.gain.value = 0.32;
      this.delayWet = this.ctx.createGain();
      this.delayWet.gain.value = 0.18;
      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = "lowpass";
      this.delayFilter.frequency.value = 3200;

      this.metroGain = this.ctx.createGain();
      this.metroGain.gain.value = 0.18;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;

      this.busIn.connect(this.duckGain);
      this.kickBus.connect(this.compressor);
      this.duckGain.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.reverbIn.connect(this.reverb);
      this.reverb.connect(this.reverbWet);
      this.reverbWet.connect(this.masterGain);
      this.delayIn.connect(this.delay);
      this.delay.connect(this.delayFilter);
      this.delayFilter.connect(this.delayWet);
      this.delayFilter.connect(this.delayFb);
      this.delayFb.connect(this.delay);
      this.delayWet.connect(this.masterGain);
      this.metroGain.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(this.ctx.destination);

      this.voices = Array.from({ length: VOICE_COUNT }, () => new Voice(this));
      this.sidechain = true;
      this.buffers = new Map();
    }

    get outputLatency() {
      const ctx = this.ctx;
      return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    }

    async resume() {
      if (this.ctx.state !== "running") {
        await this.ctx.resume();
      }
      const silent = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = silent;
      src.connect(this.ctx.destination);
      src.start();
    }

    setMaster(value) {
      this.masterGain.gain.setTargetAtTime(clamp(value, 0, 1.2), this.ctx.currentTime, 0.02);
    }

    setReverb(value) {
      this.reverbWet.gain.setTargetAtTime(clamp(value, 0, 1), this.ctx.currentTime, 0.03);
    }

    setDelay(value) {
      this.delayWet.gain.setTargetAtTime(clamp(value, 0, 1), this.ctx.currentTime, 0.03);
    }

    setDelayTime(seconds) {
      this.delay.delayTime.setTargetAtTime(clamp(seconds, 0.05, 1), this.ctx.currentTime, 0.02);
    }

    registerBuffer(id, buffer) {
      this.buffers.set(id, buffer);
    }

    getBuffer(id) {
      return this.buffers.get(id) || null;
    }

    acquireVoice(pad) {
      const now = this.ctx.currentTime;
      if (pad.choke) {
        for (const voice of this.voices) {
          if (voice.padIndex >= 0) {
            const other = pad.kit?.pads?.[voice.padIndex];
            if (other && other.choke === pad.choke) {
              voice.stop(now);
            }
          }
        }
      }
      let best = this.voices[0];
      for (const voice of this.voices) {
        if (voice.busyUntil <= now) return voice;
        if (voice.busyUntil < best.busyUntil) best = voice;
      }
      best.stop(now);
      return best;
    }

    playPad(pad, velocity, when = this.ctx.currentTime, opts = {}) {
      const buffer = this.getBuffer(pad.bufferId);
      if (!buffer) return null;
      const voice = this.acquireVoice(pad);
      voice.gain.disconnect();
      voice.gain.connect(pad.role === "kick" ? this.kickBus : this.busIn);
      voice.gain.connect(voice.sendRev);
      voice.gain.connect(voice.sendDly);
      const result = voice.trigger(buffer, pad, velocity, when + (this.latencyComp || 0));
      if (this.sidechain && pad.role === "kick" && !opts.skipDuck) {
        this.duck(result.time);
      }
      return { voice, ...result };
    }

    stopPad(padIndex, when = this.ctx.currentTime) {
      for (const voice of this.voices) {
        if (voice.padIndex === padIndex) voice.stop(when);
      }
    }

    duck(time) {
      const g = this.duckGain.gain;
      g.cancelScheduledValues(time);
      g.setValueAtTime(g.value, time);
      g.linearRampToValueAtTime(0.38, time + 0.012);
      g.setTargetAtTime(1, time + 0.04, 0.11);
    }

    click(time, accent = false) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = accent ? 1320 : 880;
      gain.gain.setValueAtTime(accent ? 0.22 : 0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      osc.connect(gain);
      gain.connect(this.metroGain);
      osc.start(time);
      osc.stop(time + 0.05);
    }

    async renderOffline(events, duration, bpm) {
      const sr = this.ctx.sampleRate;
      const offline = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
      const master = offline.createGain();
      master.gain.value = this.masterGain.gain.value;
      const verb = offline.createConvolver();
      verb.buffer = makeImpulse(offline, 1.6, 2);
      const verbWet = offline.createGain();
      verbWet.gain.value = this.reverbWet.gain.value;
      master.connect(offline.destination);
      verb.connect(verbWet).connect(master);
      for (const event of events) {
        const buffer = this.getBuffer(event.bufferId);
        if (!buffer) continue;
        const src = offline.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = Math.pow(2, (event.pitch || 0) / 12);
        const gain = offline.createGain();
        const peak = Math.max(0.0002, (event.volume ?? 1) * event.velocity);
        gain.gain.setValueAtTime(0.0001, event.time);
        gain.gain.exponentialRampToValueAtTime(peak, event.time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0002, event.time + Math.max(0.08, buffer.duration * 0.9));
        src.connect(gain);
        gain.connect(master);
        if ((event.reverb || 0) > 0.04) {
          const send = offline.createGain();
          send.gain.value = event.reverb * 0.7;
          gain.connect(send).connect(verb);
        }
        src.start(event.time);
      }
      void bpm;
      return offline.startRendering();
    }
  }

  function bufferToWav(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, i) => audioBuffer.getChannelData(i));
    let offset = 44;
    for (let i = 0; i < samples; i += 1) {
      for (let ch = 0; ch < channels; ch += 1) {
        const sample = clamp(channelData[ch][i], -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  window.PulseAudio = { AudioEngine, bufferToWav };
})();
