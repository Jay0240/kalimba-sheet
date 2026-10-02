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
  sheetTopWithBars: 123.1, sheetTopNoBars: 40,
  sheetGapBelow: 12,
  handsW: 150, handW: 14, handH: 22, handRowGap: 6, handsPerRow: 8,
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
    showKeys: true, keyCount: 17, cols: 8,
    rows: Array.from({ length: 4 }, () => ({ cells: Array(8).fill(''), gapAfter: false })),
    showHands: true, handCount: 16
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
function availNotes(keyCount) {
  const all = [1, 2, 3, 4, 5, 6, 7];
  return [
    { up: 0, nums: all },
    { up: 1, nums: all },
    { up: 2, nums: keyCount >= 21 ? all : [1, 2, 3] }
  ];
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
function mergeCells(cells) {
  const out = [];
  let i = 0;
  while (i < cells.length) {
    const parts = [cells[i]];
    let j = i + 1;
    if (cells[i] !== '-') {
      while (j < cells.length && cells[j] === '-') { parts.push('-'); j++; }
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
  const sheetTop = song.showKeys ? LAY.sheetTopWithBars : LAY.sheetTopNoBars;
  let sheetH = 0;
  groups.forEach((g, i) => {
    sheetH += g.length * LAY.rowH;
    if (i < groups.length - 1) sheetH += LAY.groupGap;
  });
  const handRows = song.showHands && song.handCount > 0
    ? Math.ceil(song.handCount / LAY.handsPerRow) : 0;
  const handsTop = sheetTop + sheetH + LAY.sheetGapBelow;
  const handsH = handRows ? handRows * LAY.handH + (handRows - 1) * LAY.handRowGap : 0;
  return { groups, sheetTop, sheetH, handsTop, handRows, handsH, bottom: handsTop + handsH };
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
function barWidth(n) { return n >= 21 ? 4.5 : 5.5; }

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
  $('#hand-count').textContent = song.handCount;
  $('#row-count').textContent = song.rows.length;
  $('#col-count').textContent = song.cols;
  $$('#pick-key button').forEach(b => b.classList.toggle('on', +b.dataset.n === song.keyCount));
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
    const L = layout(cur);
    $('#fit-hint').textContent = L.bottom > A4.h
      ? '⚠️ 내용이 A4 한 장을 넘었어요. 줄 수나 손 그림 개수를 줄여 주세요.'
      : `A4 한 장에 잘 들어가요 (아래 여백 ${Math.round(A4.h - L.bottom)}mm)`;
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
  cur.showKeys = e.target.checked; renderPreview(); persistSoon();
});

/* ══════════ ③ 표 크기 ══════════ */
function setRows(n) {
  n = Math.min(12, Math.max(1, n));
  while (cur.rows.length < n) cur.rows.push({ cells: Array(cur.cols).fill(''), gapAfter: false });
  cur.rows.length = n;
  if (sel.row >= n) sel.row = n - 1;
  $('#row-count').textContent = n;
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
          const cls = c === '-' ? 'dash' : (c === '' ? 'empty' : '');
          const on = (sel.row === ri && sel.cell === ci) ? ' sel' : '';
          return `<div class="cell ${cls}${on}" data-ri="${ri}" data-ci="${ci}">${c === '' ? '·' : noteHTML(c)}</div>`;
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
  if (btn.dataset.act === 'gap') cur.rows[ri].gapAfter = !cur.rows[ri].gapAfter;
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
          return `<button data-k="${noteLabel(n, r.up)}"${usable ? '' : ' disabled'}>
            <span class="note" data-up="${r.up}">${n}</span></button>`;
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

/* ══════════ 손 그림 (미리보기 아래) ══════════ */
$('#opt-hands').addEventListener('change', e => {
  cur.showHands = e.target.checked; renderPreview(); persistSoon();
});
$('#hand-minus').addEventListener('click', () => {
  cur.handCount = Math.max(0, cur.handCount - 1);
  $('#hand-count').textContent = cur.handCount; renderPreview(); persistSoon();
});
$('#hand-plus').addEventListener('click', () => {
  cur.handCount = Math.min(40, cur.handCount + 1);
  $('#hand-count').textContent = cur.handCount; renderPreview(); persistSoon();
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
    const n = cur.keyCount, w = barWidth(n);
    bars.style.display = 'flex';
    bars.innerHTML = barHeights(n).map(h => `<i style="width:${w}mm;height:${h}mm"></i>`).join('');
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
  hands.style.top = L.handsTop + 'mm';
  hands.style.gridTemplateColumns = `repeat(${LAY.handsPerRow}, ${LAY.handW}mm)`;
  hands.style.rowGap = LAY.handRowGap + 'mm';
  hands.innerHTML = (cur.showHands && cur.handCount > 0)
    ? Array(cur.handCount).fill(
        `<img src="${window.HAND_PNG}" style="width:${LAY.handW}mm;height:${LAY.handH}mm" alt="">`
      ).join('')
    : '';

  $('#paper').style.outline = L.bottom > A4.h ? '2px solid #e2614d' : 'none';
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
    const n = song.keyCount, w = barWidth(n);
    const left = (A4.w - LAY.barsW) / 2;
    const gap = n > 1 ? (LAY.barsW - n * w) / (n - 1) : 0;
    doc.rect(left, LAY.barsTop - LAY.line / 2, LAY.barsW, LAY.line, 'F');
    barHeights(n).forEach((h, i) => {
      const x = left + i * (w + gap);
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
    const hl = (A4.w - LAY.handsW) / 2;
    const gap = (LAY.handsW - LAY.handsPerRow * LAY.handW) / (LAY.handsPerRow - 1);
    for (let i = 0; i < song.handCount; i++) {
      const col = i % LAY.handsPerRow, row = Math.floor(i / LAY.handsPerRow);
      doc.addImage(window.HAND_PNG, 'PNG',
        hl + col * (LAY.handW + gap),
        L.handsTop + row * (LAY.handH + LAY.handRowGap),
        LAY.handW, LAY.handH, 'hand', 'MEDIUM');
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
