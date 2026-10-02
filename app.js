/* ══════════════════════════════════════════════════
   칼림바 악보 — 앱 로직
   미리보기와 PDF가 같은 좌표(LAY)를 쓰도록 한 곳에서 계산한다
   ══════════════════════════════════════════════════ */

'use strict';

/* ── A4 치수 (mm) ───────────────────────────── */
const A4 = { w: 210, h: 297 };

const LAY = {
  titleTop: 17.6, titleBox: 21.3, titleBoxH: 21, titleGap: 8.6, titleFont: 12,

  barsTop: 52.3, barsW: 154.2, barsMax: 57.5, barsMin: 14.7,

  sheetW: 174.4, rowH: 21.6, groupGap: 7, cellFont: 9,
  sheetTopWithBars: 123.1, sheetTopNoBars: 40,
  sheetGapBelow: 12,

  handsW: 150, handW: 14, handH: 22, handRowGap: 6, handsPerRow: 8,

  line: 0.5   // 선 두께
};

const MM2PX = 96 / 25.4;            // 1mm → CSS px
const STORE = 'kalimba.songs';

/* ── 상태 ───────────────────────────────────── */
let songs = [];
let cur = null;                      // 편집 중인 곡
let sel = { row: 0, cell: 0 };       // 선택된 칸

/* ══════════ 저장소 ══════════ */
function loadSongs() {
  try { songs = JSON.parse(localStorage.getItem(STORE)) || []; }
  catch { songs = []; }
}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(songs)); }
  catch { toast('저장 공간이 부족해요'); }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function newSong() {
  return {
    id: uid(),
    title: '학교종',
    updatedAt: Date.now(),
    showKeys: true,
    keyCount: 17,
    cols: 8,
    rows: [
      { cells: ['5', '5', '6', '6', '5', '5', '3', '-'], gapAfter: false },
      { cells: ['5', '5', '3', '3', '2', '-', '-', '-'], gapAfter: true },
      { cells: ['5', '5', '6', '6', '5', '5', '3', '-'], gapAfter: false },
      { cells: ['5', '3', '2', '3', '1', '-', '-', '-'], gapAfter: false }
    ],
    showHands: true,
    handCount: 16
  };
}

/* ══════════ 계이름 ══════════
   값 형식 — '5'(기본) · "5'"(한 옥타브 위) · "5''"(두 옥타브 위)
            '-'(길게) · ''(빈칸)
   ───────────────────────────────── */
function parseNote(v) {
  if (!v || v === '-') return null;
  const m = /^([1-7])('{0,2})$/.exec(v);
  return m ? { num: m[1], up: m[2].length } : null;
}
function noteLabel(n, up) { return String(n) + "'".repeat(up); }

// 건반 수에 따라 쓸 수 있는 음
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

/* ══════════ 계산 ══════════ */

// 연속된 '-' 를 앞 칸에 붙여 병합 단위로 만든다
function mergeCells(cells) {
  const out = [];
  let i = 0;
  while (i < cells.length) {
    const parts = [cells[i]];
    let j = i + 1;
    // 첫 칸이 '-' 면 혼자 둔다
    if (cells[i] !== '-') {
      while (j < cells.length && cells[j] === '-') { parts.push('-'); j++; }
    }
    out.push({ parts, span: parts.length });
    i = j;
  }
  return out;
}

// 줄을 '띄움' 기준으로 그룹(표)으로 나눈다
function groupRows(rows) {
  const groups = [];
  let g = [];
  rows.forEach(r => {
    g.push(r);
    if (r.gapAfter) { groups.push(g); g = []; }
  });
  if (g.length) groups.push(g);
  return groups;
}

// 세로 배치를 한 번에 계산 — 미리보기와 PDF가 공유
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

// 칸이 많아지면 글자를 줄여 칸 안에 들어가게 한다
function cellFont(cols) {
  const cw = LAY.sheetW / cols;
  return +Math.min(LAY.cellFont, cw * 0.52).toFixed(2);
}

// 칼림바 건반 길이 (가운데가 가장 긴 V자)
function barHeights(n) {
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.abs(i - mid) / mid;
    return +(LAY.barsMax - (LAY.barsMax - LAY.barsMin) * r).toFixed(2);
  });
}
function barWidth(n) { return n >= 21 ? 4.5 : 5.5; }

/* ══════════ 화면 전환 ══════════ */
const $ = s => document.querySelector(s);
const viewList = $('#view-list'), viewEdit = $('#view-edit');

function showList() {
  viewEdit.classList.add('hidden');
  viewList.classList.remove('hidden');
  renderList();
}
function showEdit(song) {
  cur = song;
  sel = { row: 0, cell: 0 };
  viewList.classList.add('hidden');
  viewEdit.classList.remove('hidden');
  $('#song-title').value = song.title;
  $('#opt-keys').checked = song.showKeys;
  $('#opt-hands').checked = song.showHands;
  $('#hand-count').textContent = song.handCount;
  document.querySelectorAll('#seg-keycount button').forEach(b =>
    b.classList.toggle('on', +b.dataset.n === song.keyCount));
  renderKeypad();
  renderRows();
  renderPreview();
}

/* ══════════ 곡 목록 ══════════ */
function renderList() {
  const box = $('#song-list');
  box.innerHTML = songs.map(s => {
    const d = new Date(s.updatedAt);
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const notes = s.rows.reduce((n, r) => n + r.cells.filter(c => c && c !== '-').length, 0);
    return `<div class="song-card" data-id="${s.id}">
      <h3>${esc(s.title) || '제목 없음'}</h3>
      <div class="meta">${s.rows.length}줄 · 음 ${notes}개 · ${date}</div>
      <div class="card-actions">
        <button class="btn tiny" data-act="open">열기</button>
        <button class="btn tiny" data-act="copy">복제</button>
        <button class="btn tiny danger" data-act="del">삭제</button>
      </div>
    </div>`;
  }).join('');
  $('#list-empty').classList.toggle('hidden', songs.length > 0);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

$('#song-list').addEventListener('click', e => {
  const card = e.target.closest('.song-card');
  if (!card) return;
  const song = songs.find(s => s.id === card.dataset.id);
  if (!song) return;
  const act = e.target.dataset.act;
  if (act === 'del') {
    if (confirm(`"${song.title}" 악보를 지울까요?`)) {
      songs = songs.filter(s => s.id !== song.id);
      persist(); renderList(); toast('삭제했어요');
    }
  } else if (act === 'copy') {
    const c = JSON.parse(JSON.stringify(song));
    c.id = uid(); c.title = song.title + ' 사본'; c.updatedAt = Date.now();
    songs.unshift(c); persist(); renderList(); toast('복제했어요');
  } else {
    showEdit(song);
  }
});

$('#btn-new').addEventListener('click', () => {
  const s = newSong();
  songs.unshift(s); persist(); showEdit(s);
});
$('#btn-back').addEventListener('click', () => { touch(); showList(); });

/* ══════════ 편집 — 줄/칸 ══════════ */
function touch() {
  if (!cur) return;
  cur.title = $('#song-title').value.trim();
  cur.updatedAt = Date.now();
  persist();
}

function renderRows() {
  const box = $('#rows');
  box.innerHTML = cur.rows.map((r, ri) => `
    <div class="row-item" data-ri="${ri}">
      <div class="row-top">
        <span class="row-no">${ri + 1}줄</span>
        <span class="spacer"></span>
        <button data-act="gap" class="${r.gapAfter ? 'on' : ''}">아래 띄움</button>
        <button data-act="dup">복제</button>
        <button data-act="del">삭제</button>
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

$('#rows').addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (cell) {
    sel = { row: +cell.dataset.ri, cell: +cell.dataset.ci };
    renderRows();
    $('#keypad-hint').textContent = `${sel.row + 1}줄 ${sel.cell + 1}번 칸`;
    return;
  }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const ri = +btn.closest('.row-item').dataset.ri;
  const act = btn.dataset.act;
  if (act === 'gap') cur.rows[ri].gapAfter = !cur.rows[ri].gapAfter;
  if (act === 'dup') cur.rows.splice(ri + 1, 0, JSON.parse(JSON.stringify(cur.rows[ri])));
  if (act === 'del') {
    if (cur.rows.length === 1) return toast('마지막 줄은 지울 수 없어요');
    cur.rows.splice(ri, 1);
    if (sel.row >= cur.rows.length) sel.row = cur.rows.length - 1;
  }
  afterEdit();
});

$('#btn-addrow').addEventListener('click', () => {
  cur.rows.push({ cells: Array(cur.cols).fill(''), gapAfter: false });
  sel = { row: cur.rows.length - 1, cell: 0 };
  afterEdit();
});

const COL_STEPS = [4, 6, 8, 10, 12, 16];
$('#btn-cols').addEventListener('click', () => {
  const i = COL_STEPS.indexOf(cur.cols);
  cur.cols = COL_STEPS[(i + 1) % COL_STEPS.length];
  cur.rows.forEach(r => {
    while (r.cells.length < cur.cols) r.cells.push('');
    r.cells.length = cur.cols;
  });
  if (sel.cell >= cur.cols) sel.cell = cur.cols - 1;
  toast(`한 줄 ${cur.cols}칸`);
  afterEdit();
});

/* ── 키패드 ── */
function renderKeypad() {
  if (!cur) return;
  const tag = { 0: '기본', 1: '높음 ·', 2: '높음 ··' };
  const rows = availNotes(cur.keyCount).slice().reverse();   // 높은 음을 위로
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
  if (!b || !cur) return;
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
  afterEdit();
});

/* ── 옵션 ── */
$('#opt-keys').addEventListener('change', e => { cur.showKeys = e.target.checked; afterEdit(); });
$('#opt-hands').addEventListener('change', e => { cur.showHands = e.target.checked; afterEdit(); });
$('#seg-keycount').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  cur.keyCount = +b.dataset.n;
  document.querySelectorAll('#seg-keycount button').forEach(x => x.classList.toggle('on', x === b));
  afterEdit();
});
$('#hand-minus').addEventListener('click', () => { cur.handCount = Math.max(0, cur.handCount - 1); $('#hand-count').textContent = cur.handCount; afterEdit(); });
$('#hand-plus').addEventListener('click', () => { cur.handCount = Math.min(40, cur.handCount + 1); $('#hand-count').textContent = cur.handCount; afterEdit(); });
$('#song-title').addEventListener('input', () => { cur.title = $('#song-title').value; renderPreview(); persistSoon(); });

let persistTimer = null;
function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(touch, 500); }
function afterEdit() { renderKeypad(); renderRows(); renderPreview(); persistSoon(); }

/* ══════════ 미리보기 ══════════ */
function renderPreview() {
  if (!cur) return;
  const L = layout(cur);

  // 제목
  $('#p-title').innerHTML = [...(cur.title || '')].filter(c => c.trim())
    .map(c => `<b>${esc(c)}</b>`).join('');

  // 건반
  const bars = $('#p-bars');
  if (cur.showKeys) {
    const n = cur.keyCount, w = barWidth(n);
    bars.style.display = 'flex';
    bars.innerHTML = barHeights(n)
      .map(h => `<i style="width:${w}mm;height:${h}mm"></i>`).join('');
  } else {
    bars.style.display = 'none';
    bars.innerHTML = '';
  }

  // 악보 표
  const sheet = $('#p-sheet');
  sheet.style.top = L.sheetTop + 'mm';
  const cf = cellFont(cur.cols);
  sheet.style.fontSize = cf + 'mm';
  sheet.innerHTML = L.groups.map(g => `<table>${g.map(r => {
    const units = mergeCells(r.cells);
    return '<tr>' + units.map(u => {
      if (u.span === 1) return `<td>${noteHTML(u.parts[0])}</td>`;
      const w = (100 / u.span) + '%';
      return `<td class="merged" colspan="${u.span}">` +
        u.parts.map(p => `<span style="width:${w}">${noteHTML(p)}</span>`).join('') + '</td>';
    }).join('') + '</tr>';
  }).join('')}</table>`).join('');

  // 색칠용 손
  const hands = $('#p-hands');
  hands.style.top = L.handsTop + 'mm';
  hands.style.gridTemplateColumns = `repeat(${LAY.handsPerRow}, ${LAY.handW}mm)`;
  hands.style.rowGap = LAY.handRowGap + 'mm';
  hands.innerHTML = (cur.showHands && cur.handCount > 0)
    ? Array(cur.handCount).fill(
        `<img src="${window.HAND_PNG}" style="width:${LAY.handW}mm;height:${LAY.handH}mm" alt="">`
      ).join('')
    : '';

  // 종이 밖으로 넘치면 알림
  $('#paper').style.outline = L.bottom > A4.h ? '2px solid #e2614d' : 'none';
  if (L.bottom > A4.h) toastOnce('내용이 A4 한 장을 넘었어요');

  fitPaper();
}

// 미리보기를 화면 폭에 맞춰 축소
function fitPaper() {
  const pane = document.querySelector('.preview-scroll');
  const scaler = $('#paper-scaler');
  const paper = $('#paper');
  if (!pane || !scaler) return;
  const availW = pane.clientWidth - 32;
  const availH = pane.clientHeight - 32;
  const pw = A4.w * MM2PX, ph = A4.h * MM2PX;
  const s = Math.max(0.1, Math.min(availW / pw, availH / ph));
  paper.style.transform = `scale(${s})`;
  scaler.style.width = (pw * s) + 'px';
  scaler.style.height = (ph * s) + 'px';
}
window.addEventListener('resize', fitPaper);
window.addEventListener('orientationchange', () => setTimeout(fitPaper, 300));

/* ══════════ 인쇄로 저장 ══════════ */
$('#btn-print').addEventListener('click', () => {
  touch();
  window.print();
});

/* ══════════ PDF 직접 생성 ══════════ */

// 한글은 jsPDF 기본 폰트에 없어서 글자를 그림으로 만들어 넣는다
function charToPng(ch, boxMm) {
  const px = Math.round(boxMm * 14);          // 약 350dpi
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d');
  // 흰 바탕으로 채운다 — 투명 PNG는 jsPDF 안에서 압축이 안 돼 용량이 커진다
  g.fillStyle = '#fff';
  g.fillRect(0, 0, px, px);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(px * 0.58)}px -apple-system, "Pretendard", "Apple SD Gothic Neo", sans-serif`;
  g.fillText(ch, px / 2, px / 2 + px * 0.02);
  return c.toDataURL('image/png');
}

// 계이름 한 글자를 PDF에 찍는다 — 옥타브는 숫자 위 점으로
function drawNote(doc, v, cx, cy, f) {
  const p = parseNote(v);
  if (!p) {                       // '-' 같은 기호는 그대로
    doc.text(String(v), cx, cy, { align: 'center', baseline: 'middle' });
    return;
  }
  doc.text(p.num, cx, cy, { align: 'center', baseline: 'middle' });
  if (!p.up) return;
  const r = f * 0.075;            // 점 반지름
  const dy = cy - f * 0.56;       // 숫자 위
  doc.setFillColor(0);
  if (p.up === 1) {
    doc.circle(cx, dy, r, 'F');
  } else {
    doc.circle(cx - r * 2.4, dy, r, 'F');
    doc.circle(cx + r * 2.4, dy, r, 'F');
  }
}

function buildPdf(song) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const L = layout(song);
  doc.setLineWidth(LAY.line);
  doc.setDrawColor(0);
  doc.setTextColor(0);

  // ── 제목 ──
  const chars = [...(song.title || '')].filter(c => c.trim());
  if (chars.length) {
    const totalW = chars.length * LAY.titleBox + (chars.length - 1) * LAY.titleGap;
    let x = (A4.w - totalW) / 2;
    const inset = 1.2;                       // 테두리 안쪽 여백
    const imgW = LAY.titleBox - inset * 2;
    chars.forEach(ch => {
      doc.rect(x, LAY.titleTop, LAY.titleBox, LAY.titleBoxH);
      doc.addImage(charToPng(ch, imgW), 'PNG',
        x + inset, LAY.titleTop + (LAY.titleBoxH - imgW) / 2, imgW, imgW,
        'ch-' + ch, 'MEDIUM');
      x += LAY.titleBox + LAY.titleGap;
    });
  }

  // ── 칼림바 건반 ──
  if (song.showKeys) {
    const n = song.keyCount, w = barWidth(n);
    const hs = barHeights(n);
    const left = (A4.w - LAY.barsW) / 2;
    const gap = n > 1 ? (LAY.barsW - n * w) / (n - 1) : 0;
    doc.rect(left, LAY.barsTop - LAY.line / 2, LAY.barsW, LAY.line, 'F');
    hs.forEach((h, i) => {
      const x = left + i * (w + gap);
      // 위가 열린 막대 — 좌/우/아래 선만
      doc.line(x, LAY.barsTop, x, LAY.barsTop + h);
      doc.line(x + w, LAY.barsTop, x + w, LAY.barsTop + h);
      doc.line(x, LAY.barsTop + h, x + w, LAY.barsTop + h);
    });
  }

  // ── 악보 표 ──
  const left = (A4.w - LAY.sheetW) / 2;
  const cw = LAY.sheetW / song.cols;
  const cf = cellFont(song.cols);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(cf * 2.83465);               // mm → pt
  let y = L.sheetTop;
  L.groups.forEach((g, gi) => {
    g.forEach(r => {
      const units = mergeCells(r.cells);
      let ci = 0;
      units.forEach(u => {
        const x = left + ci * cw;
        const w = cw * u.span;
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

  // ── 색칠용 손 ──
  if (song.showHands && song.handCount > 0) {
    const hl = (A4.w - LAY.handsW) / 2;
    const gap = (LAY.handsW - LAY.handsPerRow * LAY.handW) / (LAY.handsPerRow - 1);
    for (let i = 0; i < song.handCount; i++) {
      const col = i % LAY.handsPerRow, row = Math.floor(i / LAY.handsPerRow);
      doc.addImage(window.HAND_PNG, 'PNG',
        hl + col * (LAY.handW + gap),
        L.handsTop + row * (LAY.handH + LAY.handRowGap),
        LAY.handW, LAY.handH,
        'hand', 'MEDIUM');        // alias 로 같은 그림 재사용
    }
  }
  return doc;
}

$('#btn-pdf').addEventListener('click', async () => {
  if (!cur) return;
  touch();
  try {
    const doc = buildPdf(cur);
    const name = (cur.title || '칼림바악보').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });

    // 아이패드는 공유 시트로 '파일에 저장'
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
    doc.save(name);
    toast('PDF를 저장했어요');
  } catch (err) {
    if (err && err.name === 'AbortError') return;      // 사용자가 공유 취소
    console.error(err);
    toast('PDF 저장에 실패했어요: ' + (err.message || err));
  }
});

/* ══════════ 토스트 ══════════ */
let toastTimer = null, lastToast = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}
function toastOnce(msg) {
  const now = Date.now();
  if (now - lastToast < 4000) return;
  lastToast = now;
  toast(msg);
}

/* ══════════ 시작 ══════════ */
loadSongs();
showList();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
