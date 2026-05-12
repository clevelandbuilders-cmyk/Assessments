/* Canvas annotation engine */
window.annotator = (() => {
  const baseCanvas = document.getElementById('baseCanvas');
  const annCanvas  = document.getElementById('annotationCanvas');
  const bCtx       = baseCanvas.getContext('2d');
  const aCtx       = annCanvas.getContext('2d');

  let currentPhoto = null;
  let activeTool   = 'select';
  let color        = '#ff3b30';
  let strokeSize   = 4;
  let drawing      = false;
  let startX, startY, snapshot;
  let history = [];

  /* ── Tool buttons ───────────────────────────────────────────────────── */
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      annCanvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    });
  });

  document.getElementById('toolColor').addEventListener('input', e => { color = e.target.value; });
  document.getElementById('toolSize').addEventListener('change', e => { strokeSize = parseInt(e.target.value); });
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all annotations?')) {
      history = [];
      aCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    }
  });
  document.getElementById('saveAnnotationBtn').addEventListener('click', saveAnnotation);

  /* ── Load photo ─────────────────────────────────────────────────────── */
  function load(photo) {
    currentPhoto = photo;
    history = [];

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const container = document.getElementById('canvasContainer');
      const maxW  = container.clientWidth  - 32;
      const maxH  = container.clientHeight - 32;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);

      baseCanvas.width  = annCanvas.width  = w;
      baseCanvas.height = annCanvas.height = h;
      baseCanvas.style.width  = annCanvas.style.width  = w + 'px';
      baseCanvas.style.height = annCanvas.style.height = h + 'px';

      bCtx.drawImage(img, 0, 0, w, h);
      aCtx.clearRect(0, 0, w, h);

      // Load existing annotation layer if present
      if (photo.annotationsUrl) {
        const overlay = new Image();
        overlay.crossOrigin = 'anonymous';
        overlay.onload = () => { aCtx.drawImage(overlay, 0, 0, w, h); };
        overlay.src = photo.annotationsUrl;
      }
    };
    img.src = photo.originalUrl;
  }

  /* ── Pointer helpers ────────────────────────────────────────────────── */
  function pos(e) {
    const r      = annCanvas.getBoundingClientRect();
    const scaleX = annCanvas.width  / r.width;
    const scaleY = annCanvas.height / r.height;
    const src    = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  }

  annCanvas.addEventListener('mousedown',  onDown);
  annCanvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });
  annCanvas.addEventListener('mousemove',  onMove);
  annCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e); }, { passive: false });
  annCanvas.addEventListener('mouseup',    onUp);
  annCanvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(e); },  { passive: false });

  function onDown(e) {
    if (activeTool === 'select') return;
    const p = pos(e);
    startX = p.x; startY = p.y;

    if (activeTool === 'text') {
      const text = prompt('Enter text:');
      if (!text) return;
      pushHistory();
      const fontSize = Math.max(16, strokeSize * 5);
      aCtx.font         = `bold ${fontSize}px -apple-system, sans-serif`;
      aCtx.fillStyle    = color;
      aCtx.strokeStyle  = 'rgba(0,0,0,0.55)';
      aCtx.lineWidth    = fontSize / 10;
      aCtx.strokeText(text, p.x, p.y);
      aCtx.fillText(text, p.x, p.y);
      return;
    }

    drawing  = true;
    snapshot = aCtx.getImageData(0, 0, annCanvas.width, annCanvas.height);
  }

  function onMove(e) {
    if (!drawing) return;
    const p = pos(e);
    aCtx.putImageData(snapshot, 0, 0);
    aCtx.strokeStyle = color;
    aCtx.lineWidth   = strokeSize;
    aCtx.lineCap     = 'round';
    aCtx.lineJoin    = 'round';

    if (activeTool === 'arrow')  drawArrow(aCtx, startX, startY, p.x, p.y);
    if (activeTool === 'circle') drawEllipse(aCtx, startX, startY, p.x, p.y);
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    pushHistory();
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const headLen = Math.max(14, strokeSize * 4);
    const angle   = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawEllipse(ctx, x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.max(Math.abs(x2 - x1) / 2, 1);
    const ry = Math.max(Math.abs(y2 - y1) / 2, 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /* ── History ────────────────────────────────────────────────────────── */
  function pushHistory() {
    history.push(aCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));
    if (history.length > 30) history.shift();
  }

  function undo() {
    if (!history.length) return;
    history.pop();
    if (history.length) {
      aCtx.putImageData(history[history.length - 1], 0, 0);
    } else {
      aCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    }
  }

  /* ── Save to Firebase Storage ───────────────────────────────────────── */
  async function saveAnnotation() {
    if (!currentPhoto) return;
    const saving = document.getElementById('annotatorSaving');
    const saveBtn = document.getElementById('saveAnnotationBtn');
    saving.hidden  = false;
    saveBtn.disabled = true;

    try {
      // Merge base + annotation into JPEG
      const merged = document.createElement('canvas');
      merged.width  = baseCanvas.width;
      merged.height = baseCanvas.height;
      const mCtx = merged.getContext('2d');
      mCtx.drawImage(baseCanvas,  0, 0);
      mCtx.drawImage(annCanvas, 0, 0);

      const [annotatedBlob, annotationsBlob] = await Promise.all([
        canvasToBlob(merged,    'image/jpeg', 0.92),
        canvasToBlob(annCanvas, 'image/png'),
      ]);

      await DB.saveAnnotations(currentPhoto.id, annotatedBlob, annotationsBlob);

      document.getElementById('photoModal').hidden = true;
      showToast('Annotation saved.');
    } catch (e) {
      showToast('Save failed. Please try again.');
      console.error(e);
    } finally {
      saving.hidden    = false;
      saveBtn.disabled = false;
      saving.hidden    = true;
    }
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
  }

  return {
    load,
    get currentPhotoId() { return currentPhoto?.id ?? null; },
  };
})();
