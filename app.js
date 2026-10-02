/* ══════════════════════════════════════════════════
   칼림바 악보
   흐름 — ① 제목 → ② 칼림바 → ③ 표 크기 → ④ 계이름 → ⑤ 인쇄
   미리보기와 PDF는 같은 좌표(LAY)를 공유한다
   ══════════════════════════════════════════════════ */

'use strict';

const A4 = { w: 210, h: 297 };

const LAY = {
  titleTop: 17.6, titleBox: 21.3, titleBoxH: 21, titleGap: 8.6,
  barsTop: 52.3, barsW: 154.2, barsMax: 57.5, barsMin: 14.7,
  sheetW: 174.4, rowH: 21.6, groupGap: 7, cellFont: 9,
  barsGapBelow: 13.3, sheetTopNoBars: 40,
  sheetGapBelow: 12,
  handsW: 150, handW: 14, handRowGap: 6, handGapMin: 1.5,
  safeBottom: 10,          // 종이 아래 최소 여백
  line: 0.5
};

const MM2PX = 96 / 25.4;
const STORE = 'kalimba.songs';
const LAST_STEP = 5;

let songs = [];
let cur = null;
let sel = { row: 0, cell: 0 };
let step = 1;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ══════════ 저장소 ══════════ */
function loadSongs() {
  try { songs = JSON.parse(localStorage.getItem(STORE)) || []; }
  catch { songs = []; }
}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(songs)); showSaved(); }
  catch { toast('저장 공간이 부족해요'); }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function newSong() {
  return {
    id: uid(), title: '', updatedAt: Date.now(),
    showKeys: true, keyCount: 10, keyScale: 1, cols: 8,
    rows: Array.from({ length: 4 }, () => ({ cells: Array(8).fill(''), gapAfter: false })),
    showHands: true, handCount: 16, handIcon: 'victory', handScale: 1
  };
}

/* ══════════ 계이름 ══════════
   '5'(기본) · "5'"(한 옥타브 위) · "5''"(두 옥타브 위) · '-'(길게) · ''(빈칸)  */
function parseNote(v) {
  if (!v || v === '-') return null;
  const m = /^([1-7])('{0,2})$/.exec(v);
  return m ? { num: m[1], up: m[2].length } : null;
}
function noteLabel(n, up) { return String(n) + "'".repeat(up); }
// 건반 수별로 올라가는 음역 (C 튜닝 기준)
const KEY_TYPES = [
  { n: 10, up1: 3 },     // 1~7 + 높음· 1~3
  { n: 13, up1: 6 }      // 1~7 + 높음· 1~6
];
function keyTypeOf(keyCount) {
  return KEY_TYPES.find(k => k.n === keyCount) || KEY_TYPES[0];
}
function availNotes(keyCount) {
  const t = keyTypeOf(keyCount);
  const seq = n => Array.from({ length: n }, (_, i) => i + 1);
  const rows = [{ up: 0, nums: seq(7) }];
  if (t.up1) rows.push({ up: 1, nums: seq(t.up1) });
  if (t.up2) rows.push({ up: 2, nums: seq(t.up2) });
  return rows;
}
function noteHTML(v) {
  if (v === '-') return '-';
  if (!v) return '';
  const p = parseNote(v);
  if (!p) return esc(v);
  return `<span class="note" data-up="${p.up}">${p.num}</span>`;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ══════════ 배치 계산 ══════════ */
// '-' 는 앞 칸에 이어 붙는다 (음을 길게)
function isJoin(v) { return v === '-'; }

function mergeCells(cells) {
  const out = [];
  let i = 0;
  while (i < cells.length) {
    const parts = [cells[i]];
    let j = i + 1;
    if (!isJoin(cells[i])) {
      while (j < cells.length && isJoin(cells[j])) { parts.push(cells[j]); j++; }
    }
    out.push({ parts, span: parts.length });
    i = j;
  }
  return out;
}
function groupRows(rows) {
  const groups = []; let g = [];
  rows.forEach(r => { g.push(r); if (r.gapAfter) { groups.push(g); g = []; } });
  if (g.length) groups.push(g);
  return groups;
}
function layout(song) {
  const groups = groupRows(song.rows);
  const sheetTop = song.showKeys
    ? LAY.barsTop + LAY.barsMax * keyScale(song) + LAY.barsGapBelow
    : LAY.sheetTopNoBars;
  let sheetH = 0;
  groups.forEach((g, i) => {
    sheetH += g.length * LAY.rowH;
    if (i < groups.length - 1) sheetH += LAY.groupGap;
  });
  const hb = handBox(song);
  const handRows = song.showHands && song.handCount > 0
    ? Math.ceil(song.handCount / hb.perRow) : 0;
  const handsTop = sheetTop + sheetH + (handRows ? LAY.sheetGapBelow : 0);
  const handsH = handRows ? handRows * hb.h + (handRows - 1) * LAY.handRowGap : 0;
  return { groups, sheetTop, sheetH, handsTop, handRows, handsH, hb,
           bottom: handsTop + handsH };
}
function cellFont(cols) {
  return +Math.min(LAY.cellFont, (LAY.sheetW / cols) * 0.52).toFixed(2);
}
function barHeights(n) {
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.abs(i - mid) / mid;
    return +(LAY.barsMax - (LAY.barsMax - LAY.barsMin) * r).toFixed(2);
  });
}
function barWidth(n) { return +(LAY.barsW / n * 0.62).toFixed(2); }
function icons() { return window.HAND_ICONS || []; }
function iconOf(song) {
  const list = icons();
  return list.find(i => i.key === song.handIcon) || list[0] || { png: '', ratio: 1.57 };
}
function handScale(song) {
  const v = song.handScale;
  return (typeof v === 'number' && v > 0) ? v : 1;
}
// 손 그림 한 칸 크기와 한 줄 개수 — 폭 150mm 안에 들어가게 계산
function handBox(song) {
  const w = LAY.handW * handScale(song);
  const h = w * iconOf(song).ratio;
  const perRow = Math.max(1, Math.floor((LAY.handsW + LAY.handGapMin) / (w + LAY.handGapMin)));
  const gap = perRow > 1 ? (LAY.handsW - perRow * w) / (perRow - 1) : 0;
  return { w, h, perRow, gap };
}

function keyScale(song) {
  const v = song.keyScale;
  return (typeof v === 'number' && v > 0) ? v : 1;   // 예전에 만든 곡 대비
}

/* ══════════ A4 한 장 제한 ══════════
   바꾸기 전에 미리 재보고, 종이를 넘으면 되돌린 뒤 이유를 알린다 */
function overflowMm(song) {
  return layout(song).bottom - (A4.h - LAY.safeBottom);
}
function tryChange(mutate, why) {
  const backup = JSON.parse(JSON.stringify(cur));
  mutate();
  const over = overflowMm(cur);
  if (over > 0) {
    Object.keys(cur).forEach(k => delete cur[k]);
    Object.assign(cur, backup);
    toast(why || `A4 한 장을 ${Math.ceil(over)}mm 넘어서 더 못 늘려요`);
    return false;
  }
  return true;
}

/* ══════════ 화면 전환 ══════════ */
function showList() {
  $('#view-edit').classList.add('hidden');
  $('#view-list').classList.remove('hidden');
  renderList();
}
function showEdit(song, startStep) {
  cur = song;
  sel = { row: 0, cell: 0 };
  $('#view-list').classList.add('hidden');
  $('#view-edit').classList.remove('hidden');
  $('#song-title').value = song.title;
  $('#opt-keys').checked = song.showKeys;
  $('#opt-hands').checked = song.showHands;
  renderIconPick();
  syncHandBar();
  $('#row-count').textContent = song.rows.length;
  $('#col-count').textContent = song.cols;
  $$('#pick-key button').forEach(b => b.classList.toggle('on', +b.dataset.n === song.keyCount));
  syncKeyScale();
  goStep(startStep || 1);
  renderKeypad();
  renderRows();
  renderPreview();
}

/* ══════════ 단계 ══════════ */
function goStep(n) {
  step = Math.min(LAST_STEP, Math.max(1, n));
  $$('.step').forEach(el => el.classList.toggle('on', +el.dataset.step === step));
  $$('#steps button').forEach(b => {
    const i = +b.dataset.step;
    b.classList.toggle('on', i === step);
    b.classList.toggle('done', i < step);
  });
  $('#keypad').classList.toggle('hidden', step !== 4);
  $('#btn-prev').disabled = step === 1;
  $('#btn-next').classList.toggle('hidden', step === LAST_STEP);
  if (step === 1) setTimeout(() => $('#song-title').focus(), 120);
  if (step === 4) updatePos();
  if (step === 5) {
    const over = overflowMm(cur);
    $('#fit-hint').textContent = over > 0
      ? `⚠️ A4 한 장을 ${Math.ceil(over)}mm 넘었어요. 줄 수나 그림 크기를 줄여 주세요.`
      : `A4 한 장에 잘 들어가요 (아래 여백 ${Math.round(A4.h - layout(cur).bottom)}mm)`;
  }
  setTimeout(fitPaper, 60);
}
$('#btn-prev').addEventListener('click', () => goStep(step - 1));
$('#btn-next').addEventListener('click', () => goStep(step + 1));
$('#steps').addEventListener('click', e => {
  const b = e.target.closest('button[data-step]');
  if (b) goStep(+b.dataset.step);
});

/* ══════════ 곡 목록 ══════════ */
function renderList() {
  $('#song-list').innerHTML = songs.map(s => {
    const d = new Date(s.updatedAt);
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const notes = s.rows.reduce((n, r) => n + r.cells.filter(c => c && c !== '-').length, 0);
    return `<div class="song-card" data-id="${s.id}">
      <h3>${esc(s.title) || '제목 없음'}</h3>
      <div class="meta">${s.keyCount}건반 · ${s.rows.length}줄 · 음 ${notes}개 · ${date}</div>
      <div class="card-actions">
        <button class="btn tiny" data-act="open">열기</button>
        <button class="btn tiny" data-act="copy">복제</button>
        <button class="btn tiny danger" data-act="del">삭제</button>
      </div>
    </div>`;
  }).join('');
  $('#list-empty').classList.toggle('hidden', songs.length > 0);
}
$('#song-list').addEventListener('click', e => {
  const card = e.target.closest('.song-card');
  if (!card) return;
  const song = songs.find(s => s.id === card.dataset.id);
  if (!song) return;
  const act = e.target.dataset.act;
  if (act === 'del') {
    if (confirm(`"${song.title || '제목 없음'}" 악보를 지울까요?`)) {
      songs = songs.filter(s => s.id !== song.id);
      persist(); renderList(); toast('삭제했어요');
    }
  } else if (act === 'copy') {
    const c = JSON.parse(JSON.stringify(song));
    c.id = uid(); c.title = (song.title || '제목 없음') + ' 사본'; c.updatedAt = Date.now();
    songs.unshift(c); persist(); renderList(); toast('복제했어요');
  } else {
    showEdit(song, 4);                 // 기존 곡은 계이름 입력부터
  }
});
$('#btn-new').addEventListener('click', () => {
  const s = newSong();
  songs.unshift(s); persist(); showEdit(s, 1);
});
$('#btn-back').addEventListener('click', () => { touch(); showList(); });

/* ══════════ ① 제목 ══════════ */
$('#song-title').addEventListener('input', () => {
  cur.title = $('#song-title').value;
  const n = [...cur.title].filter(c => c.trim()).length;
  $('#title-hint').textContent = n ? `네모 칸 ${n}개로 들어가요` : '';
  $('#now-title').textContent = cur.title || '제목 없음';
  renderPreview(); persistSoon();
});

/* ══════════ ② 칼림바 ══════════ */
$('#pick-key').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]'); if (!b) return;
  cur.keyCount = +b.dataset.n;
  $$('#pick-key button').forEach(x => x.classList.toggle('on', x === b));
  renderKeypad(); renderPreview(); persistSoon();
});
$('#opt-keys').addEventListener('change', e => {
  const want = e.target.checked;
  if (!tryChange(() => { cur.showKeys = want; },
      'A4 한 장을 넘어서 건반 그림을 넣을 수 없어요')) {
    e.target.checked = cur.showKeys; return;
  }
  syncKeyScale(); renderPreview(); persistSoon();
});

const KEY_SCALE_MIN = 0.5, KEY_SCALE_MAX = 1.4;
function syncKeyScale() {
  $('#key-scale-val').textContent = Math.round(keyScale(cur) * 100) + '%';
  $('#key-scale-field').style.opacity = cur.showKeys ? '1' : '.35';
}
function setKeyScale(v) {
  const n = +Math.min(KEY_SCALE_MAX, Math.max(KEY_SCALE_MIN, v)).toFixed(2);
  if (n === keyScale(cur)) return;
  if (!tryChange(() => { cur.keyScale = n; },
      'A4 한 장을 넘어서 더 키울 수 없어요')) return;
  syncKeyScale(); renderPreview(); persistSoon();
}
$('#key-scale-minus').addEventListener('click', () => setKeyScale(keyScale(cur) - 0.1));
$('#key-scale-plus').addEventListener('click', () => setKeyScale(keyScale(cur) + 0.1));

/* ══════════ ③ 표 크기 ══════════ */
function setRows(n) {
  n = Math.min(12, Math.max(1, n));
  if (n === cur.rows.length) return;
  const ok = tryChange(() => {
    while (cur.rows.length < n) cur.rows.push({ cells: Array(cur.cols).fill(''), gapAfter: false });
    cur.rows.length = n;
  }, 'A4 한 장을 넘어서 줄을 더 못 늘려요. 칼림바 그림이나 손 그림을 줄여 보세요');
  if (!ok) return;
  if (sel.row >= cur.rows.length) sel.row = cur.rows.length - 1;
  $('#row-count').textContent = cur.rows.length;
  renderRows(); renderPreview(); persistSoon();
}
function setCols(n) {
  n = Math.min(16, Math.max(2, n));
  cur.cols = n;
  cur.rows.forEach(r => {
    while (r.cells.length < n) r.cells.push('');
    r.cells.length = n;
  });
  if (sel.cell >= n) sel.cell = n - 1;
  $('#col-count').textContent = n;
  renderRows(); renderPreview(); persistSoon();
}
$('#row-minus').addEventListener('click', () => setRows(cur.rows.length - 1));
$('#row-plus').addEventListener('click', () => setRows(cur.rows.length + 1));
$('#col-minus').addEventListener('click', () => setCols(cur.cols - 1));
$('#col-plus').addEventListener('click', () => setCols(cur.cols + 1));

/* ══════════ ④ 계이름 ══════════ */
function renderRows() {
  $('#rows').innerHTML = cur.rows.map((r, ri) => `
    <div class="row-item" data-ri="${ri}">
      <div class="row-top">
        <span class="row-no">${ri + 1}줄</span>
        <span class="spacer"></span>
        <button data-act="gap" class="${r.gapAfter ? 'on' : ''}">아래 띄움</button>
        <button data-act="clear">비우기</button>
      </div>
      <div class="cells" style="grid-template-columns:repeat(${cur.cols},1fr)">
        ${r.cells.map((c, ci) => {
          const cls = isJoin(c) ? 'dash' : (c === '' ? 'blank' : '');
          const on = (sel.row === ri && sel.cell === ci) ? ' sel' : '';
          const face = c === '' ? '·' : noteHTML(c);
          return `<div class="cell ${cls}${on}" data-ri="${ri}" data-ci="${ci}">${face}</div>`;
        }).join('')}
      </div>
    </div>`).join('');
}
function updatePos() {
  $('#pos-mark').textContent = `${sel.row + 1}줄 ${sel.cell + 1}칸`;
  // 입력 중인 칸이 키패드에 가리지 않게 보이는 자리로 끌어온다
  const el = document.querySelector('.cell.sel');
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
$('#rows').addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (cell) {
    sel = { row: +cell.dataset.ri, cell: +cell.dataset.ci };
    renderRows(); updatePos();
    return;
  }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const ri = +btn.closest('.row-item').dataset.ri;
  if (btn.dataset.act === 'gap') {
    if (!tryChange(() => { cur.rows[ri].gapAfter = !cur.rows[ri].gapAfter; },
        'A4 한 장을 넘어서 줄을 띄울 수 없어요')) return;
  }
  if (btn.dataset.act === 'clear') cur.rows[ri].cells = Array(cur.cols).fill('');
  renderRows(); renderPreview(); persistSoon();
});

function renderKeypad() {
  if (!cur) return;
  const tag = { 0: '기본', 1: '높음 ·', 2: '높음 ··' };
  const rows = availNotes(cur.keyCount).slice().reverse();
  $('#octaves').innerHTML = rows.map(r => `
    <div class="oct-row">
      <span class="oct-tag">${tag[r.up]}</span>
      <div class="oct-keys">
        ${[1, 2, 3, 4, 5, 6, 7].map(n => {
          const usable = r.nums.includes(n);
          return usable
            ? `<button data-k="${noteLabel(n, r.up)}">
                 <span class="note" data-up="${r.up}">${n}</span></button>`
            : `<span class="key-blank"></span>`;
        }).join('')}
      </div>
    </div>`).join('');
}
$('#keypad').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if (!b || b.disabled || !cur) return;
  const k = b.dataset.k;
  const row = cur.rows[sel.row];
  if (!row) return;
  if (k === 'BS') {
    if (row.cells[sel.cell] !== '') row.cells[sel.cell] = '';
    else if (sel.cell > 0) { sel.cell--; row.cells[sel.cell] = ''; }
  } else {
    row.cells[sel.cell] = k;
    if (sel.cell < cur.cols - 1) sel.cell++;
    else if (sel.row < cur.rows.length - 1) { sel.row++; sel.cell = 0; }
  }
  renderRows(); updatePos(); renderPreview(); persistSoon();
});

/* ══════════ 색칠용 그림 (미리보기 아래) ══════════ */
const HAND_SCALE_MIN = 0.6, HAND_SCALE_MAX = 1.8;

function renderIconPick() {
  $('#icon-pick').innerHTML = icons().map(i =>
    `<button data-icon="${i.key}" title="${i.label}"
       class="${i.key === iconOf(cur).key ? 'on' : ''}">
       <img src="${i.png}" alt="${i.label}"></button>`).join('');
}
function syncHandBar() {
  $('#hand-count').textContent = cur.handCount;
  $('#hand-scale-val').textContent = Math.round(handScale(cur) * 100) + '%';
  const off = !cur.showHands;
  $('#icon-pick').style.opacity = off ? '.3' : '1';
  $$('.hand-bar .hb-item').forEach(el => el.style.opacity = off ? '.3' : '1');
}

$('#opt-hands').addEventListener('change', e => {
  const want = e.target.checked;
  if (!tryChange(() => { cur.showHands = want; },
      'A4 한 장을 넘어서 그림을 넣을 수 없어요')) {
    e.target.checked = cur.showHands; return;
  }
  syncHandBar(); renderPreview(); persistSoon();
});
$('#hand-minus').addEventListener('click', () => {
  cur.handCount = Math.max(0, cur.handCount - 1);
  syncHandBar(); renderPreview(); persistSoon();
});
$('#hand-plus').addEventListener('click', () => {
  if (cur.handCount >= 60) return;
  if (!tryChange(() => { cur.handCount += 1; },
      'A4 한 장을 넘어서 개수를 더 못 늘려요')) return;
  syncHandBar(); renderPreview(); persistSoon();
});
$('#hand-scale-minus').addEventListener('click', () => {
  cur.handScale = +Math.max(HAND_SCALE_MIN, handScale(cur) - 0.1).toFixed(2);
  syncHandBar(); renderPreview(); persistSoon();
});
$('#hand-scale-plus').addEventListener('click', () => {
  const n = +Math.min(HAND_SCALE_MAX, handScale(cur) + 0.1).toFixed(2);
  if (n === handScale(cur)) return;
  if (!tryChange(() => { cur.handScale = n; },
      'A4 한 장을 넘어서 더 키울 수 없어요')) return;
  syncHandBar(); renderPreview(); persistSoon();
});
$('#icon-pick').addEventListener('click', e => {
  const b = e.target.closest('button[data-icon]');
  if (!b) return;
  if (!tryChange(() => { cur.handIcon = b.dataset.icon; },
      'A4 한 장을 넘어서 이 그림으로 바꿀 수 없어요')) return;
  renderIconPick(); renderPreview(); persistSoon();
});

/* ══════════ 저장 ══════════ */
let persistTimer = null;
function touch() {
  if (!cur) return;
  cur.title = $('#song-title').value.trim();
  cur.updatedAt = Date.now();
  persist();
}
function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(touch, 500); }
let savedTimer = null;
function showSaved() {
  const m = $('#saved-mark');
  if (!m) return;
  m.textContent = '저장됨';
  m.classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => m.classList.remove('on'), 1400);
}

/* ══════════ 미리보기 ══════════ */
function renderPreview() {
  if (!cur) return;
  const L = layout(cur);

  $('#p-title').innerHTML = [...(cur.title || '')].filter(c => c.trim())
    .map(c => `<b>${esc(c)}</b>`).join('');

  const bars = $('#p-bars');
  if (cur.showKeys) {
    const n = cur.keyCount, k = keyScale(cur), w = barWidth(n) * k;
    bars.style.display = 'flex';
    bars.style.width = (LAY.barsW * k) + 'mm';
    bars.style.height = (LAY.barsMax * k) + 'mm';
    bars.innerHTML = barHeights(n)
      .map(h => `<i style="width:${w}mm;height:${(h * k).toFixed(2)}mm"></i>`).join('');
  } else {
    bars.style.display = 'none';
    bars.innerHTML = '';
  }

  const sheet = $('#p-sheet');
  sheet.style.top = L.sheetTop + 'mm';
  sheet.style.fontSize = cellFont(cur.cols) + 'mm';
  sheet.innerHTML = L.groups.map(g => `<table>${g.map(r => {
    const units = mergeCells(r.cells);
    return '<tr>' + units.map(u => {
      if (u.span === 1) return `<td>${noteHTML(u.parts[0])}</td>`;
      const w = (100 / u.span) + '%';
      return `<td class="merged" colspan="${u.span}">` +
        u.parts.map(p => `<span style="width:${w}">${noteHTML(p)}</span>`).join('') + '</td>';
    }).join('') + '</tr>';
  }).join('')}</table>`).join('');

  const hands = $('#p-hands');
  const hb = L.hb;
  hands.style.top = L.handsTop + 'mm';
  hands.style.gridTemplateColumns = `repeat(${hb.perRow}, ${hb.w}mm)`;
  hands.style.rowGap = LAY.handRowGap + 'mm';
  hands.innerHTML = (cur.showHands && cur.handCount > 0)
    ? Array(cur.handCount).fill(
        `<img src="${iconOf(cur).png}" style="width:${hb.w}mm;height:${hb.h}mm" alt="">`
      ).join('')
    : '';

  $('#paper').style.outline = overflowMm(cur) > 0 ? '2px solid #e2614d' : 'none';
  fitPaper();
}

function fitPaper() {
  const pane = document.querySelector('.preview-scroll');
  const scaler = $('#paper-scaler');
  const paper = $('#paper');
  if (!pane || !scaler) return;
  const s = Math.max(0.1, Math.min(
    (pane.clientWidth - 28) / (A4.w * MM2PX),
    (pane.clientHeight - 28) / (A4.h * MM2PX)
  ));
  paper.style.transform = `scale(${s})`;
  scaler.style.width = (A4.w * MM2PX * s) + 'px';
  scaler.style.height = (A4.h * MM2PX * s) + 'px';
}
window.addEventListener('resize', fitPaper);
window.addEventListener('orientationchange', () => setTimeout(fitPaper, 300));

/* ══════════ ⑤ 인쇄 · PDF ══════════ */
$('#btn-print').addEventListener('click', () => { touch(); window.print(); });

function charToPng(ch, boxMm) {
  const px = Math.round(boxMm * 14);
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
  g.fillStyle = '#000';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(px * 0.58)}px -apple-system, "Pretendard", "Apple SD Gothic Neo", sans-serif`;
  g.fillText(ch, px / 2, px / 2 + px * 0.02);
  return c.toDataURL('image/png');
}

// 계이름 한 글자 — 옥타브는 숫자 위 점으로
function drawNote(doc, v, cx, cy, f) {
  const p = parseNote(v);
  if (!p) { doc.text(String(v), cx, cy, { align: 'center', baseline: 'middle' }); return; }
  doc.text(p.num, cx, cy, { align: 'center', baseline: 'middle' });
  if (!p.up) return;
  const r = f * 0.075, dy = cy - f * 0.56;
  doc.setFillColor(0);
  if (p.up === 1) doc.circle(cx, dy, r, 'F');
  else { doc.circle(cx - r * 2.4, dy, r, 'F'); doc.circle(cx + r * 2.4, dy, r, 'F'); }
}

function buildPdf(song) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const L = layout(song);
  doc.setLineWidth(LAY.line); doc.setDrawColor(0); doc.setTextColor(0);

  const chars = [...(song.title || '')].filter(c => c.trim());
  if (chars.length) {
    const totalW = chars.length * LAY.titleBox + (chars.length - 1) * LAY.titleGap;
    let x = (A4.w - totalW) / 2;
    const inset = 1.2, imgW = LAY.titleBox - inset * 2;
    chars.forEach(ch => {
      doc.rect(x, LAY.titleTop, LAY.titleBox, LAY.titleBoxH);
      doc.addImage(charToPng(ch, imgW), 'PNG',
        x + inset, LAY.titleTop + (LAY.titleBoxH - imgW) / 2, imgW, imgW, 'ch-' + ch, 'MEDIUM');
      x += LAY.titleBox + LAY.titleGap;
    });
  }

  if (song.showKeys) {
    const n = song.keyCount, k = keyScale(song);
    const w = barWidth(n) * k, barsW = LAY.barsW * k;
    const left = (A4.w - barsW) / 2;
    const gap = n > 1 ? (barsW - n * w) / (n - 1) : 0;
    doc.rect(left, LAY.barsTop - LAY.line / 2, barsW, LAY.line, 'F');
    barHeights(n).forEach((h0, i) => {
      const h = h0 * k, x = left + i * (w + gap);
      doc.line(x, LAY.barsTop, x, LAY.barsTop + h);
      doc.line(x + w, LAY.barsTop, x + w, LAY.barsTop + h);
      doc.line(x, LAY.barsTop + h, x + w, LAY.barsTop + h);
    });
  }

  const left = (A4.w - LAY.sheetW) / 2;
  const cw = LAY.sheetW / song.cols;
  const cf = cellFont(song.cols);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(cf * 2.83465);
  let y = L.sheetTop;
  L.groups.forEach((g, gi) => {
    g.forEach(r => {
      const units = mergeCells(r.cells);
      let ci = 0;
      units.forEach(u => {
        const x = left + ci * cw, w = cw * u.span;
        doc.rect(x, y, w, LAY.rowH);
        u.parts.forEach((p, k) => {
          if (p === '') return;
          drawNote(doc, p, x + cw * (k + 0.5), y + LAY.rowH / 2, cf);
        });
        ci += u.span;
      });
      y += LAY.rowH;
    });
    if (gi < L.groups.length - 1) y += LAY.groupGap;
  });

  if (song.showHands && song.handCount > 0) {
    const ic = iconOf(song), hb = L.hb;
    const hl = (A4.w - LAY.handsW) / 2;
    for (let i = 0; i < song.handCount; i++) {
      const col = i % hb.perRow, row = Math.floor(i / hb.perRow);
      doc.addImage(ic.png, 'PNG',
        hl + col * (hb.w + hb.gap),
        L.handsTop + row * (hb.h + LAY.handRowGap),
        hb.w, hb.h, 'ic-' + ic.key, 'MEDIUM');
    }
  }
  return doc;
}

$('#btn-pdf').addEventListener('click', async () => {
  if (!cur) return;
  touch();
  try {
    const doc = buildPdf(cur);
    const name = ((cur.title || '칼림바악보').replace(/[\\/:*?"<>|]/g, '')) + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
    doc.save(name);
    toast('PDF를 저장했어요');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error(err);
    toast('PDF 저장에 실패했어요');
  }
});

/* ══════════ 토스트 ══════════ */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

/* ══════════ 시작 ══════════ */
loadSongs();
showList();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
