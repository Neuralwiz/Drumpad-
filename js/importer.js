(() => {
  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Den här webbläsaren saknar DecompressionStream för zip.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function readUtf8(bytes, start, length) {
    return new TextDecoder().decode(bytes.subarray(start, start + length));
  }

  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const files = [];
    let offset = 0;
    while (offset + 30 <= bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig === SIG_CENTRAL || sig === 0x06054b50) break;
      if (sig !== SIG_LOCAL) {
        offset += 1;
        continue;
      }
      const method = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const name = readUtf8(bytes, offset + 30, nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const compressed = bytes.subarray(dataStart, dataStart + compSize);
      offset = dataStart + compSize;
      if (name.endsWith("/")) continue;
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = await inflateRaw(compressed);
      else continue;
      files.push({ name, data });
    }
    return files;
  }

  const AUDIO_EXT = /\.(wav|wave|mp3|mpeg|ogg|oga|aif|aiff|flac|m4a)$/i;
  const SKIP_PATH = /(house|disco|nu[\s_-]?disco|tech[\s_-]?house|og house|phil weeks|s\.?k\.?t|909 fill|acapella|acapellas|vocal collection|mantra vocal|leo wood|keys|strings|brass|wind|midi\/|\/midi|serum|rex2|construction kit|melodic loop|bass loop)/i;
  const ONESHOT_PATH = /(one[\s_-]?shot|drum hit|drum one|kicks?\/|snares?\/|hats?\/|perc\/|jungle|dnb|d&b|drum ?& ?bass|amen|break)/i;

  const RULES = [
    { role: "kick", re: /(kick|bd_|_bd|bassdrum|808|boom|kik)/i },
    { role: "snare", re: /(snare|snr|sd_|_sd|rimshot|amen)/i },
    { role: "clap", re: /(clap|clp|handclap)/i },
    { role: "hat", re: /(closed[-_ ]?h|chh|hhc|hi[-_ ]?hat[-_ ]?c|hat[-_ ]?closed)/i },
    { role: "hat", re: /(open[-_ ]?h|ohh|hho|hi[-_ ]?hat[-_ ]?o|hat[-_ ]?open)/i },
    { role: "hat", re: /(hi[-_ ]?hat|hat|hh_)/i },
    { role: "tom", re: /(tom|floor)/i },
    { role: "cym", re: /(crash|ride|cym|china)/i },
    { role: "perc", re: /(perc|shaker|tamb|conga|bongo|clave|cowbell|rim|top)/i },
    { role: "fx", re: /(fx|riser|sweep|impact|stab|reese|vox|vocal)/i },
    { role: "loop", re: /(loop|break|groove|beat|amen)/i },
  ];

  const SLOT_PREF = [
    "kick", "snare", "clap", "hat",
    "kick", "snare", "perc", "hat",
    "tom", "tom", "perc", "cym",
    "fx", "cym", "fx", "loop",
  ];

  function classify(name) {
    const base = name.split("/").pop() || name;
    for (const rule of RULES) {
      if (rule.re.test(base)) return { role: rule.role, label: base.replace(AUDIO_EXT, "") };
    }
    return { role: "perc", label: base.replace(AUDIO_EXT, "") };
  }

  function prettyName(fileName) {
    return fileName
      .split("/")
      .pop()
      .replace(AUDIO_EXT, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .slice(0, 18);
  }

  function shouldImport(name) {
    if (!AUDIO_EXT.test(name)) return false;
    if (SKIP_PATH.test(name) && !ONESHOT_PATH.test(name)) return false;
    return true;
  }

  function guessBpm(name) {
    if (/(jungle|dnb|d&b|drum ?& ?bass|roller|amen|halftime)/i.test(name)) return 174;
    if (/(trap|808)/i.test(name)) return 140;
    if (/(boom|bap|hip)/i.test(name)) return 92;
    return 174;
  }

  async function decodeFiles(engine, files) {
    const decoded = [];
    const ranked = files.slice().sort((a, b) => Number(ONESHOT_PATH.test(b.name)) - Number(ONESHOT_PATH.test(a.name)));
    for (const file of ranked) {
      if (!shouldImport(file.name)) continue;
      try {
        const copy = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength);
        const buffer = await engine.ctx.decodeAudioData(copy);
        decoded.push({ name: file.name, buffer, ...classify(file.name) });
      } catch {
        /* skip undecodable */
      }
    }
    return decoded;
  }

  function mapToKit(engine, decoded, kitName) {
    const id = `import-${Date.now()}`;
    const used = new Set();
    const pads = SLOT_PREF.map((wanted, index) => {
      let pick = decoded.find((item, i) => !used.has(i) && item.role === wanted);
      if (!pick) pick = decoded.find((item, i) => !used.has(i));
      if (pick) used.add(decoded.indexOf(pick));
      const meta = window.PulseKits.roleMeta[wanted] || window.PulseKits.roleMeta.perc;
      const bufferId = `${id}-${index}`;
      if (pick) engine.registerBuffer(bufferId, pick.buffer);
      return {
        name: pick ? prettyName(pick.name) : `Pad ${index + 1}`,
        role: pick?.role || wanted,
        color: meta.color,
        mode: wanted === "loop" && pick?.role === "loop" ? "loop" : "oneshot",
        choke: meta.choke,
        pitch: 0,
        volume: 1,
        attack: 0.002,
        decay: 0.22,
        sustain: 0,
        release: 0.08,
        filter: wanted === "hat" ? "highpass" : "lowpass",
        cutoff: wanted === "hat" ? 8000 : 14000,
        reverb: wanted === "cym" || wanted === "fx" ? 0.2 : 0.08,
        delay: 0,
        index,
        bufferId,
      };
    });
    return {
      id,
      name: kitName || "Imported Pack",
      bpm: guessBpm(kitName || ""),
      builtIn: false,
      pads,
    };
  }

  async function importList(engine, fileList) {
    const files = [];
    for (const file of fileList) {
      const buffer = await file.arrayBuffer();
      if (/\.zip$/i.test(file.name)) {
        const extracted = await unzip(buffer);
        files.push(...extracted);
      } else {
        files.push({ name: file.name, data: new Uint8Array(buffer) });
      }
    }
    const decoded = await decodeFiles(engine, files);
    if (!decoded.length) {
      throw new Error("Inga avkodningsbara samples hittades.");
    }
    const kitName = fileList.length === 1 ? fileList[0].name.replace(/\.zip$/i, "") : "Custom Kit";
    return mapToKit(engine, decoded, kitName.slice(0, 28));
  }

  window.PulseImport = { importList, unzip, classify };
})();
