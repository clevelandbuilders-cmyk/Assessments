/* ---- State ---- */
const state = {
  jobs: [],
  currentJobId: null,
  currentPhotos: [],
  team: [],
  notifications: [],
};

/* ---- localStorage helpers ---- */
function loadLS() {
  state.jobs = JSON.parse(localStorage.getItem('jc_jobs') || '[]');
  state.team = JSON.parse(localStorage.getItem('jc_team') || '[]');
  state.notifications = JSON.parse(localStorage.getItem('jc_notifs') || '[]');
}
function saveJobs() { localStorage.setItem('jc_jobs', JSON.stringify(state.jobs)); }
function saveTeam() { localStorage.setItem('jc_team', JSON.stringify(state.team)); }
function saveNotifs() { localStorage.setItem('jc_notifs', JSON.stringify(state.notifications)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

/* ---- DOM refs ---- */
const $ = id => document.getElementById(id);
const jobList = $('jobList');
const jobView = $('jobView');
const emptyState = $('emptyState');
const photoGrid = $('photoGrid');

/* ---- Render job list ---- */
function renderJobList(filter = '') {
  const q = filter.toLowerCase();
  const filtered = state.jobs.filter(j =>
    j.name.toLowerCase().includes(q) || (j.address || '').toLowerCase().includes(q)
  );
  jobList.innerHTML = '';
  filtered.forEach(j => {
    const li = document.createElement('li');
    li.className = 'job-item' + (j.id === state.currentJobId ? ' active' : '');
    li.dataset.id = j.id;
    li.innerHTML = `
      <div class="job-item-name">${escHtml(j.name)}</div>
      ${j.address ? `<div class="job-item-address">${escHtml(j.address)}</div>` : ''}
      <div class="job-item-meta">${fmt(j.createdAt)}</div>`;
    li.addEventListener('click', () => selectJob(j.id));
    jobList.appendChild(li);
  });
}

/* ---- Select job ---- */
async function selectJob(id) {
  state.currentJobId = id;
  const job = state.jobs.find(j => j.id === id);
  if (!job) return;

  $('jobTitle').textContent = job.name;
  $('jobAddress').textContent = job.address || '';
  $('jobDate').textContent = 'Created ' + fmt(job.createdAt) + (job.notes ? ' · ' + job.notes : '');

  emptyState.hidden = true;
  jobView.hidden = false;

  renderJobList($('jobSearch').value);

  state.currentPhotos = await DB.getPhotosByJob(id);
  renderPhotos();
}

/* ---- Render photos ---- */
function renderPhotos() {
  photoGrid.innerHTML = '';
  state.currentPhotos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = p.id;
    const img = document.createElement('img');
    img.src = p.annotated || p.src;
    img.alt = '';
    img.loading = 'lazy';
    card.appendChild(img);

    const del = document.createElement('button');
    del.className = 'photo-delete';
    del.title = 'Delete photo';
    del.textContent = '✕';
    del.addEventListener('click', e => { e.stopPropagation(); deletePhoto(p.id); });
    card.appendChild(del);

    if (p.tags && p.tags.length) {
      const dot = document.createElement('span');
      dot.className = 'photo-tag-dot';
      dot.textContent = '👤 ' + p.tags.length;
      card.appendChild(dot);
    }

    card.addEventListener('click', () => openAnnotator(p.id));
    photoGrid.appendChild(card);
  });
}

/* ---- Add photos ---- */
async function addPhotosFromFiles(files) {
  for (const file of files) {
    const src = await readFileAsDataURL(file);
    const photo = { id: uid(), jobId: state.currentJobId, src, annotated: null, tags: [], createdAt: Date.now() };
    await DB.addPhoto(photo);
    state.currentPhotos.push(photo);
  }
  renderPhotos();
}

function readFileAsDataURL(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  await DB.deletePhoto(id);
  state.currentPhotos = state.currentPhotos.filter(p => p.id !== id);
  renderPhotos();
}

/* ---- Job CRUD ---- */
let editingJobId = null;

function openJobModal(jobId = null) {
  editingJobId = jobId;
  $('jobModalTitle').textContent = jobId ? 'Edit Job' : 'New Job';
  if (jobId) {
    const j = state.jobs.find(j => j.id === jobId);
    $('jobName').value = j.name;
    $('jobAddressInput').value = j.address || '';
    $('jobNotes').value = j.notes || '';
  } else {
    $('jobName').value = '';
    $('jobAddressInput').value = '';
    $('jobNotes').value = '';
  }
  $('jobModal').hidden = false;
  $('jobName').focus();
}

function saveJob() {
  const name = $('jobName').value.trim();
  if (!name) { $('jobName').focus(); return; }
  if (editingJobId) {
    const j = state.jobs.find(j => j.id === editingJobId);
    j.name = name;
    j.address = $('jobAddressInput').value.trim();
    j.notes = $('jobNotes').value.trim();
    saveJobs();
    renderJobList();
    if (state.currentJobId === editingJobId) {
      $('jobTitle').textContent = j.name;
      $('jobAddress').textContent = j.address;
    }
  } else {
    const job = { id: uid(), name, address: $('jobAddressInput').value.trim(), notes: $('jobNotes').value.trim(), createdAt: Date.now() };
    state.jobs.unshift(job);
    saveJobs();
    renderJobList();
    selectJob(job.id);
  }
  $('jobModal').hidden = true;
}

async function deleteCurrentJob() {
  if (!state.currentJobId) return;
  const job = state.jobs.find(j => j.id === state.currentJobId);
  if (!confirm(`Delete job "${job.name}" and all its photos?`)) return;
  await DB.deletePhotosByJob(state.currentJobId);
  state.jobs = state.jobs.filter(j => j.id !== state.currentJobId);
  saveJobs();
  state.currentJobId = null;
  state.currentPhotos = [];
  jobView.hidden = true;
  emptyState.hidden = false;
  renderJobList();
}

/* ---- Notifications ---- */
function addNotification(msg, jobName) {
  state.notifications.unshift({ id: uid(), msg, jobName, ts: Date.now() });
  saveNotifs();
  renderNotifBadge();
}

function renderNotifBadge() {
  const badge = $('notifBadge');
  if (state.notifications.length) {
    badge.hidden = false;
    badge.textContent = state.notifications.length > 9 ? '9+' : state.notifications.length;
  } else {
    badge.hidden = true;
  }
}

function renderNotifPanel() {
  const list = $('notifList');
  const empty = $('notifEmpty');
  list.innerHTML = '';
  if (!state.notifications.length) { empty.hidden = false; return; }
  empty.hidden = true;
  state.notifications.forEach(n => {
    const li = document.createElement('li');
    li.className = 'notif-item';
    li.innerHTML = `<strong>${escHtml(n.msg)}</strong><span>${escHtml(n.jobName)}</span><br><time>${fmt(n.ts)}</time>`;
    list.appendChild(li);
  });
}

/* ---- Team ---- */
function renderTeamList() {
  const list = $('teamList');
  const sel = $('tagMemberSelect');
  list.innerHTML = '';
  sel.innerHTML = '<option value="">-- Select a member --</option>';
  state.team.forEach(m => {
    const li = document.createElement('li');
    li.className = 'team-list-item';
    li.innerHTML = `<span>${escHtml(m.name)}</span><button class="team-remove" data-id="${m.id}">&#128465;</button>`;
    li.querySelector('.team-remove').addEventListener('click', () => {
      state.team = state.team.filter(t => t.id !== m.id);
      saveTeam();
      renderTeamList();
    });
    list.appendChild(li);
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
}

/* ---- Tag photo ---- */
let taggingPhotoId = null;

function openTagModal(photoId) {
  taggingPhotoId = photoId;
  $('tagMessage').value = '';
  $('tagMemberSelect').value = '';
  renderTeamList();
  $('tagModal').hidden = false;
}

function sendTag() {
  const memberId = $('tagMemberSelect').value;
  if (!memberId) { alert('Please select a team member.'); return; }
  const member = state.team.find(m => m.id === memberId);
  const msg = $('tagMessage').value.trim() || 'You were tagged in a photo';
  const photo = state.currentPhotos.find(p => p.id === taggingPhotoId);
  if (!photo) return;
  if (!photo.tags) photo.tags = [];
  photo.tags.push({ memberId, memberName: member.name, msg, ts: Date.now() });
  DB.updatePhoto(photo);

  const job = state.jobs.find(j => j.id === state.currentJobId);
  addNotification(`${member.name}: ${msg}`, job ? job.name : '');

  renderPhotos();
  $('tagModal').hidden = true;
  showToast(`${member.name} has been tagged and notified.`);
}

/* ---- Toast ---- */
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

/* ---- Utility ---- */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---- Wire up events ---- */
document.addEventListener('DOMContentLoaded', () => {
  loadLS();
  renderJobList();
  renderNotifBadge();

  // Sidebar toggle
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));

  // Add job
  $('addJobBtn').addEventListener('click', () => openJobModal());
  $('cancelJobBtn').addEventListener('click', () => { $('jobModal').hidden = true; });
  $('saveJobBtn').addEventListener('click', saveJob);
  $('jobName').addEventListener('keydown', e => { if (e.key === 'Enter') saveJob(); });

  // Edit / delete job
  $('editJobBtn').addEventListener('click', () => openJobModal(state.currentJobId));
  $('deleteJobBtn').addEventListener('click', deleteCurrentJob);

  // Search
  $('jobSearch').addEventListener('input', e => renderJobList(e.target.value));

  // Photo inputs
  $('photoInput').addEventListener('change', e => addPhotosFromFiles(e.target.files));
  $('cameraInput').addEventListener('change', e => addPhotosFromFiles(e.target.files));

  // Drag & drop
  const dz = $('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (state.currentJobId) addPhotosFromFiles(e.dataTransfer.files);
  });

  // Notifications
  $('notifBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('notifPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderNotifPanel();
  });
  $('clearNotifs').addEventListener('click', () => {
    state.notifications = [];
    saveNotifs();
    renderNotifBadge();
    renderNotifPanel();
  });
  document.addEventListener('click', () => { $('notifPanel').hidden = true; });

  // Tag modal
  $('tagBtn').addEventListener('click', () => {
    if (window.annotator && window.annotator.currentPhotoId) openTagModal(window.annotator.currentPhotoId);
  });
  $('cancelTagBtn').addEventListener('click', () => { $('tagModal').hidden = true; });
  $('sendTagBtn').addEventListener('click', sendTag);
  $('addMemberBtn').addEventListener('click', () => {
    const name = $('newMemberName').value.trim();
    if (!name) return;
    state.team.push({ id: uid(), name });
    saveTeam();
    $('newMemberName').value = '';
    renderTeamList();
  });
  $('newMemberName').addEventListener('keydown', e => { if (e.key === 'Enter') $('addMemberBtn').click(); });

  // Close annotator
  $('closeAnnotatorBtn').addEventListener('click', () => { $('photoModal').hidden = true; });

  // Expose for annotate.js
  window.appState = state;
  window.appSelectJob = selectJob;
});

/* ---- Open annotator (called by annotate.js bridge) ---- */
async function openAnnotator(photoId) {
  const photo = state.currentPhotos.find(p => p.id === photoId);
  if (!photo) return;
  $('photoModal').hidden = false;
  if (window.annotator) window.annotator.load(photo);
}
window.openAnnotator = openAnnotator;
