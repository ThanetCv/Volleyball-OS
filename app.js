const $ = (id) => document.getElementById(id);
const todayIso = () => new Date().toISOString().slice(0, 10);
const THEME_KEY = 'volleyTheme';

function activeTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function exportPalette() {
  return activeTheme() === 'dark'
    ? {
        bg0:'#0d2c55', bg1:'#07111f', bg2:'#341016', grid:'rgba(255,255,255,.05)',
        ring:'rgba(247,201,40,.10)', kicker:'#ffd43b', text:'#f7f9fd', muted:'#91a4ba',
        divider:'#8fa1b5', line:'rgba(255,255,255,.14)', setLabel:'#8eb1cf', footer:'#71869c',
        blue:'#2f6bff', red:'#f14b58', yellow:'#ffd43b'
      }
    : {
        bg0:'#ffffff', bg1:'#f4f7fc', bg2:'#fff7d6', grid:'rgba(21,94,239,.055)',
        ring:'rgba(21,94,239,.09)', kicker:'#155eef', text:'#14243b', muted:'#6d7f97',
        divider:'#9aabc0', line:'rgba(25,53,90,.14)', setLabel:'#5e7691', footer:'#71849a',
        blue:'#155eef', red:'#df3545', yellow:'#f7c928'
      };
}
function applyTheme(theme, persist = true) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) { try { localStorage.setItem(THEME_KEY, next); } catch (_) {} }
  const label = $('themeToggleLabel'), icon = $('themeToggleIcon'), btn = $('themeToggle');
  if (label) label.textContent = next === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง';
  if (icon) icon.textContent = next === 'dark' ? '☾' : '☀';
  if (btn) {
    btn.setAttribute('aria-pressed', String(next === 'dark'));
    btn.title = next === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';
  }
}
function toggleTheme() { applyTheme(activeTheme() === 'dark' ? 'light' : 'dark'); }

const state = {
  started: false,
  maxSets: 3,
  teamA: { name: 'TEAM A', logo: null },
  teamB: { name: 'TEAM B', logo: null },
  left: 'A', right: 'B', scores: { A: 0, B: 0 }, setsWon: { A: 0, B: 0 },
  currentSet: 1, sets: [], events: [], serving: 'A', eventName: '', matchDate: todayIso(),
  pendingSetWinner: null, lastSavedMatchId: null
};

let savedMatches = JSON.parse(localStorage.getItem('volleyMatches') || '[]');


function makeDefaultRoster() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `ผู้เล่น ${i + 1}`,
    number: String(i + 1),
    isLibero: false,
    stats: freshStats()
  }));
}

const advanced = {
  trackedTeam: 'A',
  configuredSet: null,
  rotationCount: 0,
  firstServers: {},
  players: makeDefaultRoster(),
  lineupSelections: { 1:'p1', 2:'p2', 3:'p3', 4:'p4', 5:'p5', 6:'p6' },
  liveSlots: {},
  subLimit: 6,
  subPairs: [],
  subEvents: [],
  liberoStates: {},
  liberoEvents: [],
  nextPlayerSeq: 7,
  pendingWinner: null,
  selectedReason: null
};

function opponentOf(key) { return key === 'A' ? 'B' : 'A'; }
function freshStats() { return { attack: 0, ace: 0, block: 0, serviceError: 0, attackError: 0, receptionError: 0, blockError: 0 }; }

function team(side) { return side === 'A' ? state.teamA : state.teamB; }
function sideKey(screenSide) { return state[screenSide]; }
function targetScore() { return state.currentSet === state.maxSets ? 15 : 25; }
function setsNeeded() { return Math.ceil(state.maxSets / 2); }
function isSetWon(key) {
  const other = key === 'A' ? 'B' : 'A';
  const s = state.scores[key], o = state.scores[other], target = targetScore();
  return s >= target && s - o >= 2;
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1800);
}
function formatThaiDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function compressLogo(file) {
  if (!file) return null;
  if (file.size > 3 * 1024 * 1024) throw new Error('ไฟล์โลโก้ต้องไม่เกิน 3 MB');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  const max = 360;
  const ratio = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/webp', .88);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
}

function setSetupLogo(key, dataUrl) {
  state[key].logo = dataUrl || null;
  const suffix = key === 'teamA' ? 'A' : 'B';
  const preview = $(`team${suffix}LogoPreview`);
  const img = preview.querySelector('img');
  img.src = dataUrl || '';
  preview.classList.toggle('empty', !dataUrl);
  $(`removeTeam${suffix}Logo`).classList.toggle('hidden', !dataUrl);
}

async function handleLogoInput(key, file) {
  try {
    const data = await compressLogo(file);
    setSetupLogo(key, data);
  } catch (err) {
    toast(err.message || 'เพิ่มโลโก้ไม่สำเร็จ');
  }
}

function startMatch() {
  state.started = true;
  state.maxSets = +$('matchFormat').value;
  state.teamA.name = $('teamAInput').value.trim() || 'TEAM A';
  state.teamB.name = $('teamBInput').value.trim() || 'TEAM B';
  state.eventName = $('eventInput').value.trim();
  state.matchDate = $('matchDateInput').value || todayIso();
  state.left = 'A'; state.right = 'B'; state.scores = { A: 0, B: 0 }; state.setsWon = { A: 0, B: 0 };
  state.currentSet = 1; state.sets = []; state.events = []; state.serving = 'A'; state.pendingSetWinner = null;
  initAdvancedMatch();
  $('setupCard').classList.add('hidden'); $('scoreWorkspace').classList.remove('hidden');
  render();
}

function addPoint(screenSide) {
  if (state.pendingSetWinner) return;
  const key = sideKey(screenSide), previousServer = state.serving; state.scores[key]++;
  const evt = { set: state.currentSet, team: key, teamPoint: state.scores[key], a: state.scores.A, b: state.scores.B, ts: Date.now(), rotated: false };
  state.events.push(evt);
  if (advanced.configuredSet === state.currentSet && key === advanced.trackedTeam && previousServer && previousServer !== key) {
    evt.rotated = true;
    advanced.rotationCount += 1;
    maybeAutoReturnLibero(evt, 'sideout');
  }
  state.serving = key; render();
  if (isSetWon(key)) completeSet(key);
}

function subtractPoint(screenSide) {
  if (state.pendingSetWinner) return;
  const key = sideKey(screenSide); if (state.scores[key] <= 0) return;
  for (let i = state.events.length - 1; i >= 0; i--) {
    if (state.events[i].set === state.currentSet && state.events[i].team === key) {
      const [removed] = state.events.splice(i, 1);
      if (removed?.rotated && advanced.configuredSet === state.currentSet) { rollbackLiberoAutoReturn(removed); advanced.rotationCount = Math.max(0, advanced.rotationCount - 1); }
      break;
    }
  }
  recalcCurrentSet(); render();
}

function recalcCurrentSet() {
  let a = 0, b = 0;
  for (const e of state.events.filter(e => e.set === state.currentSet)) {
    if (e.team === 'A') a++; else b++;
    e.teamPoint = e.team === 'A' ? a : b; e.a = a; e.b = b;
  }
  state.scores = { A: a, B: b };
}

function undo() {
  if (state.pendingSetWinner) return;
  for (let i = state.events.length - 1; i >= 0; i--) {
    if (state.events[i].set === state.currentSet) {
      const [removed] = state.events.splice(i, 1);
      if (removed?.rotated && advanced.configuredSet === state.currentSet) { rollbackLiberoAutoReturn(removed); advanced.rotationCount = Math.max(0, advanced.rotationCount - 1); }
      recalcCurrentSet(); render(); return;
    }
  }
}

function completeSet(key) {
  state.pendingSetWinner = key; state.setsWon[key]++;
  state.sets.push({ set: state.currentSet, a: state.scores.A, b: state.scores.B, winner: key });
  $('setWinnerText').textContent = `${team(key).name} ชนะเซต ${state.currentSet}`;
  $('setScoreText').textContent = `${state.scores.A} – ${state.scores.B}`;
  $('nextSetBtn').textContent = state.setsWon[key] >= setsNeeded() ? 'สรุปผลการแข่งขัน' : 'เริ่มเซตถัดไป';
  $('setModal').classList.remove('hidden'); render();
}

function nextSet() {
  const winner = state.pendingSetWinner; if (!winner) return;
  if (state.setsWon[winner] >= setsNeeded()) {
    const match = saveMatch(winner);
    $('setModal').classList.add('hidden'); state.pendingSetWinner = null;
    showMatchComplete(match); return;
  }
  state.currentSet++; state.scores = { A: 0, B: 0 }; state.pendingSetWinner = null;
  const x = state.left; state.left = state.right; state.right = x;
  prepareAdvancedForNewSet();
  $('setModal').classList.add('hidden'); render(); toast('เริ่มเซตใหม่และสลับฝั่งแล้ว');
}

function swapSides() { const x = state.left; state.left = state.right; state.right = x; render(); }
function resetSet() {
  if (confirm('รีเซ็ตคะแนน Rotation และประวัติการเปลี่ยนตัวของเซตนี้เป็นค่าเริ่มต้นใช่หรือไม่?')) {
    state.events = state.events.filter(e => e.set !== state.currentSet);
    state.scores = { A: 0, B: 0 };
    if (advanced.configuredSet === state.currentSet) {
      advanced.rotationCount = 0;
      advanced.liveSlots = { ...advanced.lineupSelections };
      advanced.subPairs = advanced.subPairs.filter(p => p.set !== state.currentSet);
      advanced.subEvents = advanced.subEvents.filter(e => e.set !== state.currentSet);
      advanced.liberoEvents = advanced.liberoEvents.filter(e => e.set !== state.currentSet);
      advanced.liberoStates[state.currentSet] = freshLiberoState();
    }
    render();
  }
}

function openFinishConfirm() { $('finishConfirmModal').classList.remove('hidden'); }
function closeFinishConfirm() { $('finishConfirmModal').classList.add('hidden'); }
function finishMatchNow() {
  closeFinishConfirm();
  if ((state.scores.A > 0 || state.scores.B > 0) && !state.sets.some(s => s.set === state.currentSet)) {
    const partialWinner = state.scores.A === state.scores.B ? null : (state.scores.A > state.scores.B ? 'A' : 'B');
    state.sets.push({ set: state.currentSet, a: state.scores.A, b: state.scores.B, winner: partialWinner, partial: true });
  }
  const winner = state.setsWon.A === state.setsWon.B ? null : (state.setsWon.A > state.setsWon.B ? 'A' : 'B');
  const match = saveMatch(winner);
  showMatchComplete(match);
}

function saveMatch(winner) {
  const match = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(), matchDate: state.matchDate,
    eventName: state.eventName, teamA: state.teamA.name, teamB: state.teamB.name,
    logoA: state.teamA.logo, logoB: state.teamB.logo,
    maxSets: state.maxSets, setsWon: { ...state.setsWon }, sets: state.sets.map(s => ({ ...s })), winner,
    playerStats: advanced.players.map(p => ({ id: p.id, name: p.name, number: p.number, isLibero:p.isLibero, stats: { ...p.stats } })),
    trackedTeam: advanced.trackedTeam,
    substitutionLimit: advanced.subLimit,
    substitutionPairs: advanced.subPairs.map(p => ({ ...p })),
    substitutionEvents: advanced.subEvents.map(e => ({ ...e })),
    liberoReplacementEvents: advanced.liberoEvents.map(e => ({ ...e }))
  };
  savedMatches.unshift(match);
  try { localStorage.setItem('volleyMatches', JSON.stringify(savedMatches)); }
  catch { toast('พื้นที่จัดเก็บในเครื่องเต็ม — โลโก้ยังแสดงได้ในแมตช์นี้'); }
  state.lastSavedMatchId = match.id;
  loadMatchOptions(match.id); renderExport(match);
  return match;
}

function showMatchComplete(match) {
  const winnerName = match.winner ? (match.winner === 'A' ? match.teamA : match.teamB) : 'จบการแข่งขัน';
  $('matchCompleteTitle').textContent = match.winner ? `${winnerName} ชนะการแข่งขัน` : 'บันทึกการแข่งขันแล้ว';
  $('matchCompleteScore').textContent = `${match.teamA} ${match.setsWon.A} – ${match.setsWon.B} ${match.teamB}`;
  $('matchCompleteModal').classList.remove('hidden');
}

function resetToNewMatch() {
  $('matchCompleteModal').classList.add('hidden');
  state.started = false; state.pendingSetWinner = null; state.lastSavedMatchId = null;
  state.teamA = { name: 'TEAM A', logo: null }; state.teamB = { name: 'TEAM B', logo: null };
  $('teamAInput').value = 'TEAM A'; $('teamBInput').value = 'TEAM B'; $('eventInput').value = '';
  $('matchDateInput').value = todayIso(); $('matchFormat').value = '3';
  setSetupLogo('teamA', null); setSetupLogo('teamB', null);
  initAdvancedMatch();
  $('scoreWorkspace').classList.add('hidden'); $('setupCard').classList.remove('hidden');
  switchPage('scorePage');
}

function viewLastResult() {
  $('matchCompleteModal').classList.add('hidden');
  switchPage('historyPage');
  if (state.lastSavedMatchId) {
    $('matchSelect').value = state.lastSavedMatchId;
    renderExport(selectedMatch());
  }
}

function render() {
  $('leftTeamName').textContent = team(state.left).name; $('rightTeamName').textContent = team(state.right).name;
  $('leftScore').textContent = state.scores[state.left]; $('rightScore').textContent = state.scores[state.right];
  $('flowLeftName').textContent = team(state.left).name; $('flowRightName').textContent = team(state.right).name;
  $('flowLeftScore').textContent = state.scores[state.left]; $('flowRightScore').textContent = state.scores[state.right];
  $('setLabel').textContent = `SET ${state.currentSet}`; $('flowSetLabel').textContent = `SET ${state.currentSet}`;
  $('formatLabel').textContent = `BEST OF ${state.maxSets}`; $('setCount').textContent = `${state.setsWon[state.left]} — ${state.setsWon[state.right]}`;
  $('eventLabel').textContent = state.eventName || 'LIVE MATCH';
  $('leftServe').classList.toggle('hidden', state.serving !== state.left); $('rightServe').classList.toggle('hidden', state.serving !== state.right);
  renderScoreLogo('leftTeamLogo', team(state.left).logo); renderScoreLogo('rightTeamLogo', team(state.right).logo);
  const target = targetScore(), a = state.scores.A, b = state.scores.B;
  const leader = a > b ? 'A' : b > a ? 'B' : null;
  const near = leader && state.scores[leader] >= target - 1 && Math.abs(a - b) >= 1;
  $('statusPill').textContent = near ? (state.setsWon[leader] === setsNeeded() - 1 ? 'MATCH POINT' : 'SET POINT') : (a >= target - 1 && b >= target - 1 ? 'DEUCE' : 'กำลังแข่งขัน');
  renderFlow();
  if ($('rotationContent')) renderAdvancedPage();
}

function renderScoreLogo(id, src) {
  const img = $(id); img.classList.toggle('hidden', !src); if (src) img.src = src;
}

function renderFlow() {
  const box = $('pointFlow'); const events = state.events.filter(e => e.set === state.currentSet);
  if (!events.length) { box.innerHTML = '<div class="empty-flow">คะแนนที่เกิดขึ้นจะแสดงเป็นเส้นทางแบบสด</div>'; return; }
  box.innerHTML = ''; let prev = null;
  events.forEach(e => {
    const currentScreenSide = e.team === state.left ? 'left' : 'right';
    const row = document.createElement('div'); row.className = `flow-row ${currentScreenSide}`;
    if (prev) {
      const x1 = prev === 'left' ? 24 : 76, x2 = currentScreenSide === 'left' ? 24 : 76;
      row.innerHTML = `<svg class="flow-path" viewBox="0 0 100 52" preserveAspectRatio="none"><path d="M ${x1} 2 C ${x1} 24, ${x2} 28, ${x2} 50"/></svg>`;
    }
    const p = document.createElement('div'); p.className = 'flow-point'; p.textContent = e.teamPoint; row.appendChild(p); box.appendChild(row); prev = currentScreenSide;
  });
  box.scrollTop = box.scrollHeight;
}

function loadMatchOptions(preferredId) {
  const sel = $('matchSelect');
  if (!savedMatches.length) { sel.innerHTML = '<option value="">ยังไม่มีแมตช์ที่บันทึก</option>'; return; }
  sel.innerHTML = savedMatches.map(m => `<option value="${m.id}">${m.teamA} vs ${m.teamB} • ${formatThaiDate(m.matchDate || m.createdAt.slice(0,10))}</option>`).join('');
  sel.value = preferredId && savedMatches.some(m => m.id === preferredId) ? preferredId : savedMatches[0].id;
}

function renderExport(match) {
  if (!match) return;
  $('exportEvent').textContent = match.eventName || 'VOLLEYBALL MATCH';
  $('exportDate').textContent = formatThaiDate(match.matchDate || match.createdAt?.slice(0,10));
  $('exportTeamA').textContent = match.teamA; $('exportTeamB').textContent = match.teamB;
  $('exportSetsA').textContent = match.setsWon.A; $('exportSetsB').textContent = match.setsWon.B;
  const winnerName = match.winner ? (match.winner === 'A' ? match.teamA : match.teamB) : '';
  $('exportWinner').textContent = winnerName ? `WINNER • ${winnerName}` : 'MATCH SUMMARY';
  setExportLogo('exportLogoA', match.logoA); setExportLogo('exportLogoB', match.logoB);
  $('exportSets').innerHTML = match.sets.map(s => `<div class="export-set-row"><small>SET ${s.set}${s.partial ? ' • END' : ''}</small><strong>${s.a} — ${s.b}</strong></div>`).join('');
}

function setExportLogo(id, src) {
  const img = $(id); img.classList.toggle('hidden', !src); if (src) img.src = src;
}

function selectedMatch() { return savedMatches.find(m => m.id === $('matchSelect').value) || savedMatches[0]; }
function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  if (id === 'historyPage') { loadMatchOptions(state.lastSavedMatchId); renderExport(selectedMatch()); }
  if (id === 'rotationPage') renderAdvancedPage();
}

function updatePreviewRatio() {
  const [w, h] = $('exportSize').value.split('x').map(Number);
  $('exportCard').style.aspectRatio = `${w}/${h}`;
  $('exportCard').classList.toggle('wide-export', w / h > 1.2);
  $('exportCard').classList.toggle('square-export', Math.abs(w / h - 1) < .08);
}

async function drawLogo(ctx, src, cx, cy, size) {
  if (!src) return;
  try {
    const p = exportPalette();
    const img = await loadImage(src);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.clip();
    const ratio = Math.max(size / img.width, size / img.height);
    const dw = img.width * ratio, dh = img.height * ratio;
    ctx.fillStyle = activeTheme() === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(21,94,239,.055)';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); ctx.restore();
    ctx.save(); ctx.strokeStyle = activeTheme() === 'dark' ? 'rgba(255,255,255,.22)' : 'rgba(21,94,239,.18)'; ctx.lineWidth = Math.max(2, size * .02); ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  } catch {}
}

function fitText(ctx, text, maxWidth, startSize, minSize, fontFamily, weight = 800) {
  let size = startSize;
  do { ctx.font = `${weight} ${Math.round(size)}px ${fontFamily}`; if (ctx.measureText(text).width <= maxWidth) break; size -= 2; } while (size > minSize);
  return size;
}

async function exportPng() {
  const m = selectedMatch(); if (!m) { toast('ยังไม่มีแมตช์สำหรับส่งออก'); return; }
  const [w, h] = $('exportSize').value.split('x').map(Number);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const ratio = w / h, wide = ratio > 1.2;
  const pad = wide ? w * .055 : w * .075;
  const sportFont = 'Impact, Arial Black, sans-serif';
  const uiFont = 'Arial, Tahoma, sans-serif';

  const p = exportPalette();
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, p.bg0); g.addColorStop(.58, p.bg1); g.addColorStop(1, p.bg2);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = p.grid; x.lineWidth = Math.max(1, w / 1080);
  const step = Math.max(60, w / 12);
  for (let i = 0; i < w; i += step) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  for (let j = 0; j < h; j += step) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
  x.strokeStyle = p.ring; x.lineWidth = Math.max(30, Math.min(w,h) * .08); x.beginPath(); x.arc(w * .93, h * .25, Math.min(w,h) * .28, 0, Math.PI * 2); x.stroke();

  x.textAlign = 'left'; x.fillStyle = p.kicker; x.font = `900 ${Math.round(Math.min(w,h) * .026)}px ${uiFont}`; x.fillText('MATCH RESULT', pad, h * .075);
  x.fillStyle = p.text; x.font = `800 ${Math.round(Math.min(w,h) * .035)}px ${uiFont}`; x.fillText((m.eventName || 'VOLLEYBALL MATCH').toUpperCase(), pad, h * .115);
  x.fillStyle = p.muted; x.font = `700 ${Math.round(Math.min(w,h) * .020)}px ${uiFont}`; x.fillText(formatThaiDate(m.matchDate || m.createdAt?.slice(0,10)), pad, h * .145);

  const scoreY = wide ? h * .46 : h * .40;
  const teamNameY = scoreY - Math.min(w,h) * .10;
  const logoSize = Math.min(w,h) * (wide ? .10 : .115);
  const leftX = pad, rightX = w - pad;
  if (m.logoA) await drawLogo(x, m.logoA, leftX + logoSize/2, teamNameY - logoSize*.65, logoSize);
  if (m.logoB) await drawLogo(x, m.logoB, rightX - logoSize/2, teamNameY - logoSize*.65, logoSize);

  x.fillStyle = p.text; x.textAlign = 'left';
  fitText(x, m.teamA.toUpperCase(), w * .38, Math.min(w,h) * .043, 24, uiFont, 900); x.fillText(m.teamA.toUpperCase(), leftX, teamNameY);
  x.textAlign = 'right'; fitText(x, m.teamB.toUpperCase(), w * .38, Math.min(w,h) * .043, 24, uiFont, 900); x.fillText(m.teamB.toUpperCase(), rightX, teamNameY);

  x.fillStyle = p.text; x.font = `900 ${Math.round(Math.min(w,h) * (wide ? .19 : .17))}px ${sportFont}`;
  x.textAlign = 'left'; x.fillText(m.setsWon.A, leftX, scoreY + Math.min(w,h) * .10);
  x.textAlign = 'right'; x.fillText(m.setsWon.B, rightX, scoreY + Math.min(w,h) * .10);
  x.textAlign = 'center'; x.fillStyle = p.divider; x.font = `800 ${Math.round(Math.min(w,h) * .055)}px ${uiFont}`; x.fillText('—', w / 2, scoreY + Math.min(w,h) * .07);

  const winnerName = m.winner ? (m.winner === 'A' ? m.teamA : m.teamB) : null;
  x.textAlign = 'left'; x.fillStyle = winnerName ? p.kicker : p.muted; x.font = `900 ${Math.round(Math.min(w,h) * .021)}px ${uiFont}`;
  x.fillText(winnerName ? `WINNER • ${winnerName.toUpperCase()}` : 'MATCH SUMMARY', pad, wide ? h * .63 : h * .565);

  const setStartY = wide ? h * .69 : h * .625;
  const setGap = wide ? h * .065 : h * .052;
  let y = setStartY;
  for (const s of m.sets) {
    x.strokeStyle = p.line; x.lineWidth = 1; x.beginPath(); x.moveTo(pad, y + setGap * .30); x.lineTo(w - pad, y + setGap * .30); x.stroke();
    x.fillStyle = p.setLabel; x.textAlign = 'left'; x.font = `900 ${Math.round(Math.min(w,h) * .022)}px ${uiFont}`; x.fillText(`SET ${s.set}`, pad, y);
    x.fillStyle = p.text; x.textAlign = 'right'; x.font = `900 ${Math.round(Math.min(w,h) * .034)}px ${sportFont}`; x.fillText(`${s.a} — ${s.b}`, w - pad, y);
    y += setGap;
  }

  x.textAlign = 'left'; x.fillStyle = p.footer; x.font = `900 ${Math.round(Math.min(w,h) * .017)}px ${uiFont}`; x.fillText('VOLLEYBALL MATCH SUMMARY', pad, h * .94);
  const a = document.createElement('a'); a.download = `${m.teamA}-vs-${m.teamB}-${w}x${h}.png`; a.href = c.toDataURL('image/png', 1); a.click();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await document.documentElement.requestFullscreen?.();
  } catch (_) {
    toast('อุปกรณ์หรือเบราว์เซอร์นี้ไม่อนุญาตให้สลับโหมดเต็มจอ');
  } finally {
    syncFullscreenButton();
  }
}
function syncFullscreenButton() {
  const btn = $('fullscreenBtn'); if (!btn) return;
  const active = Boolean(document.fullscreenElement);
  btn.textContent = active ? '⤢ ออกจากเต็มจอ' : '⛶ เต็มจอ';
  btn.setAttribute('aria-pressed', String(active));
  btn.title = active ? 'ออกจากโหมดเต็มจอ' : 'เข้าสู่โหมดเต็มจอ';
}

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
$('startMatchBtn').addEventListener('click', startMatch);
document.querySelectorAll('.score-btn').forEach(b => b.addEventListener('click', () => b.dataset.action === 'plus' ? addPoint(b.dataset.side) : subtractPoint(b.dataset.side)));
$('swapBtn').addEventListener('click', swapSides); $('undoBtn').addEventListener('click', undo);
$('serveBtn').addEventListener('click', () => { state.serving = state.serving === 'A' ? 'B' : 'A'; render(); });
$('resetSetBtn').addEventListener('click', resetSet); $('finishMatchBtn').addEventListener('click', openFinishConfirm);
$('cancelFinishBtn').addEventListener('click', closeFinishConfirm); $('confirmFinishBtn').addEventListener('click', finishMatchNow);
$('nextSetBtn').addEventListener('click', nextSet); $('viewResultBtn').addEventListener('click', viewLastResult); $('newMatchBtn').addEventListener('click', resetToNewMatch);
$('fullscreenBtn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenButton);
$('matchSelect').addEventListener('change', () => renderExport(selectedMatch()));
$('exportSize').addEventListener('change', updatePreviewRatio);
$('exportPngBtn').addEventListener('click', exportPng); $('printPdfBtn').addEventListener('click', () => window.print());
$('teamALogoInput').addEventListener('change', e => handleLogoInput('teamA', e.target.files?.[0]));
$('teamBLogoInput').addEventListener('change', e => handleLogoInput('teamB', e.target.files?.[0]));
$('removeTeamALogo').addEventListener('click', () => { $('teamALogoInput').value = ''; setSetupLogo('teamA', null); });
$('removeTeamBLogo').addEventListener('click', () => { $('teamBLogoInput').value = ''; setSetupLogo('teamB', null); });



function initAdvancedMatch() {
  advanced.trackedTeam = 'A';
  advanced.configuredSet = null;
  advanced.rotationCount = 0;
  advanced.firstServers = {};
  advanced.players = makeDefaultRoster();
  advanced.lineupSelections = { 1:'p1', 2:'p2', 3:'p3', 4:'p4', 5:'p5', 6:'p6' };
  advanced.liveSlots = {};
  advanced.subLimit = 6;
  advanced.subPairs = [];
  advanced.subEvents = [];
  advanced.liberoStates = {};
  advanced.liberoEvents = [];
  advanced.nextPlayerSeq = 7;
  advanced.pendingWinner = null;
  advanced.selectedReason = null;
  if ($('trackedTeamSelect')) $('trackedTeamSelect').value = 'A';
  if ($('substitutionLimitSelect')) $('substitutionLimitSelect').value = '6';
  if ($('customSubLimitWrap')) $('customSubLimitWrap').classList.add('hidden');
  buildLineupInputs();
}

function prepareAdvancedForNewSet() {
  advanced.configuredSet = null;
  advanced.rotationCount = 0;
  advanced.pendingWinner = null;
  advanced.selectedReason = null;
  if (Object.keys(advanced.liveSlots).length === 6) advanced.lineupSelections = { ...advanced.liveSlots };
  advanced.liveSlots = {};
  ensureLiberoState(state.currentSet);
  const prev = advanced.firstServers[state.currentSet - 1];
  if ($('firstServerSelect')) $('firstServerSelect').value = prev ? opponentOf(prev) : advanced.trackedTeam;
  if ($('firstServerSelect')) delete $('firstServerSelect').dataset.touched;
  buildLineupInputs();
}

function playerById(id) { return advanced.players.find(p => p.id === id) || null; }
function playerLabel(p) { return p ? `#${p.number} ${p.name}` : '—'; }
function currentSetPairs() { return advanced.subPairs.filter(p => p.set === state.currentSet); }
function currentSetSubEvents() { return advanced.subEvents.filter(e => e.set === state.currentSet); }
function pairForPlayer(playerId) {
  return currentSetPairs().find(p => p.starterId === playerId || p.subId === playerId) || null;
}
function slotForPlayer(playerId) {
  return Number(Object.keys(advanced.liveSlots).find(slot => advanced.liveSlots[slot] === playerId) || 0);
}
function onCourtPlayerIds() { return Object.values(advanced.liveSlots).filter(Boolean); }
function onCourtPlayers() { return onCourtPlayerIds().map(playerById).filter(Boolean); }
function benchPlayers() {
  const court = new Set(onCourtPlayerIds());
  return advanced.players.filter(p => !court.has(p.id));
}

function freshLiberoState() {
  return { activeLiberoId:null, regularPlayerId:null, slot:null, lastRallyCount:null, eventCount:0 };
}
function ensureLiberoState(setNo=state.currentSet) {
  if (!advanced.liberoStates[setNo]) advanced.liberoStates[setNo] = freshLiberoState();
  return advanced.liberoStates[setNo];
}
function currentLiberoState() { return ensureLiberoState(state.currentSet); }
function currentSetLiberoEvents() { return advanced.liberoEvents.filter(e => e.set === state.currentSet); }
function currentRallyCount() { return state.events.filter(e => e.set === state.currentSet).length; }
function currentPositionForSlot(slot, rotationCount=advanced.rotationCount) {
  return (((Number(slot) - 1 - rotationCount) % 6 + 6) % 6) + 1;
}
function liberoOnCourt() {
  const ls = currentLiberoState();
  return ls.activeLiberoId ? playerById(ls.activeLiberoId) : null;
}

function syncAdvancedTeamLabels() {
  const a = state.teamA.name || 'TEAM A', b = state.teamB.name || 'TEAM B';
  $('advancedTeamAName').textContent = a;
  $('advancedTeamBName').textContent = b;
  const trackedSel = $('trackedTeamSelect');
  const firstSel = $('firstServerSelect');
  trackedSel.options[0].textContent = a; trackedSel.options[1].textContent = b;
  firstSel.options[0].textContent = a; firstSel.options[1].textContent = b;
}

function normalizeLineupSelections() {
  const eligible = advanced.players.filter(p => !p.isLibero).map(p => p.id);
  const used = new Set();
  for (let pos = 1; pos <= 6; pos++) {
    let id = advanced.lineupSelections[pos];
    if (!eligible.includes(id) || used.has(id)) id = eligible.find(x => !used.has(x));
    if (id) { advanced.lineupSelections[pos] = id; used.add(id); }
  }
}

function renderRosterEditor() {
  const host = $('rosterEditor'); if (!host) return;
  host.innerHTML = advanced.players.map((p, i) => `
    <div class="roster-row" data-player-id="${p.id}">
      <label>เบอร์<input class="roster-number" maxlength="3" value="${escapeHtml(p.number)}"></label>
      <label class="roster-name-label">ชื่อ<input class="roster-name" maxlength="40" value="${escapeHtml(p.name)}"></label>
      <label>ประเภท<select class="roster-role"><option value="normal" ${p.isLibero?'':'selected'}>ผู้เล่นปกติ</option><option value="libero" ${p.isLibero?'selected':''}>Libero</option></select></label>
      <button type="button" class="tiny-link roster-remove" ${advanced.players.length <= 6 ? 'disabled' : ''}>ลบ</button>
    </div>`).join('');

  host.querySelectorAll('.roster-row').forEach(row => {
    const id = row.dataset.playerId;
    const p = playerById(id);
    row.querySelector('.roster-number').addEventListener('input', e => { p.number = e.target.value.trim(); refreshLineupSelects(); });
    row.querySelector('.roster-name').addEventListener('input', e => { p.name = e.target.value; refreshLineupSelects(); });
    row.querySelector('.roster-role').addEventListener('change', e => {
      const wantsLibero = e.target.value === 'libero';
      const otherLiberos = advanced.players.filter(x => x.id !== p.id && x.isLibero).length;
      if (wantsLibero && otherLiberos >= 2) {
        e.target.value = p.isLibero ? 'libero' : 'normal';
        toast('กำหนด Libero ได้สูงสุด 2 คนต่อทีม');
        return;
      }
      p.isLibero = wantsLibero;
      normalizeLineupSelections();
      refreshLineupSelects();
      renderLineupPreview();
    });
    row.querySelector('.roster-remove').addEventListener('click', () => removeRosterPlayer(id));
  });
}

function addRosterPlayer() {
  const n = advanced.nextPlayerSeq++;
  advanced.players.push({ id:`p${Date.now()}_${n}`, name:`ผู้เล่น ${n}`, number:String(n), isLibero:false, stats:freshStats() });
  buildLineupInputs();
  const editor = $('rosterEditor'); if (editor) editor.scrollTop = editor.scrollHeight;
}

function removeRosterPlayer(id) {
  if (advanced.players.length <= 6) { toast('ต้องมีผู้เล่นอย่างน้อย 6 คน'); return; }
  if (Object.values(advanced.lineupSelections).includes(id)) { toast('ผู้เล่นคนนี้อยู่ใน Lineup กรุณาเปลี่ยน Lineup ก่อน'); return; }
  advanced.players = advanced.players.filter(p => p.id !== id);
  renderRosterEditor();
  refreshLineupSelects();
  renderLineupPreview();
}

function buildLineupInputs() {
  normalizeLineupSelections();
  renderRosterEditor();
  const host = $('lineupInputs'); if (!host) return;
  host.innerHTML = Array.from({length:6}, (_,i) => {
    const pos = i + 1;
    return `<div class="lineup-player-row lineup-select-row" data-pos="${pos}">
      <span class="position-chip">P${pos}</span>
      <label>ผู้เล่น<select class="lineup-player-select"></select></label>
    </div>`;
  }).join('');
  refreshLineupSelects();
  host.querySelectorAll('.lineup-player-select').forEach(sel => sel.addEventListener('change', e => {
    const pos = Number(e.target.closest('.lineup-player-row').dataset.pos);
    advanced.lineupSelections[pos] = e.target.value;
    normalizeLineupSelections();
    refreshLineupSelects();
    renderLineupPreview();
  }));
  renderLineupPreview();
}

function refreshLineupSelects() {
  const host = $('lineupInputs'); if (!host) return;
  normalizeLineupSelections();
  const selected = new Set(Object.values(advanced.lineupSelections));
  host.querySelectorAll('.lineup-player-row').forEach(row => {
    const pos = Number(row.dataset.pos), select = row.querySelector('.lineup-player-select');
    if (!select) return;
    const current = advanced.lineupSelections[pos];
    select.innerHTML = advanced.players.filter(p => !p.isLibero).map(p => {
      const disabled = selected.has(p.id) && p.id !== current;
      return `<option value="${p.id}" ${p.id===current?'selected':''} ${disabled?'disabled':''}>${escapeHtml(playerLabel(p))}</option>`;
    }).join('');
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function lineupDraftPlayers() {
  return Array.from({length:6}, (_,i) => {
    const pos = i + 1, p = playerById(advanced.lineupSelections[pos]);
    return p ? { ...p, startPos:pos } : null;
  }).filter(Boolean);
}

function playerCardHtml(p, position, preview=false) {
  const pair = !preview && p?.id ? pairForPlayer(p.id) : null;
  const pairText = pair ? `<em class="court-pair-badge ${pair.status}">${pair.status === 'active' ? 'PAIR ACTIVE' : 'PAIR CLOSED'}</em>` : '';
  const liberoText = !preview && p?.isLibero ? '<em class="court-libero-badge">LIBERO</em>' : '';
  return `<div class="court-player ${preview ? 'preview-player' : ''} ${p?.isLibero ? 'court-libero' : ''}" data-pos="${position}" data-player-id="${p.id || ''}">
    <span class="court-position">P${position}</span>
    <strong>#${escapeHtml(p.number)}</strong>
    <small>${escapeHtml(p.name)}</small>${liberoText}${pairText}
  </div>`;
}

function renderCourt(host, players, rotationCount=0, preview=false) {
  if (!host) return;
  const posMap = {};
  players.forEach(p => {
    const pos = preview ? p.startPos : (((p.startPos - 1 - rotationCount) % 6 + 6) % 6) + 1;
    posMap[pos] = p;
  });
  host.innerHTML = `<div class="court-net">NET</div>` + [4,3,2,5,6,1].map(pos => {
    const p = posMap[pos] || {id:'',name:'—',number:'—'};
    return `<div class="court-slot pos-${pos}">${playerCardHtml(p,pos,preview)}</div>`;
  }).join('') + `<div class="serve-zone">SERVICE • P1</div>`;
}

function renderLineupPreview() {
  const host = $('lineupPreviewCourt'); if (!host) return;
  renderCourt(host, lineupDraftPlayers(), 0, true);
}

function readSubLimit() {
  const value = $('substitutionLimitSelect')?.value || '6';
  if (value === 'custom') return Math.max(1, Math.min(30, Number($('customSubLimitInput')?.value || 6)));
  return Number(value);
}

function confirmLineup() {
  if (!state.started) { toast('เริ่มแมตช์ก่อนตั้ง Lineup'); return; }
  const draft = lineupDraftPlayers();
  if (draft.length !== 6 || new Set(draft.map(p=>p.id)).size !== 6) { toast('Lineup ต้องมีผู้เล่นไม่ซ้ำกันครบ 6 คน'); return; }
  const numbers = advanced.players.map(p => p.number.trim()).filter(Boolean);
  if (numbers.length !== advanced.players.length || new Set(numbers).size !== numbers.length) { toast('หมายเลขผู้เล่นทั้งหมดต้องไม่ว่างและไม่ซ้ำกัน'); return; }
  if (draft.some(p => p.isLibero)) { toast('Libero ไม่อยู่ใน Starting Lineup ปกติ'); return; }

  advanced.trackedTeam = $('trackedTeamSelect').value;
  const firstServer = $('firstServerSelect').value;
  advanced.firstServers[state.currentSet] = firstServer;
  advanced.subLimit = readSubLimit();
  advanced.rotationCount = 0;
  advanced.configuredSet = state.currentSet;
  advanced.liveSlots = Object.fromEntries(draft.map(p => [p.startPos, p.id]));
  advanced.liberoEvents = advanced.liberoEvents.filter(e => e.set !== state.currentSet);
  advanced.liberoStates[state.currentSet] = freshLiberoState();
  state.serving = firstServer;
  render();
  toast(`ยืนยัน Lineup SET ${state.currentSet} แล้ว`);
}

function courtPlayersForRender() {
  return Object.entries(advanced.liveSlots).map(([slot,id]) => {
    const p = playerById(id);
    return p ? { ...p, startPos:Number(slot) } : null;
  }).filter(Boolean);
}

function renderAdvancedPage() {
  const empty = $('rotationEmpty'), content = $('rotationContent');
  if (!empty || !content) return;
  empty.classList.toggle('hidden', state.started);
  content.classList.toggle('hidden', !state.started);
  if (!state.started) return;

  syncAdvancedTeamLabels();
  $('advancedTeamAScore').textContent = state.scores.A;
  $('advancedTeamBScore').textContent = state.scores.B;
  $('advancedSetLabel').textContent = `SET ${state.currentSet} • ${state.setsWon.A}–${state.setsWon.B}`;
  $('lineupSetBadge').textContent = `SET ${state.currentSet}`;
  $('lineupSetupTitle').textContent = `ตั้งค่าผู้เล่นสำหรับ SET ${state.currentSet}`;

  const configured = advanced.configuredSet === state.currentSet;
  $('lineupSetupCard').classList.toggle('hidden', configured);
  $('advancedLive').classList.toggle('hidden', !configured);
  renderAdvancedFlow();
  if (!configured) {
    const prev = advanced.firstServers[state.currentSet - 1];
    if (!$('firstServerSelect').dataset.touched) $('firstServerSelect').value = prev ? opponentOf(prev) : advanced.trackedTeam;
    buildLineupInputs();
    return;
  }

  const tracked = advanced.trackedTeam, opp = opponentOf(tracked);
  $('trackedTeamTitle').textContent = team(tracked).name;
  $('rotationNumberBadge').textContent = `ROTATION ${advanced.rotationCount % 6}`;
  $('advancedServingBadge').textContent = state.serving === tracked ? '● SERVING' : 'RECEIVING';
  $('advancedServingBadge').classList.toggle('receiving', state.serving !== tracked);
  $('trackedMiniName').textContent = team(tracked).name;
  $('opponentMiniName').textContent = team(opp).name;
  $('trackedMiniScore').textContent = state.scores[tracked];
  $('opponentMiniScore').textContent = state.scores[opp];
  $('trackedPointBtn').textContent = `+1 ${team(tracked).name}`;
  $('opponentPointBtn').textContent = `+1 ${team(opp).name}`;
  renderCourt($('liveCourt'), courtPlayersForRender(), advanced.rotationCount, false);
  renderBench();
  renderSubHistory();
  renderLiberoHistory();
  renderPlayerStats();
}

function renderAdvancedFlow() {
  const host = $('advancedPointFlow'); if (!host) return;
  const events = state.events.filter(e => e.set === state.currentSet);
  if (!events.length) {
    host.innerHTML = '<div class="advanced-flow-empty">Point Flow จะวิ่งจากซ้ายไปขวา • ทีม A ด้านบน / ทีม B ด้านล่าง</div>';
    return;
  }
  host.innerHTML = events.map((e,i) => `<div class="advanced-flow-step ${e.team === 'A' ? 'top' : 'bottom'}" title="${escapeHtml(e.reason || '')}">
    <span>${e.teamPoint}</span><i>${i+1}</i>
  </div>`).join('');
  host.scrollLeft = host.scrollWidth;
}

function rotateAdvanced(reason='manual', scoreEvent=null) {
  if (advanced.configuredSet !== state.currentSet) return;
  advanced.rotationCount += 1;
  maybeAutoReturnLibero(scoreEvent, reason);
  const court = $('liveCourt');
  court?.classList.remove('rotate-pulse'); void court?.offsetWidth; court?.classList.add('rotate-pulse');
  renderAdvancedPage();
  if (reason === 'sideout') toast('ได้สิทธิ์เสิร์ฟคืน • หมุนตำแหน่งอัตโนมัติ');
}

function pairBadgeForPlayer(p) {
  const pair = pairForPlayer(p.id);
  if (!pair) {
    if (p.isLibero) {
      const ls = currentLiberoState();
      return `<span class="pair-badge libero">${ls.activeLiberoId === p.id ? 'ACTING LIBERO' : 'LIBERO READY'}</span>`;
    }
    const ls = currentLiberoState();
    if (ls.activeLiberoId && ls.regularPlayerId === p.id) return `<span class="pair-badge libero">REPLACED BY LIBERO</span>`;
    return '<span class="pair-badge free">AVAILABLE</span>';
  }
  const otherId = pair.starterId === p.id ? pair.subId : pair.starterId;
  const other = playerById(otherId);
  return `<span class="pair-badge ${pair.status}">PAIR #${escapeHtml(other?.number || '—')} • ${pair.status.toUpperCase()}</span>`;
}

function renderBench() {
  const host = $('benchGrid'); if (!host) return;
  const bench = benchPlayers();
  $('substitutionCounter').textContent = `SUB ${currentSetSubEvents().length} / ${advanced.subLimit}`;
  if (!bench.length) { host.innerHTML = '<div class="advanced-flow-empty">ไม่มีผู้เล่นบนม้านั่ง</div>'; return; }
  host.innerHTML = bench.map(p => `<article class="bench-player ${p.isLibero?'is-libero':''}">
    <strong>#${escapeHtml(p.number)}</strong><span>${escapeHtml(p.name)}</span>${pairBadgeForPlayer(p)}
  </article>`).join('');
}

function renderSubHistory() {
  const host = $('subHistory'); if (!host) return;
  const events = currentSetSubEvents();
  if (!events.length) { host.innerHTML = '<div class="advanced-flow-empty">ยังไม่มีการเปลี่ยนตัวในเซตนี้</div>'; return; }
  host.innerHTML = events.map(e => {
    const outP = playerById(e.outId), inP = playerById(e.inId);
    return `<div class="sub-history-row"><b>${String(e.no).padStart(2,'0')}</b><span><strong>#${escapeHtml(outP?.number || '—')} OUT</strong> → <strong>#${escapeHtml(inP?.number || '—')} IN</strong><small>${escapeHtml(outP?.name || '')} → ${escapeHtml(inP?.name || '')}</small></span><em>${e.a}–${e.b}</em></div>`;
  }).join('');
}

function substitutionEligibility(outId, inId) {
  if (currentSetSubEvents().length >= advanced.subLimit) return { ok:false, reason:`ครบสิทธิ์เปลี่ยนตัว ${advanced.subLimit} ครั้งในเซตนี้แล้ว` };
  const slot = slotForPlayer(outId); if (!slot) return { ok:false, reason:'ผู้เล่น OUT ไม่ได้อยู่ในสนาม' };
  if (onCourtPlayerIds().includes(inId)) return { ok:false, reason:'ผู้เล่น IN อยู่ในสนามอยู่แล้ว' };
  const outP = playerById(outId), inP = playerById(inId);
  if (!outP || !inP) return { ok:false, reason:'ไม่พบข้อมูลผู้เล่น' };
  if (outP.isLibero || inP.isLibero) return { ok:false, reason:'Libero ต้องใช้ระบบ Libero Replacement แยกจากการเปลี่ยนตัวปกติ' };
  const liberoState = currentLiberoState();
  if (liberoState.activeLiberoId && liberoState.regularPlayerId === inId) {
    return { ok:false, reason:`${playerLabel(inP)} กำลังเป็นผู้เล่นเดิมที่ถูก Acting Libero แทนอยู่ ต้องกลับผ่าน Libero Replacement เท่านั้น` };
  }
  const outPair = pairForPlayer(outId), inPair = pairForPlayer(inId);
  if (!outPair && !inPair) {
    if (advanced.lineupSelections[slot] !== outId) return { ok:false, reason:'ผู้เล่นคนนี้ไม่ใช่ตัวจริงเดิมของช่อง Rotation นี้' };
    return { ok:true, kind:'enter', slot, reason:`สร้างคู่ ${playerLabel(outP)} ⇄ ${playerLabel(inP)}` };
  }
  if (!outPair || !inPair || outPair !== inPair) {
    const locked = outPair || inPair;
    const a = playerById(locked?.starterId), b = playerById(locked?.subId);
    return { ok:false, reason:`เปลี่ยนไม่ได้: ผู้เล่นถูกล็อกคู่ ${playerLabel(a)} ⇄ ${playerLabel(b)} ในเซตนี้แล้ว` };
  }
  if (outPair.status === 'closed') return { ok:false, reason:`คู่ ${playerLabel(playerById(outPair.starterId))} ⇄ ${playerLabel(playerById(outPair.subId))} ใช้สิทธิ์กลับเข้าสนามครบแล้ว` };
  if (outId === outPair.subId && inId === outPair.starterId) return { ok:true, kind:'return', slot, pair:outPair, reason:'อนุญาตเฉพาะตัวจริงคนเดิมกลับเข้าแทน' };
  return { ok:false, reason:`เปลี่ยนไม่ได้: ${playerLabel(playerById(outPair.subId))} ออกได้โดยให้ ${playerLabel(playerById(outPair.starterId))} กลับเข้าเท่านั้น` };
}

function openSubstitutionModal() {
  if (advanced.configuredSet !== state.currentSet) return;
  if (currentSetSubEvents().length >= advanced.subLimit) { toast(`ครบสิทธิ์เปลี่ยนตัว ${advanced.subLimit} ครั้งแล้ว`); return; }
  const outSelect = $('subOutSelect');
  outSelect.innerHTML = onCourtPlayers().filter(p => !p.isLibero).map(p => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join('');
  refreshSubstitutionModal();
  $('substitutionModal').classList.remove('hidden');
}

function refreshSubstitutionModal() {
  const outId = $('subOutSelect')?.value;
  const inSelect = $('subInSelect'); if (!outId || !inSelect) return;
  const bench = benchPlayers();
  inSelect.innerHTML = bench.map(p => {
    const chk = substitutionEligibility(outId, p.id);
    return `<option value="${p.id}" ${chk.ok?'':'disabled'}>${escapeHtml(playerLabel(p))}${chk.ok?'':` — ${escapeHtml(chk.reason)}`}</option>`;
  }).join('');
  const enabled = [...inSelect.options].find(o => !o.disabled);
  if (enabled) inSelect.value = enabled.value;
  const check = enabled ? substitutionEligibility(outId, enabled.value) : {ok:false,reason:'ไม่มีตัวสำรองที่มีสิทธิ์เปลี่ยนกับผู้เล่นคนนี้'};
  $('confirmSubstitutionBtn').disabled = !check.ok;
  $('subRuleNote').textContent = check.reason;
  renderSubPairPreview();
}

function renderSubPairPreview() {
  const outId = $('subOutSelect')?.value, inId = $('subInSelect')?.value;
  const host = $('subPairPreview'); if (!host) return;
  if (!outId || !inId) { host.innerHTML = ''; return; }
  const outP = playerById(outId), inP = playerById(inId), check = substitutionEligibility(outId,inId);
  host.innerHTML = `<div class="sub-player-preview"><span>OUT</span><strong>#${escapeHtml(outP?.number || '—')}</strong><small>${escapeHtml(outP?.name || '')}</small></div><b>⇄</b><div class="sub-player-preview"><span>IN</span><strong>#${escapeHtml(inP?.number || '—')}</strong><small>${escapeHtml(inP?.name || '')}</small></div><p class="${check.ok?'ok':'error'}">${escapeHtml(check.reason)}</p>`;
  $('confirmSubstitutionBtn').disabled = !check.ok;
  $('subRuleNote').textContent = check.ok ? 'ระบบตรวจสอบแล้ว สามารถเปลี่ยนตัวได้' : check.reason;
}

function closeSubstitutionModal() { $('substitutionModal').classList.add('hidden'); }

function confirmSubstitution() {
  const outId = $('subOutSelect').value, inId = $('subInSelect').value;
  const check = substitutionEligibility(outId,inId);
  if (!check.ok) { $('subRuleNote').textContent = check.reason; toast('ไม่สามารถเปลี่ยนตัวได้'); return; }
  let pair = check.pair;
  if (check.kind === 'enter') {
    pair = { set:state.currentSet, starterId:outId, subId:inId, slot:check.slot, status:'active' };
    advanced.subPairs.push(pair);
  } else {
    pair.status = 'closed';
  }
  advanced.liveSlots[check.slot] = inId;
  advanced.subEvents.push({
    set:state.currentSet, no:currentSetSubEvents().length + 1, kind:check.kind, outId, inId,
    slot:check.slot, a:state.scores.A, b:state.scores.B, ts:Date.now()
  });
  closeSubstitutionModal();
  renderAdvancedPage();
  const outP = playerById(outId), inP = playerById(inId);
  toast(`${playerLabel(outP)} OUT → ${playerLabel(inP)} IN`);
}

function liberoEligibility(outId, inId) {
  const outP = playerById(outId), inP = playerById(inId);
  if (!outP || !inP) return {ok:false, reason:'ไม่พบข้อมูลผู้เล่น'};
  const outSlot = slotForPlayer(outId);
  if (!outSlot) return {ok:false, reason:'ผู้เล่น OUT ไม่ได้อยู่ในสนาม'};
  if (onCourtPlayerIds().includes(inId)) return {ok:false, reason:'ผู้เล่น IN อยู่ในสนามอยู่แล้ว'};

  const ls = currentLiberoState();
  const rallyCount = currentRallyCount();
  if (ls.eventCount > 0 && rallyCount <= (ls.lastRallyCount ?? 0)) {
    return {ok:false, reason:'ต้องมี Rally ที่จบสมบูรณ์อย่างน้อย 1 Rally ระหว่าง Libero Replacement'};
  }

  const currentPos = currentPositionForSlot(outSlot);
  if (!outP.isLibero && inP.isLibero) {
    if (ls.activeLiberoId) return {ok:false, reason:'มี Acting Libero อยู่ในสนามแล้ว อนุญาตให้มี Libero ในสนามได้เพียง 1 คน'};
    if (![1,5,6].includes(currentPos)) return {ok:false, reason:`Libero เข้าแทนได้เฉพาะแดนหลัง P1 / P5 / P6 เท่านั้น (ขณะนี้ P${currentPos})`};
    return {ok:true, kind:'enter', slot:outSlot, reason:`${playerLabel(inP)} เข้าแทน ${playerLabel(outP)} ที่ P${currentPos}`};
  }

  if (outP.isLibero && !inP.isLibero) {
    if (ls.activeLiberoId !== outId) return {ok:false, reason:'ผู้เล่น OUT ไม่ใช่ Acting Libero ปัจจุบัน'};
    if (ls.regularPlayerId !== inId) return {ok:false, reason:`Libero คนนี้ต้องออกให้ ${playerLabel(playerById(ls.regularPlayerId))} ซึ่งเป็นผู้เล่นเดิมของตำแหน่งนี้กลับเข้าเท่านั้น`};
    return {ok:true, kind:'return', slot:ls.slot, reason:'ผู้เล่นเดิมกลับเข้าแทน Acting Libero'};
  }

  if (outP.isLibero && inP.isLibero) {
    if (ls.activeLiberoId !== outId) return {ok:false, reason:'ผู้เล่น OUT ไม่ใช่ Acting Libero ปัจจุบัน'};
    if (outId === inId) return {ok:false, reason:'เลือก Libero คนเดิมไม่ได้'};
    return {ok:true, kind:'libero_switch', slot:ls.slot, reason:`สลับ Acting Libero เป็น ${playerLabel(inP)}`};
  }

  return {ok:false, reason:'ผู้เล่นปกติ ⇄ ผู้เล่นปกติ ให้ใช้ปุ่ม “เปลี่ยนตัว”'};
}

function openLiberoModal() {
  if (advanced.configuredSet !== state.currentSet) return;
  const liberos = advanced.players.filter(p => p.isLibero);
  if (!liberos.length) { toast('ยังไม่ได้กำหนด Libero ในรายชื่อผู้เล่น'); return; }
  const outSelect = $('liberoOutSelect');
  outSelect.innerHTML = onCourtPlayers().map(p => `<option value="${p.id}">${escapeHtml(playerLabel(p))}${p.isLibero ? ' • LIBERO' : ` • P${currentPositionForSlot(slotForPlayer(p.id))}`}</option>`).join('');
  refreshLiberoModal();
  $('liberoModal').classList.remove('hidden');
}

function refreshLiberoModal() {
  const outId = $('liberoOutSelect')?.value;
  const inSelect = $('liberoInSelect');
  if (!outId || !inSelect) return;
  const bench = benchPlayers();
  inSelect.innerHTML = bench.map(p => {
    const chk = liberoEligibility(outId, p.id);
    return `<option value="${p.id}" ${chk.ok?'':'disabled'}>${escapeHtml(playerLabel(p))}${p.isLibero?' • LIBERO':''}${chk.ok?'':` — ${escapeHtml(chk.reason)}`}</option>`;
  }).join('');
  const enabled = [...inSelect.options].find(o => !o.disabled);
  if (enabled) inSelect.value = enabled.value;
  renderLiberoPreview();
}

function renderLiberoPreview() {
  const outId = $('liberoOutSelect')?.value, inId = $('liberoInSelect')?.value;
  const host = $('liberoPairPreview');
  if (!host) return;
  if (!outId || !inId) {
    host.innerHTML = '';
    $('confirmLiberoBtn').disabled = true;
    $('liberoRuleNote').textContent = 'ไม่มีคู่ผู้เล่นที่สามารถทำ Libero Replacement ได้ในขณะนี้';
    return;
  }
  const outP = playerById(outId), inP = playerById(inId), check = liberoEligibility(outId,inId);
  host.innerHTML = `<div class="sub-player-preview"><span>OUT</span><strong>#${escapeHtml(outP?.number || '—')}</strong><small>${escapeHtml(outP?.name || '')}</small></div><b>⇄</b><div class="sub-player-preview libero-preview"><span>IN</span><strong>#${escapeHtml(inP?.number || '—')}</strong><small>${escapeHtml(inP?.name || '')}</small></div><p class="${check.ok?'ok':'error'}">${escapeHtml(check.reason)}</p>`;
  $('confirmLiberoBtn').disabled = !check.ok;
  $('liberoRuleNote').textContent = check.ok ? 'Libero Replacement นี้ถูกต้องตามเงื่อนไขที่ระบบตรวจสอบ' : check.reason;
}

function closeLiberoModal() { $('liberoModal').classList.add('hidden'); }

function confirmLiberoReplacement() {
  const outId = $('liberoOutSelect').value, inId = $('liberoInSelect').value;
  const check = liberoEligibility(outId,inId);
  if (!check.ok) { $('liberoRuleNote').textContent = check.reason; toast('ไม่สามารถทำ Libero Replacement ได้'); return; }
  const ls = currentLiberoState();
  const before = { ...ls };
  advanced.liveSlots[check.slot] = inId;
  if (check.kind === 'enter') {
    ls.activeLiberoId = inId; ls.regularPlayerId = outId; ls.slot = check.slot;
  } else if (check.kind === 'return') {
    ls.activeLiberoId = null; ls.regularPlayerId = null; ls.slot = null;
  } else if (check.kind === 'libero_switch') {
    ls.activeLiberoId = inId;
  }
  ls.lastRallyCount = currentRallyCount();
  ls.eventCount += 1;
  const evt = {
    id:`lib_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, set:state.currentSet, no:currentSetLiberoEvents().length+1,
    kind:check.kind, outId, inId, slot:check.slot, a:state.scores.A, b:state.scores.B,
    rallyCount:currentRallyCount(), before
  };
  advanced.liberoEvents.push(evt);
  closeLiberoModal();
  renderAdvancedPage();
  toast(check.kind === 'libero_switch' ? 'สลับ Acting Libero แล้ว' : `${playerLabel(playerById(outId))} OUT → ${playerLabel(playerById(inId))} IN`);
}

function maybeAutoReturnLibero(scoreEvent=null, reason='sideout') {
  const ls = currentLiberoState();
  if (!ls.activeLiberoId || !ls.regularPlayerId || !ls.slot) return;
  const pos = currentPositionForSlot(ls.slot);
  if (![2,3,4].includes(pos)) return;
  const liberoId = ls.activeLiberoId, regularId = ls.regularPlayerId, slot = ls.slot;
  const snapshot = { ...ls };
  advanced.liveSlots[slot] = regularId;
  ls.activeLiberoId = null; ls.regularPlayerId = null; ls.slot = null;
  ls.lastRallyCount = currentRallyCount();
  ls.eventCount += 1;
  const evt = {
    id:`lib_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, set:state.currentSet, no:currentSetLiberoEvents().length+1,
    kind:'auto_return_front_row', outId:liberoId, inId:regularId, slot, a:state.scores.A, b:state.scores.B,
    rallyCount:currentRallyCount(), auto:true, before:snapshot
  };
  advanced.liberoEvents.push(evt);
  if (scoreEvent) scoreEvent.liberoAutoReturn = { eventId:evt.id, snapshot, slot, liberoId, regularId };
  if (reason === 'sideout') toast('Libero ถึงแดนหน้า • ระบบคืนผู้เล่นเดิมอัตโนมัติ');
}

function rollbackLiberoAutoReturn(scoreEvent) {
  const auto = scoreEvent?.liberoAutoReturn;
  if (!auto) return;
  advanced.liberoEvents = advanced.liberoEvents.filter(e => e.id !== auto.eventId);
  advanced.liberoStates[state.currentSet] = { ...auto.snapshot };
  advanced.liveSlots[auto.slot] = auto.liberoId;
}

function renderLiberoHistory() {
  const host = $('liberoHistory'); if (!host) return;
  const events = currentSetLiberoEvents();
  const ls = currentLiberoState();
  const active = ls.activeLiberoId ? playerLabel(playerById(ls.activeLiberoId)) : 'ไม่มี Libero ในสนาม';
  $('actingLiberoBadge').textContent = ls.activeLiberoId ? `ACTING • ${active}` : 'LIBERO OFF COURT';
  if (!events.length) { host.innerHTML = '<div class="advanced-flow-empty">ยังไม่มี Libero Replacement ในเซตนี้</div>'; return; }
  host.innerHTML = events.map(e => {
    const outP=playerById(e.outId), inP=playerById(e.inId);
    const label = e.kind === 'enter' ? 'ENTER' : e.kind === 'return' ? 'RETURN' : e.kind === 'libero_switch' ? 'SWITCH' : 'AUTO RETURN';
    return `<div class="sub-history-row libero-history-row"><b>${String(e.no).padStart(2,'0')}</b><span><strong>${label}</strong> • #${escapeHtml(outP?.number||'—')} → #${escapeHtml(inP?.number||'—')}<small>${escapeHtml(outP?.name||'')} → ${escapeHtml(inP?.name||'')}</small></span><em>${e.a}–${e.b}</em></div>`;
  }).join('');
}

const positiveReasons = [
  ['attack_kill','ตบทำแต้ม','positive',true],
  ['service_ace','เสิร์ฟเอซ','positive',true],
  ['block_point','บล็อกทำแต้ม','positive',true],
  ['opponent_error','คู่แข่งทำเสีย','positive',false],
  ['other_point','อื่น ๆ','positive',false]
];
const opponentReasons = [
  ['opponent_kill','คู่แข่งทำแต้ม','opponent',false],
  ['service_error','เสิร์ฟเสีย','error',true],
  ['attack_error','ตบเสีย','error',true],
  ['reception_error','รับเสิร์ฟเสีย','error',true],
  ['block_error','บล็อกผิดพลาด','error',true],
  ['other_error','อื่น ๆ','opponent',false]
];

function openRallyModal(winner) {
  if (state.pendingSetWinner || advanced.configuredSet !== state.currentSet) return;
  advanced.pendingWinner = winner; advanced.selectedReason = null;
  const isTracked = winner === advanced.trackedTeam;
  $('rallyModalTitle').textContent = isTracked ? `${team(winner).name} ได้แต้มจากอะไร?` : `${team(winner).name} ได้แต้ม • สาเหตุคืออะไร?`;
  const reasons = isTracked ? positiveReasons : opponentReasons;
  $('reasonGrid').innerHTML = reasons.map(([key,label,outcome,needsPlayer]) => `<button type="button" class="reason-btn" data-reason="${key}" data-outcome="${outcome}" data-player="${needsPlayer ? '1':'0'}">${label}</button>`).join('');
  $('reasonGrid').querySelectorAll('.reason-btn').forEach(btn => btn.addEventListener('click', () => selectReason(btn)));
  $('playerPickerWrap').classList.add('hidden');
  $('confirmRallyBtn').disabled = true;
  $('rallyModal').classList.remove('hidden');
}

function selectReason(btn) {
  $('reasonGrid').querySelectorAll('.reason-btn').forEach(b => b.classList.toggle('selected', b === btn));
  advanced.selectedReason = { key: btn.dataset.reason, outcome: btn.dataset.outcome, needsPlayer: btn.dataset.player === '1' };
  const wrap = $('playerPickerWrap');
  wrap.classList.toggle('hidden', !advanced.selectedReason.needsPlayer);
  if (advanced.selectedReason.needsPlayer) {
    $('rallyPlayerSelect').innerHTML = onCourtPlayers().map(p => `<option value="${p.id}">#${escapeHtml(p.number)} ${escapeHtml(p.name)}</option>`).join('');
  }
  $('confirmRallyBtn').disabled = false;
}

function closeRallyModal() {
  $('rallyModal').classList.add('hidden');
  advanced.pendingWinner = null; advanced.selectedReason = null;
}

function applyPlayerStat(playerId, reason) {
  if (!playerId) return;
  const p = advanced.players.find(x => x.id === playerId); if (!p) return;
  const map = { attack_kill:'attack', service_ace:'ace', block_point:'block', service_error:'serviceError', attack_error:'attackError', reception_error:'receptionError', block_error:'blockError' };
  if (map[reason]) p.stats[map[reason]] += 1;
}

function confirmRally() {
  const winner = advanced.pendingWinner, reason = advanced.selectedReason;
  if (!winner || !reason) return;
  const previousServer = state.serving;
  const playerId = reason.needsPlayer ? $('rallyPlayerSelect').value : null;
  state.scores[winner] += 1;
  const evt = {
    set: state.currentSet, team: winner, teamPoint: state.scores[winner], a: state.scores.A, b: state.scores.B,
    ts: Date.now(), reason: reason.key, playerId, rotated: false
  };
  state.events.push(evt);
  applyPlayerStat(playerId, reason.key);
  if (winner === advanced.trackedTeam && previousServer && previousServer !== winner) {
    evt.rotated = true;
    rotateAdvanced('sideout', evt);
  }
  state.serving = winner;
  closeRallyModal();
  render();
  if (isSetWon(winner)) completeSet(winner);
}

function playerTotalPoints(p) { return p.stats.attack + p.stats.ace + p.stats.block; }
function playerTotalErrors(p) { return p.stats.serviceError + p.stats.attackError + p.stats.receptionError + p.stats.blockError; }
function playerSuggestion(p) {
  const s = p.stats;
  if (s.receptionError >= 2) return 'เน้นความนิ่งในการรับเสิร์ฟ';
  if (s.serviceError > s.ace && s.serviceError >= 2) return 'ลดความผิดพลาดจากการเสิร์ฟ';
  if (s.attackError > s.attack && s.attackError >= 2) return 'เพิ่มความแม่นยำในการโจมตี';
  if (s.blockError >= 2) return 'ปรับจังหวะและตำแหน่งการบล็อก';
  if (playerTotalPoints(p) >= 5) return 'จุดเด่น: สร้างคะแนนให้ทีมได้ดี';
  return 'เก็บข้อมูลเพิ่มเพื่อวิเคราะห์แนวโน้ม';
}

function renderPlayerStats() {
  const host = $('playerStatsGrid'); if (!host) return;
  host.innerHTML = advanced.players.map(p => `<article class="player-stat-card">
    <div class="player-stat-head"><span>#${escapeHtml(p.number)}</span><strong>${escapeHtml(p.name)}</strong><b>${playerTotalPoints(p)} PTS</b></div>
    <div class="stat-chips"><span>KILL ${p.stats.attack}</span><span>ACE ${p.stats.ace}</span><span>BLOCK ${p.stats.block}</span><span>ERR ${playerTotalErrors(p)}</span></div>
    <p>${playerSuggestion(p)}</p>
  </article>`).join('');
}

async function exportPlayerStats() {
  if (!state.started) return;
  const w = 1080, h = 1350, c = document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  const palette = exportPalette();
  const g=x.createLinearGradient(0,0,w,h); g.addColorStop(0,palette.bg0); g.addColorStop(.6,palette.bg1); g.addColorStop(1,palette.bg2); x.fillStyle=g; x.fillRect(0,0,w,h);
  x.strokeStyle=palette.grid; x.lineWidth=1; for(let i=0;i<w;i+=72){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()} for(let j=0;j<h;j+=72){x.beginPath();x.moveTo(0,j);x.lineTo(w,j);x.stroke()}
  x.fillStyle=palette.kicker; x.font='900 28px Arial'; x.fillText('PLAYER PERFORMANCE',72,90);
  x.fillStyle=palette.text; x.font='900 52px Arial'; x.fillText(team(advanced.trackedTeam).name.toUpperCase(),72,155);
  x.fillStyle=palette.muted; x.font='700 25px Arial'; x.fillText(`${team('A').name} ${state.setsWon.A} – ${state.setsWon.B} ${team('B').name}  •  SET ${state.currentSet}`,72,200);
  const sorted=[...advanced.players].sort((a,b)=>playerTotalPoints(b)-playerTotalPoints(a));
  const visible = sorted.slice(0, 8);
  const rowH = visible.length > 6 ? 116 : 138;
  let y=285;
  for (const player of visible) {
    x.fillStyle=activeTheme()==='dark'?'rgba(255,255,255,.055)':'rgba(21,94,239,.055)'; x.fillRect(62,y-44,956,rowH-8);
    x.fillStyle=palette.kicker; x.font='900 32px Arial'; x.fillText(`#${player.number}`,88,y);
    x.fillStyle=palette.text; x.font='900 29px Arial'; x.fillText(player.name,178,y);
    x.textAlign='right'; x.font='900 40px Impact, Arial Black, sans-serif'; x.fillText(`${playerTotalPoints(player)} PTS`,990,y); x.textAlign='left';
    x.fillStyle=palette.muted; x.font='700 19px Arial'; x.fillText(`KILL ${player.stats.attack}   ACE ${player.stats.ace}   BLOCK ${player.stats.block}   ERROR ${playerTotalErrors(player)}`,178,y+34);
    if (rowH >= 130) { x.fillStyle=palette.text; x.font='600 18px Arial'; x.fillText(playerSuggestion(player),178,y+62); }
    y+=rowH;
  }
  if (sorted.length > visible.length) {
    x.fillStyle=palette.muted; x.font='700 18px Arial'; x.fillText(`+ ผู้เล่นอีก ${sorted.length-visible.length} คนในรายงานเต็ม`,72,1240);
  }
  x.fillStyle=palette.footer; x.font='900 18px Arial'; x.fillText(`VOLLEYBALL • ROTATION • SUB ${currentSetSubEvents().length}/${advanced.subLimit}`,72,1290);
  const a=document.createElement('a'); a.download=`player-stats-${team(advanced.trackedTeam).name}.png`; a.href=c.toDataURL('image/png',1); a.click();
}

$('goLiveScoreBtn').addEventListener('click', () => switchPage('scorePage'));
$('trackedTeamSelect').addEventListener('change', e => { advanced.trackedTeam = e.target.value; renderLineupPreview(); });
$('firstServerSelect').addEventListener('change', e => { e.currentTarget.dataset.touched = '1'; });
$('substitutionLimitSelect').addEventListener('change', e => {
  $('customSubLimitWrap').classList.toggle('hidden', e.target.value !== 'custom');
});
$('addRosterPlayerBtn').addEventListener('click', addRosterPlayer);
$('confirmLineupBtn').addEventListener('click', confirmLineup);
$('manualRotateBtn').addEventListener('click', () => rotateAdvanced('manual'));
$('openSubstitutionBtn').addEventListener('click', openSubstitutionModal);
$('openLiberoBtn').addEventListener('click', openLiberoModal);
$('liberoOutSelect').addEventListener('change', refreshLiberoModal);
$('liberoInSelect').addEventListener('change', renderLiberoPreview);
$('cancelLiberoBtn').addEventListener('click', closeLiberoModal);
$('confirmLiberoBtn').addEventListener('click', confirmLiberoReplacement);
$('subOutSelect').addEventListener('change', refreshSubstitutionModal);
$('subInSelect').addEventListener('change', renderSubPairPreview);
$('cancelSubstitutionBtn').addEventListener('click', closeSubstitutionModal);
$('confirmSubstitutionBtn').addEventListener('click', confirmSubstitution);
$('editLineupBtn').addEventListener('click', () => {
  if ((currentSetSubEvents().length || currentSetLiberoEvents().length) && !confirm('เซตนี้มีประวัติการเปลี่ยนตัวหรือ Libero Replacement แล้ว การแก้ Lineup จะล้างประวัติของเซตนี้ ต้องการทำต่อหรือไม่?')) return;
  advanced.subPairs = advanced.subPairs.filter(p => p.set !== state.currentSet);
  advanced.subEvents = advanced.subEvents.filter(e => e.set !== state.currentSet);
  advanced.liberoEvents = advanced.liberoEvents.filter(e => e.set !== state.currentSet);
  advanced.liberoStates[state.currentSet] = freshLiberoState();
  advanced.configuredSet = null; buildLineupInputs(); renderAdvancedPage();
});
$('trackedPointBtn').addEventListener('click', () => openRallyModal(advanced.trackedTeam));
$('opponentPointBtn').addEventListener('click', () => openRallyModal(opponentOf(advanced.trackedTeam)));
$('cancelRallyBtn').addEventListener('click', closeRallyModal);
$('confirmRallyBtn').addEventListener('click', confirmRally);
$('exportPlayerStatsBtn').addEventListener('click', exportPlayerStats);
$('themeToggle').addEventListener('click', toggleTheme);

applyTheme(activeTheme(), false);
syncFullscreenButton();
$('matchDateInput').value = todayIso();
loadMatchOptions(); renderExport(selectedMatch()); updatePreviewRatio();
