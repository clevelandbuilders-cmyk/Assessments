/* Canvas annotation engine */
window.annotator = (() => {
  const baseCanvas = document.getElementById('baseCanvas');
  const annCanvas = document.getElementById('annotationCanvas');
  const bCtx = baseCanvas.getContext('2d');
  const aCtx = annCanvas.getContext('2d');

  let currentPhoto = null;
  let activeTool = 'select';
  let color = '#ff3b30';
  let strokeSize = 4;
  let drawing = false;
  let startX, startY;
  let history = [];  // snapshots of annotation canvas imageData

  /* ---- Tool buttons ---- */
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
    if (confirm('Clear all annotations?')) { history = []; aCtx.clearRect(0, 0, annCanvas.width, annCanvas.height); }
  });

  document.getElementById('saveAnnotationBtn').addEventListener('click', saveAnnotation);

  /* ---- Load photo ---- */
  function load(photo) {
    currentPhoto = photo;
    history = [];
    const img = new Image();
    img.onload = () => {
      const container = document.getElementById('canvasContainer');
      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 32;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      baseCanvas.width = annCanvas.width = w;
      baseCanvas.height = annCanvas.height = h;
      baseCanvas.style.width = annCanvas.style.width = w + 'px';
      baseCanvas.style.height = annCanvas.style.height = h + 'px';

      bCtx.drawImage(img, 0, 0, w, h);

      if (photo.annotations) {
        const ai = new Image();
        ai.onload = () => aCtx.drawImage(ai, 0, 0);
        ai.src = photo.annotations;
      } else {
        aCtx.clearRect(0, 0, w, h);
      }
    };
    img.src = photo.annotated || photo.src;
  }

  /* ---- Mouse helpers ---- */
  function pos(e) {
    const r = annCanvas.getBoundingClientRect();
    const scaleX = annCanvas.width / r.width;
    const scaleY = annCanvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  }

  /* ---- Draw ---- */
  let snapshot = null;

  annCanvas.addEventListener('mousedown', onDown);
  annCanvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });

  annCanvas.addEventListener('mousemove', onMove);
  annCanvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });

  annCanvas.addEventListener('mouseup', onUp);
  annCanvas.addEventListener('touchend', e => { e.preventDefault(); onUp(e); }, { passive: false });

  function onDown(e) {
    if (activeTool === 'select') return;
    const p = pos(e);
    startX = p.x; startY = p.y;
    drawing = true;

    if (activeTool === 'text') {
      drawing = false;
      const text = prompt('Enter text:');
      if (!text) return;
      pushHistory();
      aCtx.font = `${Math.max(16, strokeSize * 5)}px -apple-system, sans-serif`;
      aCtx.fillStyle = color;
      aCtx.strokeStyle = 'rgba(0,0,0,0.5)';
      aCtx.lineWidth = 1;
      aCtx.strokeText(text, p.x, p.y);
      aCtx.fillText(text, p.x, p.y);
      return;
    }
    snapshot = aCtx.getImageData(0, 0, annCanvas.width, annCanvas.height);
  }

  function onMove(e) {
    if (!drawing) return;
    const p = pos(e);
    aCtx.putImageData(snapshot, 0, 0);
    aCtx.strokeStyle = color;
    aCtx.lineWidth = strokeSize;
    aCtx.lineCap = 'round';
    aCtx.lineJoin = 'round';

    if (activeTool === 'arrow') {
      drawArrow(aCtx, startX, startY, p.x, p.y);
    } else if (activeTool === 'circle') {
      drawEllipse(aCtx, startX, startY, p.x, p.y);
    }
  }

  function onUp(e) {
    if (!drawing) return;
    drawing = false;
    pushHistory();
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const headLen = Math.max(12, strokeSize * 4);
    const angle = Math.atan2(y2 - y1, x2 - x1);
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
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /* ---- History ---- */
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

  /* ---- Save ---- */
  async function saveAnnotation() {
    if (!currentPhoto) return;

    // Merge base + annotation into one image
    const merged = document.createElement('canvas');
    merged.width = baseCanvas.width;
    merged.height = baseCanvas.height;
    const mCtx = merged.getContext('2d');
    mCtx.drawImage(baseCanvas, 0, 0);
    mCtx.drawImage(annCanvas, 0, 0);

    currentPhoto.annotated = merged.toDataURL('image/jpeg', 0.92);
    currentPhoto.annotations = annCanvas.toDataURL('image/png');
    await DB.updatePhoto(currentPhoto);

    // Refresh thumb in grid
    const card = document.querySelector(`.photo-card[data-id="${currentPhoto.id}"] img`);
    if (card) card.src = currentPhoto.annotated;

    document.getElementById('photoModal').hidden = true;

    const idx = window.appState.currentPhotos.findIndex(p => p.id === currentPhoto.id);
    if (idx !== -1) window.appState.currentPhotos[idx] = currentPhoto;

    showToastFromAnnotator('Annotation saved.');
  }

  function showToastFromAnnotator(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return {
    load,
    get currentPhotoId() { return currentPhoto ? currentPhoto.id : null; },
  };
})();
