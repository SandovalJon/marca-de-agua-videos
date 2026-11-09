// Marca de Agua en videos · lógica 100% en el navegador
const $ = (sel) => document.querySelector(sel);

const state = { items: [], seq: 0 };
const MAX_W = 1920; // ancho máximo de salida (más rápido y más liviano)

const els = {
  fileInput: $("#file-input"),
  dropZone: $("#drop-zone"),
  text: $("#wm-text"),
  size: $("#wm-size"),
  sizeValue: $("#wm-size-value"),
  color: $("#wm-color"),
  colorHex: $("#wm-color-hex"),
  grid: $("#grid"),
  empty: $("#empty-state"),
  count: $("#count"),
  btnDownload: $("#btn-download"),
  btnClear: $("#btn-clear"),
  zipName: $("#zip-name"),
  status: $("#status"),
  lightbox: $("#lightbox"),
  lightboxCanvas: $("#lightbox-canvas"),
  lightboxName: $("#lightbox-name"),
  lightboxClose: $("#lightbox-close"),
};

const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

// % del ancho del video según el slider 1..10
const sizePct = () => 1.5 + Number(els.size.value) * 0.75;
const sizeLabel = () => {
  const v = Number(els.size.value);
  const pct = sizePct().toFixed(2) + "%";
  const palabra = v <= 2 ? "Pequeño" : v <= 4 ? "Mediano" : v <= 6 ? "Grande" : v <= 8 ? "Muy grande" : "Enorme";
  return `${palabra} (${pct})`;
};

const getSettings = () => ({ text: els.text.value, size: Number(els.size.value), color: els.color.value });

function setStatus(msg, isError = false) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function updateSummary() {
  els.count.textContent = state.items.length;
  const has = state.items.length > 0;
  els.btnDownload.disabled = !has;
  els.btnClear.disabled = !has;
  els.empty.style.display = has ? "none" : "block";
}

function fmtDur(sec) {
  if (!isFinite(sec) || sec == null || sec < 0) return "--:--";
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Dibuja el texto (50% opacidad, abajo a la derecha) sobre el frame ya dibujado
function drawWatermark(ctx, w, h, settings) {
  const text = settings.text.trim();
  if (!text) return;
  const pct = 1.5 + settings.size * 0.75;
  const fontSize = Math.max(11, Math.round(w * pct / 100));
  const pad = Math.max(6, Math.round(w * 0.025));
  ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const tw = ctx.measureText(text).width;
  const x = Math.max(pad, w - pad - tw);
  const y = h - pad;
  ctx.save();
  ctx.globalAlpha = 0.5; // requisito: 50% de opacidad
  ctx.fillStyle = settings.color;
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = Math.round(fontSize / 5);
  ctx.shadowOffsetY = Math.max(1, Math.round(fontSize / 18));
  ctx.fillText(text, x, y);
  ctx.restore();
}

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      if (!video.videoWidth) {
        URL.revokeObjectURL(url);
        reject(new Error(`No se pudo leer: ${file.name}`));
      } else {
        resolve({ video, url });
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Formato no soportado por tu navegador: ${file.name}`));
    };
    video.src = url;
  });
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    try { video.currentTime = t; } catch (e) { resolve(); }
    setTimeout(resolve, 3000); // por si el seek se atora
  });
}

async function renderThumb(item) {
  let video = null, url = null;
  try {
    ({ video, url } = await loadVideo(item.file));
    const d = video.duration;
    await seekTo(video, isFinite(d) && d > 0 ? Math.min(1, d / 3) : 0);
    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    item.thumbUrl = canvas.toDataURL("image/jpeg", 0.75);
    const node = els.grid.querySelector(`[data-id="${item.id}"] img`);
    if (node) node.src = item.thumbUrl;
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    if (video) video.src = "";
    if (url) URL.revokeObjectURL(url);
  }
}

function renderGrid() {
  els.grid.innerHTML = state.items.map(item => `
    <button class="thumb" data-id="${item.id}" title="Vista previa con marca: ${escapeHTML(item.file.name)}">
      <img src="${item.thumbUrl || ""}" alt="${escapeHTML(item.file.name)}">
      <span class="thumb-name">${escapeHTML(item.file.name)} · ${fmtDur(item.duration)}</span>
      <span class="thumb-remove" data-remove="${item.id}" role="button" aria-label="Quitar ${escapeHTML(item.file.name)}">✕</span>
    </button>`).join("");
  updateSummary();
}

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;
async function addFiles(fileList) {
  const files = [...fileList].filter(f =>
    (f.type && f.type.startsWith("video/")) || VIDEO_EXT.test(f.name || ""));
  if (!files.length) { setStatus("Solo se aceptan archivos de video.", true); return; }
  const nuevos = [];
  for (const file of files) {
    try {
      const { video, url } = await loadVideo(file); // valida que se puede decodificar
      const item = {
        id: ++state.seq, file,
        width: video.videoWidth, height: video.videoHeight,
        duration: video.duration, thumbUrl: null,
      };
      video.src = "";
      URL.revokeObjectURL(url);
      state.items.push(item);
      nuevos.push(item);
    } catch (e) {
      setStatus(e.message, true);
    }
  }
  renderGrid();
  for (const item of nuevos) await renderThumb(item);
  setStatus(nuevos.length ? `${nuevos.length} video(s) añadido(s).` : "");
}

function removeItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderGrid();
}

function clearAll() {
  state.items = [];
  els.grid.innerHTML = "";
  setStatus("");
  updateSummary();
}

// ---- Vista previa con marca en movimiento ----
let previewRAF = null, previewVideo = null, previewUrl = null;
function stopPreview() {
  if (previewRAF) cancelAnimationFrame(previewRAF);
  previewRAF = null;
  if (previewVideo) { try { previewVideo.pause(); } catch (e) {} previewVideo.src = ""; }
  previewVideo = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}
async function openPreview(item) {
  stopPreview();
  els.lightbox.hidden = false;
  els.lightboxName.textContent = `${item.file.name} · ${item.width}×${item.height} · ${fmtDur(item.duration)}`;
  try {
    ({ video: previewVideo, url: previewUrl } = await loadVideo(item.file));
    previewVideo.loop = true;
    const scale = Math.min(1, 960 / previewVideo.videoWidth);
    const canvas = els.lightboxCanvas;
    canvas.width = Math.max(2, Math.round(previewVideo.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(previewVideo.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    await previewVideo.play();
    const tick = () => {
      if (!previewVideo || els.lightbox.hidden) return;
      ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
      drawWatermark(ctx, canvas.width, canvas.height, getSettings());
      previewRAF = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    setStatus(e.message, true);
    closePreview();
  }
}
function closePreview() {
  stopPreview();
  els.lightbox.hidden = true;
}

// ---- Ruta MP4→MP4 con WebCodecs (mismo formato + audio original recodificado) ----
const MP4_LIKE = /\.(mp4|m4v|mov)$/i;

async function processVideoMp4(item, settings) {
  const { Muxer, ArrayBufferTarget } = await import("./vendor/mp4-muxer.mjs");
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined" ||
      typeof VideoFrame === "undefined" || typeof AudioData === "undefined") {
    throw new Error("sin WebCodecs");
  }
  const { video, url } = await loadVideo(item.file);
  try {
    const scale = Math.min(1, MAX_W / video.videoWidth);
    const w = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2);
    const h = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Audio original → PCM (conserva el sonido sin importar su codec de entrada)
    const AC0 = window.AudioContext || window.webkitAudioContext;
    if (!AC0) throw new Error("sin Web Audio");
    const ac = new AC0();
    let audioBuffer = null;
    try {
      if (ac.state === "suspended" && typeof ac.resume === "function") await ac.resume();
      audioBuffer = await ac.decodeAudioData(await item.file.arrayBuffer());
    } finally {
      try { if (ac.close) await ac.close(); } catch (e) {}
    }
    if (!audioBuffer) throw new Error("no se pudo leer el audio");
    const sampleRate = audioBuffer.sampleRate;
    const channels = Math.min(2, audioBuffer.numberOfChannels || 2);

    const vSup = await VideoEncoder.isConfigSupported({
      codec: "avc1.640028", width: w, height: h, bitrate: 8000000, framerate: 30,
    }).catch(() => ({ supported: false }));
    const aSup = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128000,
    }).catch(() => ({ supported: false }));
    if (!vSup.supported || !aSup.supported) throw new Error("codificadores no soportados");

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      video: { codec: "avc", width: w, height: h },
      audio: { codec: "aac", sampleRate, numberOfChannels: channels },
    });
    const vEnc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { throw e; },
    });
    vEnc.configure({ codec: "avc1.640028", width: w, height: h, bitrate: 8000000, framerate: 30 });
    const aEnc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw e; },
    });
    aEnc.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128000 });

    // Audio: PCM → AAC (trozos de 1024 muestras, f32 planar)
    const FR = 1024;
    const total = audioBuffer.length;
    const chData = [];
    for (let c = 0; c < channels; c++) chData.push(audioBuffer.getChannelData(c));
    for (let off = 0, ts = 0; off < total; off += FR) {
      const n = Math.min(FR, total - off);
      const buf = new ArrayBuffer(n * channels * 4);
      const f32 = new Float32Array(buf);
      for (let c = 0; c < channels; c++) f32.set(chData[c].subarray(off, off + n), c * n);
      const ad = new AudioData({
        format: "f32-planar", sampleRate, numberOfFrames: n,
        numberOfChannels: channels, timestamp: ts, data: buf,
      });
      ts += Math.round((n / sampleRate) * 1e6);
      aEnc.encode(ad);
      ad.close();
    }
    await aEnc.flush();

    // Video: <video> → canvas con marca → H.264 (timestamps reales de presentación)
    const FRAME_US = Math.round(1e6 / 30);
    video.muted = true;
    // En el DOM (invisible): rVFC no siempre dispara en videos sueltos
    try {
      video.setAttribute("playsinline", "");
      video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
      document.body.appendChild(video);
    } catch (e) {}
    try { video.currentTime = 0; } catch (e) {}
    await new Promise((resolve, reject) => {
      let frames = 0, done = false;
      const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve(); } };
      const onFrame = (now, meta) => {
        if (done) return;
        try {
          ctx.drawImage(video, 0, 0, w, h);
          drawWatermark(ctx, w, h, settings);
          const vf = new VideoFrame(canvas, {
            timestamp: Math.round(meta.mediaTime * 1e6), duration: FRAME_US,
          });
          vEnc.encode(vf, { keyFrame: frames % 120 === 0 });
          vf.close();
          frames++;
        } catch (e) { finish(e); return; }
        if (!video.ended && !video.paused) {
          try { video.requestVideoFrameCallback(onFrame); }
          catch (e) { finish(new Error("sin requestVideoFrameCallback")); }
        }
      };
      video.onended = () => finish();
      video.onerror = () => finish(new Error("error al reproducir para codificar"));
      const guard = Math.min(4 * 3600, (isFinite(video.duration) ? video.duration : 60) + 20) * 1000;
      setTimeout(() => finish(), guard);
      video.play().then(() => {
        try { video.requestVideoFrameCallback(onFrame); }
        catch (e) { finish(new Error("sin requestVideoFrameCallback")); }
      }).catch(finish);
    });
    await vEnc.flush();
    try { vEnc.close(); } catch (e) {}
    try { aEnc.close(); } catch (e) {}
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    try { video.pause(); } catch (e) {}
    try { video.remove(); } catch (e) {}
    video.src = "";
    URL.revokeObjectURL(url);
  }
}

// ---- Procesado por lote: re-graba cada video con la marca ----
function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const cands = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return cands.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "";
}

async function processVideo(item, settings, mime) {
  const { video, url } = await loadVideo(item.file);
  try {
    const scale = Math.min(1, MAX_W / video.videoWidth);
    const w = Math.max(2, Math.round(video.videoWidth * scale));
    const h = Math.max(2, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Audio: se rutea al stream grabado para conservarlo (sin sonar durante el proceso)
    let audioTracks = [];
    let ac = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ac = new AC();
        if (ac.state === "suspended" && typeof ac.resume === "function") await ac.resume();
        const srcNode = ac.createMediaElementSource(video);
        const dest = ac.createMediaStreamDestination();
        srcNode.connect(dest);
        audioTracks = dest.stream.getAudioTracks();
      }
    } catch (e) { audioTracks = []; }

    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks(), ...audioTracks];
    if (!tracks.length) throw new Error("Tu navegador no permite capturar este video.");
    const rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime || undefined,
      videoBitsPerSecond: 8000000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { rec.onstop = resolve; });

    try { video.currentTime = 0; } catch (e) {}
    rec.start(500);
    await video.play();
    await new Promise((resolve) => {
      let finished = false;
      const done = () => { if (!finished) { finished = true; resolve(); } };
      video.onended = done;
      const guard = Math.min(4 * 3600, (isFinite(video.duration) ? video.duration : 60) + 15) * 1000;
      setTimeout(done, guard);
      const pump = () => {
        if (finished || video.ended) return;
        try { ctx.drawImage(video, 0, 0, w, h); } catch (e) {}
        drawWatermark(ctx, w, h, settings);
        requestAnimationFrame(pump);
      };
      pump();
    });
    // último frame por si el loop terminó antes
    try { ctx.drawImage(video, 0, 0, w, h); } catch (e) {}
    drawWatermark(ctx, w, h, settings);
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    return new Blob(chunks, { type: rec.mimeType || "video/webm" });
  } finally {
    try { video.pause(); } catch (e) {}
    try { if (ac && typeof ac.close === "function") await ac.close(); } catch (e) {}
    video.src = "";
    URL.revokeObjectURL(url);
  }
}

// ---- Eventos ----
els.fileInput.addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });

["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) els.dropZone.classList.add("drag");
}));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  if (ev === "drop" || e.target === document || !document.contains(e.relatedTarget)) els.dropZone.classList.remove("drag");
}));
document.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

let debounceTimer = null;
function scheduleRefresh() {
  els.sizeValue.textContent = sizeLabel();
  els.colorHex.textContent = els.color.value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => state.items.forEach(renderThumb), 200);
}
els.size.addEventListener("input", scheduleRefresh);
els.color.addEventListener("input", scheduleRefresh);
els.text.addEventListener("input", scheduleRefresh);
document.querySelectorAll(".preset").forEach(btn =>
  btn.addEventListener("click", () => { els.color.value = btn.dataset.color; scheduleRefresh(); }));

els.grid.addEventListener("click", async e => {
  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) { e.stopPropagation(); removeItem(Number(removeBtn.dataset.remove)); return; }
  const thumb = e.target.closest(".thumb[data-id]");
  if (!thumb) return;
  const item = state.items.find(i => i.id === Number(thumb.dataset.id));
  if (!item) return;
  openPreview(item);
});

els.lightboxClose.addEventListener("click", closePreview);
els.lightbox.addEventListener("click", e => { if (e.target === els.lightbox) closePreview(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closePreview(); });

els.btnClear.addEventListener("click", clearAll);

els.btnDownload.addEventListener("click", async () => {
  if (!state.items.length || typeof JSZip === "undefined") {
    setStatus("No se pudo cargar el compresor ZIP (vendor/jszip.min.js).", true);
    return;
  }
  if (typeof MediaRecorder === "undefined" ||
      !HTMLCanvasElement.prototype.captureStream) {
    setStatus("Tu navegador no soporta grabar video (MediaRecorder). Usa Chrome o Edge.", true);
    return;
  }
  const mime = pickMime();
  els.btnDownload.disabled = true;
  const original = els.btnDownload.textContent;
  try {
    const zip = new JSZip();
    const usedNames = new Set();
    const uniqueName = (name) => {
      if (!usedNames.has(name.toLowerCase())) { usedNames.add(name.toLowerCase()); return name; }
      const dot = name.lastIndexOf(".");
      const stem = dot > -1 ? name.slice(0, dot) : name;
      const ext = dot > -1 ? name.slice(dot) : "";
      let n = 2;
      while (usedNames.has(`${stem} (${n})${ext}`.toLowerCase())) n++;
      const finalName = `${stem} (${n})${ext}`;
      usedNames.add(finalName.toLowerCase());
      return finalName;
    };

    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      els.btnDownload.textContent = `Procesando ${i + 1}/${state.items.length}… (${item.file.name})`;
      const dot = (item.file.name || "video").lastIndexOf(".");
      const base = (dot > -1 ? item.file.name.slice(0, dot) : item.file.name).replace(/[\\/:*?"<>|]/g, "_");
      // MP4/MOV → mismo formato MP4 con audio; resto o fallo → WebM
      const mp4Like = MP4_LIKE.test(item.file.name || "") || item.file.type === "video/mp4";
      let blob = null, ext = "webm";
      if (mp4Like) {
        try {
          setStatus(`Marcando ${i + 1}/${state.items.length}: ${item.file.name} (MP4 con audio)…`);
          blob = await processVideoMp4(item, getSettings());
          ext = "mp4";
        } catch (e) {
          setStatus(`MP4 no disponible (${e.message || e}), usando WebM para: ${item.file.name}`);
        }
      }
      if (!blob) {
        setStatus(`Marcando ${i + 1}/${state.items.length}: ${item.file.name} (WebM, tarda lo que dura el video)…`);
        blob = await processVideo(item, getSettings(), mime);
      }
      zip.file(uniqueName(`${base}.${ext}`), blob);
    }

    els.btnDownload.textContent = "Comprimiendo…";
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    let zipName = (els.zipName.value || "videos-con-marca-de-agua.zip").trim().replace(/[\\/:*?"<>|]/g, "_");
    if (!zipName.toLowerCase().endsWith(".zip")) zipName += ".zip";

    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: zipName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`ZIP descargado: ${zipName} (${state.items.length} videos).`);
  } catch (err) {
    setStatus("Error al generar el ZIP: " + err.message, true);
  } finally {
    els.btnDownload.disabled = false;
    els.btnDownload.textContent = original;
  }
});

// Valores iniciales
els.sizeValue.textContent = sizeLabel();
updateSummary();
