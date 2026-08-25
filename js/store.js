(() => {
  const DB_NAME = "pulse-db";
  const STORE = "kv";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(key, value) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(value, key);
    });
    db.close();
  }

  async function get(key) {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  }

  function encodeBuffer(buffer) {
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i += 1) {
      channels.push(buffer.getChannelData(i).slice(0));
    }
    return { sr: buffer.sampleRate, channels };
  }

  function decodeBuffer(engine, encoded) {
    if (!encoded?.channels?.length) return null;
    const length = encoded.channels[0].length;
    const buffer = engine.ctx.createBuffer(encoded.channels.length, length, encoded.sr);
    encoded.channels.forEach((data, channel) => buffer.copyToChannel(data, channel));
    return buffer;
  }

  function serializeKit(engine, kit) {
    return {
      id: kit.id,
      name: kit.name,
      bpm: kit.bpm,
      builtIn: !!kit.builtIn,
      pads: kit.pads.map((pad) => ({
        ...pad,
        pcm: encodeBuffer(engine.getBuffer(pad.bufferId)),
      })),
    };
  }

  function restoreKit(engine, packed) {
    const pads = packed.pads.map((pad, index) => {
      const { pcm, ...rest } = pad;
      const buffer = decodeBuffer(engine, pcm);
      if (buffer) engine.registerBuffer(rest.bufferId || `${packed.id}-${index}`, buffer);
      return { ...rest, index, bufferId: rest.bufferId || `${packed.id}-${index}` };
    });
    return {
      id: packed.id,
      name: packed.name,
      bpm: packed.bpm,
      builtIn: false,
      pads,
    };
  }

  window.PulseStore = { put, get, encodeBuffer, decodeBuffer, serializeKit, restoreKit };
})();
