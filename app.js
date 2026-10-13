// 夫婦の家計簿 — 画面とユーザー操作
import { createStore, isDemo } from './store.js';

// ------------------------------------------------------------
// 小さな道具
// ------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const today = () => isoDate(new Date());
const thisYm = () => ymOf(new Date());
function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
const ymLabel = (ym) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
const yen = (n) => Math.round(n).toLocaleString('ja-JP');
const DOW = '日月火水木金土';
const isYm = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const icon = {
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  bars: '<path d="M3 20h18"/><path d="M6 17v-6M11 17V6M16 17v-9"/>',
  swap: '<path d="M4 8h15l-3-3"/><path d="M20 16H5l3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const svg = (name, size = 22, sw = 2) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${icon[name]}</svg>`;

// ------------------------------------------------------------
// 状態
// ------------------------------------------------------------
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
let S = { phase: 'loading' }; // 保存データ（store から届く）

function blankForm(prev = {}) {
  return { id: null, origYm: null, t: null, amount: '', payer: prev.payer ?? 0, cat: prev.cat ?? null, memo: '', date: prev.date || today() };
}

const joinParam = new URLSearchParams(location.search).get('join') || '';
const ui = {
  tab: 'input',
  prevTab: 'input',
  ym: thisYm(),
  selDate: today(),
  form: blankForm(),
  editNames: false,
  trendMode: 'total',
  settleFrom: null,
  settleTo: null,
  newCat: '',
  newMemo: '',
  auth: { mode: 'login', email: '', password: '', busy: false, msg: '', ok: '' },
  hh: { nameA: '夫', nameB: '妻', code: joinParam, busy: false, msg: '' },
  online: navigator.onLine
};

// ------------------------------------------------------------
// データの読み出し
// ------------------------------------------------------------
const names = () => (S.household && S.household.names) || ['夫', '妻'];
const allCats = () => (S.household && S.household.categories) || [];
const activeCats = () => allCats().filter((c) => !c.archived);
const catName = (id) => (allCats().find((c) => c.id === id) || {}).name || '未分類';
const memos = () => (S.household && S.household.memos) || [];

function entriesOfMonth(ym) {
  const m = (S.months && S.months[ym]) || {};
  return Object.entries(m).map(([id, e]) => ({
    id, ym, day: Number(e.d), date: `${ym}-${pad(Number(e.d))}`,
    amount: Number(e.a) || 0, payer: e.p === 1 ? 1 : 0, cat: e.c, memo: e.m || '', t: e.t || 0
  }));
}
function monthTotals(ym) {
  const t = { total: 0, paid: [0, 0], byCat: {}, byDay: {}, count: 0 };
  for (const e of entriesOfMonth(ym)) {
    t.total += e.amount;
    t.count += 1;
    t.paid[e.payer] += e.amount;
    const c = (t.byCat[e.cat] = t.byCat[e.cat] || { total: 0, paid: [0, 0] });
    c.total += e.amount;
    c.paid[e.payer] += e.amount;
    t.byDay[e.day] = (t.byDay[e.day] || 0) + e.amount;
  }
  return t;
}
// 表示用の費目一覧：有効な費目 + その月に金額のある非表示・不明の費目
function catsWithData(byCatList) {
  const list = activeCats().map((c) => ({ id: c.id, name: c.name }));
  const known = new Set(list.map((c) => c.id));
  for (const byCat of byCatList) {
    for (const id of Object.keys(byCat)) {
      if (!known.has(id) && byCat[id].total) { known.add(id); list.push({ id, name: catName(id) }); }
    }
  }
  return list;
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function render() {
  const act = document.activeElement;
  const focusId = act && act.id && $app.contains(act) ? act.id : null;
  let s0 = null; let s1 = null;
  if (focusId) { try { s0 = act.selectionStart; s1 = act.selectionEnd; } catch (e) { /* type=date など */ } }
  $app.innerHTML = view();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      try { if (s0 != null) el.setSelectionRange(s0, s1); } catch (e) { /* noop */ }
    }
  }
}

let toastTimer = null;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
}

function header(title, left = '', right = '') {
  return `<header class="top"><div class="l">${left}</div><h1>${title}</h1><div class="r">${right}</div></header>`;
}
const iconBtn = (action, name, label, extra = '') =>
  `<button type="button" class="icon-btn" data-action="${action}" aria-label="${label}" ${extra}>${svg(name)}</button>`;

function syncBadge() {
  if (S.mode === 'local') return '<span class="sync warn"><i></i>デモ</span>';
  if (!ui.online) return '<span class="sync warn"><i></i>オフライン</span>';
  const two = S.household && (S.household.members || []).length >= 2;
  return `<span class="sync"><i></i>${two ? '同期中' : '1人で利用中'}</span>`;
}

function monthHeader(title) {
  return header(
    title,
    iconBtn('month-prev', 'back', '前の月'),
    iconBtn('month-next', 'next', '次の月')
  );
}

function view() {
  if (S.phase === 'loading') return header('夫婦の家計簿') + '<main class="no-tabs"><div class="center muted">読み込み中…</div></main>';
  if (S.phase === 'auth') return authView();
  if (S.phase === 'household') return householdView();
  const v = { input: inputView, calendar: calendarView, summary: summaryView, trend: trendView, settle: settleView, settings: settingsView }[ui.tab] || inputView;
  return v() + tabsView();
}

function tabsView() {
  const tabs = [['input', 'pencil', '入力'], ['calendar', 'cal', 'カレンダー'], ['summary', 'list', '集計'], ['trend', 'bars', '推移'], ['settle', 'swap', '精算']];
  return `<nav class="tabs" aria-label="メイン"><div class="tabs-in">${tabs.map(([id, ic, label]) =>
    `<button type="button" class="tab" data-action="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${svg(ic, 24, 1.8)}${label}</button>`).join('')}</div></nav>`;
}

function namesEditor(prefix) {
  const n = names();
  return `<div class="grid2">
    <div class="field"><label for="${prefix}-a" class="who-a">1人目の名前</label><input id="${prefix}-a" class="input" data-hh-name="0" value="${esc(n[0])}" maxlength="12" autocomplete="off"></div>
    <div class="field"><label for="${prefix}-b" class="who-b">2人目の名前</label><input id="${prefix}-b" class="input" data-hh-name="1" value="${esc(n[1])}" maxlength="12" autocomplete="off"></div>
  </div>`;
}

// ---------- ① 入力 ----------
function inputView() {
  const f = ui.form;
  const n = names();
  const list = activeCats();
  if (!list.find((c) => c.id === f.cat)) f.cat = list[0] ? list[0].id : null;
  const editing = !!f.id;
  const left = editing ? iconBtn('cancel-edit', 'back', '編集をやめる') : syncBadge();
  const right = iconBtn('open-settings', 'gear', '設定');
  const ms = memos();
  return header(editing ? '記録を編集' : '支出を入力', left, right) + `<main>
    ${S.mode === 'local' && !editing ? '<div class="demo-banner">デモモード：記録はこの端末だけに保存されます。夫婦で同期するには Firebase の設定が必要です。</div>' : ''}
    <section class="card">
      <label class="label" for="f-amount">金額</label>
      <div class="amount"><span>¥</span><input id="f-amount" data-field="amount" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" value="${esc(f.amount ? yen(Number(f.amount)) : '')}"></div>
    </section>
    <section class="card stack">
      <div class="row-between"><span class="label">支払った人</span><button type="button" class="link" data-action="toggle-names">${ui.editNames ? '完了' : '名前を変更'}</button></div>
      ${ui.editNames ? namesEditor('ne') : `<div class="grid2">${[0, 1].map((i) =>
        `<button type="button" class="payer ${i ? 'b' : 'a'} ${f.payer === i ? 'on' : ''}" data-action="payer" data-i="${i}" aria-pressed="${f.payer === i}">${esc(n[i])}</button>`).join('')}</div>`}
    </section>
    <section class="card stack">
      <div class="row-between"><span class="label">費目</span><button type="button" class="link" data-action="open-settings">追加・編集</button></div>
      ${list.length ? `<div class="grid3">${list.map((c) =>
        `<button type="button" class="chip ${f.cat === c.id ? 'on' : ''}" data-action="cat" data-id="${esc(c.id)}" aria-pressed="${f.cat === c.id}">${esc(c.name)}</button>`).join('')}</div>`
        : '<div class="empty">費目がありません。「追加・編集」から作成してください。</div>'}
    </section>
    <section class="card stack">
      <label class="label" for="f-memo">メモ（自由入力）</label>
      <div class="memo-row">
        <input id="f-memo" class="input" data-field="memo" placeholder="品目やお店など" value="${esc(f.memo)}" maxlength="60" autocomplete="off">
        <button type="button" class="btn-small" data-action="save-memo" aria-label="入力中のメモをよく使う項目に保存">＋保存</button>
      </div>
      ${ms.length ? `<div class="label">よく使う項目から選ぶ</div><div class="pills">${ms.map((m) =>
        `<button type="button" class="pill ${f.memo === m ? 'on' : ''}" data-action="memo" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
      <div class="row-between line-top"><label for="f-date">日付</label><input id="f-date" type="date" class="date-input" data-field="date" value="${esc(f.date)}" required></div>
    </section>
    <button type="button" class="btn-primary" data-action="save">${editing ? '変更を保存' : '保存'}</button>
    ${editing ? '<button type="button" class="btn-danger" data-action="delete">この記録を削除</button>' : ''}
  </main>`;
}

// ---------- ② カレンダー ----------
function calendarView() {
  const ym = ui.ym;
  const [y, m] = ym.split('-').map(Number);
  const startDow = new Date(y, m - 1, 1).getDay();
  const daysIn = new Date(y, m, 0).getDate();
  const t = monthTotals(ym);
  const td = today();
  const n = names();
  const cells = [];
  const totalCells = Math.ceil((startDow + daysIn) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const day = i - startDow + 1;
    const dow = i % 7;
    if (day < 1 || day > daysIn) { cells.push('<div class="day out" aria-hidden="true"></div>'); continue; }
    const date = `${ym}-${pad(day)}`;
    const amt = t.byDay[day];
    const cls = ['day', dow === 0 ? 'sun' : '', dow === 6 ? 'sat' : '', date === ui.selDate ? 'sel' : '', date === td ? 'today' : ''].join(' ');
    cells.push(`<button type="button" class="${cls}" data-action="select-day" data-date="${date}" aria-pressed="${date === ui.selDate}" aria-label="${m}月${day}日${amt ? ` ${yen(amt)}円` : ''}"><span class="n">${day}</span><span class="amt">${amt ? yen(amt) : ''}</span></button>`);
  }
  const selIn = ui.selDate.startsWith(ym);
  const dayList = selIn ? entriesOfMonth(ym).filter((e) => e.date === ui.selDate).sort((a, b) => a.t - b.t) : [];
  const dayTotal = dayList.reduce((s, e) => s + e.amount, 0);
  const sd = new Date(`${ui.selDate}T00:00:00`);
  return monthHeader(ymLabel(ym)) + `<main>
    <section class="card flush">
      <div class="dow"><span class="sun">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span class="sat">土</span></div>
      <div class="cal">${cells.join('')}</div>
      <div class="totals3" style="border-top:1px solid var(--line)">
        <div><span class="label">今月の支出</span><span class="v big">${yen(t.total)}円</span></div>
        <div style="align-items:center"><span class="small who-a">${esc(n[0])}</span><span class="v">${yen(t.paid[0])}円</span></div>
        <div style="align-items:flex-end"><span class="small who-b">${esc(n[1])}</span><span class="v">${yen(t.paid[1])}円</span></div>
      </div>
    </section>
    ${selIn ? `<div class="row-between" style="padding:0 4px"><span class="small muted">${sd.getMonth() + 1}月${sd.getDate()}日（${DOW[sd.getDay()]}）</span><span class="small muted num">${yen(dayTotal)}円</span></div>
    <section class="card flush">
      ${dayList.length ? `<ul class="entries">${dayList.map((e) => `<li><button type="button" class="entry" data-action="edit-entry" data-id="${esc(e.id)}" data-ym="${ym}">
        <span class="badge ${e.payer ? 'b' : 'a'}" aria-label="${esc(n[e.payer])}">${esc(Array.from(n[e.payer] || '?')[0])}</span>
        <span class="main"><span class="t">${esc(catName(e.cat))}</span>${e.memo ? `<span class="s">${esc(e.memo)}</span>` : ''}</span>
        <span class="amt">${yen(e.amount)}円</span><span class="chev">${svg('next', 16)}</span></button></li>`).join('')}</ul>`
        : '<div class="empty">この日の記録はありません</div>'}
    </section>
    <button type="button" class="btn-secondary" data-action="add-on-day">＋ この日の支出を入力</button>` : ''}
  </main>`;
}

// ---------- ③ 月の集計 ----------
function summaryView() {
  const t = monthTotals(ui.ym);
  const n = names();
  const rows = catsWithData([t.byCat]);
  const max = Math.max(1, ...rows.map((c) => (t.byCat[c.id] || { total: 0 }).total));
  const pctA = t.total ? Math.round((t.paid[0] / t.total) * 1000) / 10 : 0;
  const pctB = t.total ? Math.round((1000 - pctA * 10)) / 10 : 0;
  return monthHeader(`${ymLabel(ui.ym)}の集計`) + `<main>
    <section class="card stack" style="padding:18px">
      <div><div class="label">今月の支出 合計</div><div class="big-total">${yen(t.total)}<small>円</small></div></div>
      <div class="splitbar" role="img" aria-label="${esc(n[0])} ${pctA}%、${esc(n[1])} ${pctB}%">${t.total ? `<i class="a" style="flex:${t.paid[0]}"></i><i class="b" style="flex:${t.paid[1]}"></i>` : ''}</div>
      <div class="grid2">
        <div style="display:flex;flex-direction:column"><span class="small who-a">${esc(n[0])}が支払い</span><span class="num" style="font-size:18px;font-weight:500">${yen(t.paid[0])}円</span><span class="small muted">${pctA}%</span></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end"><span class="small who-b">${esc(n[1])}が支払い</span><span class="num" style="font-size:18px;font-weight:500">${yen(t.paid[1])}円</span><span class="small muted">${pctB}%</span></div>
      </div>
    </section>
    <section class="card" style="padding:4px 16px 10px">
      <table class="table">
        <thead><tr><th scope="col">費目</th><th scope="col">合計</th><th scope="col" class="who-a">${esc(n[0])}</th><th scope="col" class="who-b">${esc(n[1])}</th></tr></thead>
        <tbody>${rows.map((c) => {
          const v = t.byCat[c.id] || { total: 0, paid: [0, 0] };
          return `<tr><td class="c">${esc(c.name)}</td><td class="tot">${yen(v.total)}</td><td>${yen(v.paid[0])}</td><td>${yen(v.paid[1])}</td></tr>
          <tr class="bar"><td colspan="4"><div class="meter"><i style="width:${Math.round((v.total / max) * 100)}%"></i></div></td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td>合計</td><td>${yen(t.total)}</td><td>${yen(t.paid[0])}</td><td>${yen(t.paid[1])}</td></tr></tfoot>
      </table>
    </section>
  </main>`;
}

// ---------- ④ 推移グラフ ----------
const CAT_COLORS = ['#17845A', '#2A64B0', '#E08A3C', '#8FD0AE', '#7A4FA0', '#D4B13F', '#A9B6D3', '#C2557A', '#5E6B64', '#6FB3D2'];
function niceScale(max) {
  if (max <= 0) return { top: 50000, step: 10000 };
  const steps = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  const step = steps.find((s) => max / s <= 4) || 10000000;
  return { top: Math.ceil(max / step) * step, step };
}
const manLabel = (v) => (v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万` : yen(v));

function trendView() {
  const end = ui.ym;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(end, i - 11));
  const totals = months.map(monthTotals);
  const n = names();
  const cats = catsWithData(totals.map((t) => t.byCat));
  const colorOf = (i) => CAT_COLORS[i % CAT_COLORS.length];
  const max = Math.max(0, ...totals.map((t) => t.total));
  const { top, step } = niceScale(max);
  const px = (v) => (v / top) * 200;
  const mode = ui.trendMode;
  const grids = [];
  for (let v = step; v <= top; v += step) grids.push(`<div class="grid" style="top:${200 - px(v)}px"><span>${manLabel(v)}</span></div>`);
  const cols = months.map((ym, i) => {
    const t = totals[i];
    let segs;
    if (mode === 'payer') segs = [[t.paid[0], 'var(--a)'], [t.paid[1], 'var(--b-l)']];
    else if (mode === 'cat') segs = cats.map((c, k) => [(t.byCat[c.id] || { total: 0 }).total, colorOf(k)]);
    else segs = [[t.total, 'var(--green)']];
    segs = segs.filter(([v]) => v > 0);
    const m = Number(ym.slice(5, 7));
    const label = m === 1 || i === 0 ? `${ym.slice(2, 4)}/${m}` : `${m}月`;
    return `<button type="button" class="col ${ym === end ? 'cur' : ''}" data-action="goto-month" data-ym="${ym}" aria-label="${ymLabel(ym)} ${yen(t.total)}円">
      <span class="stackbar">${segs.map(([v, c]) => `<i style="height:${px(v)}px;background:${c}"></i>`).join('')}</span>
      <span class="ml">${label}</span></button>`;
  }).join('');
  let legend;
  if (mode === 'payer') legend = [[n[0], 'var(--a)'], [n[1], 'var(--b-l)']];
  else if (mode === 'cat') legend = cats.map((c, k) => [c.name, colorOf(k)]);
  else legend = [['支出合計', 'var(--green)']];
  const withData = totals.filter((t) => t.count > 0);
  const avg = withData.length ? withData.reduce((s, t) => s + t.total, 0) / withData.length : 0;
  let maxI = -1;
  totals.forEach((t, i) => { if (t.total > 0 && (maxI < 0 || t.total > totals[maxI].total)) maxI = i; });
  return monthHeader('支出の推移') + `<main>
    <div class="small muted" style="text-align:center">${ymLabel(months[0])}〜${ymLabel(end)}（12か月）・棒をタップでその月の集計へ</div>
    <div class="seg" role="group" aria-label="グラフの表示">
      ${[['total', '総額'], ['cat', '費目別'], ['payer', '支払者別']].map(([k, l]) => `<button type="button" data-action="trend-mode" data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}
    </div>
    <section class="card stack" style="padding:18px 12px 12px">
      <div class="chart">${grids.join('')}<div class="axis"></div><div class="cols">${cols}</div></div>
      <div class="legend">${legend.map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>
    </section>
    <div class="kpis">
      <div class="kpi"><span class="label">月平均（記録のある月）</span><span class="v">${yen(avg)}円</span></div>
      <div class="kpi"><span class="label">最も多かった月</span><span class="v">${maxI >= 0 ? `${Number(months[maxI].slice(5, 7))}月 ${yen(totals[maxI].total)}円` : '—'}</span></div>
    </div>
    <section class="card" style="padding:4px 16px 10px">
      <table class="table">
        <thead><tr><th scope="col">月</th><th scope="col">合計</th><th scope="col" class="who-a">${esc(n[0])}</th><th scope="col" class="who-b">${esc(n[1])}</th></tr></thead>
        <tbody>${months.slice().reverse().map((ym) => {
          const t = totals[months.indexOf(ym)];
          return `<tr><td class="c">${ymLabel(ym)}</td><td class="tot">${yen(t.total)}</td><td>${yen(t.paid[0])}</td><td>${yen(t.paid[1])}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </section>
  </main>`;
}

// ---------- ⑤ 精算 ----------
function settleDefaults() {
  const cur = thisYm();
  const last = (S.settlements || []).map((s) => s.to).filter(isYm).sort().pop();
  let from = last ? addMonths(last, 1) : addMonths(cur, -2);
  if (from > cur) from = cur;
  return { from, to: cur };
}
function computeSettle(from, to) {
  const months = [];
  for (let ym = from; ym <= to && months.length < 60; ym = addMonths(ym, 1)) months.push(ym);
  const rows = months.map((ym) => ({ ym, ...monthTotals(ym) }));
  const paid = [0, 0];
  rows.forEach((r) => { paid[0] += r.paid[0]; paid[1] += r.paid[1]; });
  const total = paid[0] + paid[1];
  const diff = paid[0] - paid[1];
  return { months, rows, paid, total, half: total / 2, transfer: Math.round(Math.abs(diff) / 2), payerFrom: diff > 0 ? 1 : 0 };
}
function settleView() {
  const d = settleDefaults();
  if (!isYm(ui.settleFrom)) ui.settleFrom = d.from;
  if (!isYm(ui.settleTo)) ui.settleTo = d.to;
  let from = ui.settleFrom; let to = ui.settleTo;
  const invalid = from > to;
  const n = names();
  const r = invalid ? null : computeSettle(from, to);
  const hist = (S.settlements || []).slice().sort((a, b) => (b.to || '').localeCompare(a.to || '') || (b.at || 0) - (a.at || 0));
  const overlap = !invalid && hist.some((h) => isYm(h.from) && isYm(h.to) && h.from <= to && h.to >= from);
  const nMonths = r ? r.months.length : 0;
  return header('夫婦の精算', syncBadge(), iconBtn('open-settings', 'gear', '設定')) + `<main>
    <section class="card" style="padding:4px 16px">
      <div class="month-row"><label for="s-from">開始月</label><input id="s-from" type="month" class="month-input" data-settle="from" value="${esc(from)}"></div>
      <div class="month-row"><label for="s-to">終了月</label><input id="s-to" type="month" class="month-input" data-settle="to" value="${esc(to)}"></div>
    </section>
    ${invalid ? '<div class="warn-box">開始月が終了月より後になっています。</div>' : `
    ${overlap ? '<div class="warn-box">この期間の一部は、すでに精算済みとして記録されています。</div>' : ''}
    <section class="settle-hero">
      <span class="op">${nMonths}か月分（${ymLabel(from)}〜${ymLabel(to)}）の精算額</span>
      ${r.transfer > 0 ? `<div class="who"><span class="av ${r.payerFrom ? 'b' : 'a'}">${esc(n[r.payerFrom])}</span>
        <svg aria-hidden="true" width="36" height="20" viewBox="0 0 36 20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h30M25 3l7 7-7 7"/></svg>
        <span class="av ${r.payerFrom ? 'a' : 'b'}">${esc(n[1 - r.payerFrom])}</span></div>
      <div class="big-total">${yen(r.transfer)}<small>円</small></div>
      <span class="op">${esc(n[r.payerFrom])}が${esc(n[1 - r.payerFrom])}に支払うと折半になります</span>`
      : `<div class="big-total" style="font-size:24px">精算は不要です</div><span class="op">${r.total ? '2人の支払額が同じです' : 'この期間の記録はありません'}</span>`}
    </section>
    <section class="card stack">
      <div class="row-between"><span>支出の合計</span><strong class="num">${yen(r.total)}円</strong></div>
      <div class="row-between"><span>1人あたりの負担（半分）</span><strong class="num">${r.half.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}円</strong></div>
      <table class="table">
        <thead><tr><th scope="col">月</th><th scope="col" class="who-a">${esc(n[0])}</th><th scope="col" class="who-b">${esc(n[1])}</th></tr></thead>
        <tbody>${r.rows.map((x) => `<tr><td class="c">${ymLabel(x.ym)}</td><td>${yen(x.paid[0])}</td><td>${yen(x.paid[1])}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>合計</td><td>${yen(r.paid[0])}</td><td>${yen(r.paid[1])}</td></tr></tfoot>
      </table>
      <span class="note">※ 精算額の1円未満は四捨五入しています。</span>
    </section>
    <button type="button" class="btn-primary" data-action="settle-record" ${r.total ? '' : 'disabled'}>精算済みとして記録する</button>`}
    <section class="card stack">
      <h2>精算の履歴</h2>
      ${hist.length ? `<div>${hist.map((h) => `<div class="hist">
        <div class="main"><span>${isYm(h.from) ? ymLabel(h.from) : '?'}〜${isYm(h.to) ? ymLabel(h.to) : '?'}</span>
        <span class="small muted">${h.transfer > 0 ? `${esc(n[h.payerFrom])} → ${esc(n[1 - h.payerFrom])}　${yen(h.transfer)}円` : '精算なし'}${h.at ? `（${new Date(h.at).toLocaleDateString('ja-JP')} 記録）` : ''}</span></div>
        <button type="button" class="mini danger" data-action="settle-delete" data-id="${esc(h.id)}" aria-label="この精算記録を削除">${svg('trash', 18)}</button></div>`).join('')}</div>`
        : '<div class="empty">まだ精算の記録はありません</div>'}
    </section>
  </main>`;
}

// ---------- 設定 ----------
function settingsView() {
  const cats = activeCats();
  const archived = allCats().filter((c) => c.archived);
  const hh = S.household || {};
  const members = (hh.members || []).length;
  const joinUrl = `${location.origin}${location.pathname}?join=${encodeURIComponent(hh.id || '')}`;
  return header('設定', iconBtn('close-settings', 'back', '戻る')) + `<main>
    <section class="card stack">
      <h2>2人の名前</h2>
      ${namesEditor('sn')}
      <span class="note">入力画面の「支払った人」や集計に表示されます。</span>
    </section>
    <section class="card stack" id="cats">
      <h2>費目</h2>
      ${cats.map((c, i) => `<div class="cat-row">
        <input id="cat-${esc(c.id)}" class="input" data-cat-rename="${esc(c.id)}" value="${esc(c.name)}" maxlength="12" aria-label="費目名" autocomplete="off">
        <button type="button" class="mini" data-action="cat-up" data-id="${esc(c.id)}" aria-label="上へ移動" ${i === 0 ? 'disabled' : ''}>${svg('up', 18)}</button>
        <button type="button" class="mini danger" data-action="cat-archive" data-id="${esc(c.id)}" aria-label="この費目を削除">${svg('trash', 18)}</button>
      </div>`).join('')}
      <div class="memo-row"><input id="new-cat" class="input" data-ui="newCat" placeholder="新しい費目（例：医療費）" maxlength="12" value="${esc(ui.newCat)}" autocomplete="off"><button type="button" class="btn-small" data-action="cat-add">追加</button></div>
      ${archived.length ? `<div class="label">削除した費目（過去の記録には残っています）</div><div class="pills">${archived.map((c) =>
        `<button type="button" class="pill" data-action="cat-restore" data-id="${esc(c.id)}">${esc(c.name)}　<span class="small">戻す</span></button>`).join('')}</div>` : ''}
    </section>
    <section class="card stack">
      <h2>よく使うメモ</h2>
      ${memos().length ? `<div class="pills">${memos().map((m, i) =>
        `<button type="button" class="pill" data-action="memo-del" data-i="${i}" aria-label="${esc(m)}を削除">${esc(m)}<span class="x" aria-hidden="true">×</span></button>`).join('')}</div>` : '<div class="note">まだありません</div>'}
      <div class="memo-row"><input id="new-memo" class="input" data-ui="newMemo" placeholder="例：コストコ" maxlength="60" value="${esc(ui.newMemo)}" autocomplete="off"><button type="button" class="btn-small" data-action="memo-add">追加</button></div>
    </section>
    ${S.mode === 'firebase' ? `<section class="card stack">
      <div class="row-between"><h2>夫婦で共有</h2><span class="status-pill ${members >= 2 ? '' : 'wait'}">${members >= 2 ? '2人で共有中' : 'パートナー未参加'}</span></div>
      <span class="note">パートナーに招待リンクを送ってください。リンクを開いてアカウントを作ると、この家計簿に参加できます。リンクが使えない場合は、下の招待コードを入力してもらいます。</span>
      <div class="code-box" aria-label="招待コード">${esc(hh.id || '')}</div>
      <div class="grid2">
        <button type="button" class="btn-secondary" data-action="share-link" data-url="${esc(joinUrl)}">招待リンクを送る</button>
        <button type="button" class="btn-secondary" data-action="copy" data-v="${esc(hh.id || '')}">コードをコピー</button>
      </div>
    </section>` : `<section class="card stack"><h2>デモモード</h2><span class="note">記録はこの端末（このブラウザ）だけに保存されています。夫婦で同期するには、同梱の「セットアップ手順」に沿って Firebase を設定してください。</span></section>`}
    <section class="card stack">
      <h2>データ</h2>
      <button type="button" class="btn-secondary" data-action="export-csv">すべての記録をCSVで書き出す</button>
    </section>
    ${S.mode === 'firebase' ? `<section class="card stack">
      <h2>アカウント</h2>
      <span class="note">${esc((S.user && S.user.email) || '')} でログイン中</span>
      <button type="button" class="btn-danger" data-action="sign-out">ログアウト</button>
    </section>` : ''}
  </main>`;
}

// ---------- ログイン / 家計簿の作成・参加 ----------
function authView() {
  const a = ui.auth;
  const signup = a.mode === 'signup';
  const loadErr = S.error === 'load-failed' ? '<div class="err">Firebase を読み込めませんでした。通信状態と firebase-config.js の設定を確認してください。</div>' : '';
  return header('夫婦の家計簿') + `<main class="no-tabs">
    <div class="brand"><img src="icons/icon-192.png" alt=""><span class="muted small">夫婦で共有する家計簿</span></div>
    <form class="card stack" data-form="auth" novalidate>
      <h2>${signup ? 'アカウントを作成' : 'ログイン'}</h2>
      <div class="field"><label for="a-email">メールアドレス</label><input id="a-email" class="input" type="email" data-ui="auth.email" value="${esc(a.email)}" autocomplete="username" required></div>
      <div class="field"><label for="a-pass">パスワード${signup ? '（6文字以上）' : ''}</label><input id="a-pass" class="input" type="password" data-ui="auth.password" value="${esc(a.password)}" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6"></div>
      ${a.msg ? `<div class="err">${esc(a.msg)}</div>` : ''}${a.ok ? `<div class="ok">${esc(a.ok)}</div>` : ''}${loadErr}
      <button type="submit" class="btn-primary" ${a.busy ? 'disabled' : ''}>${a.busy ? '処理中…' : signup ? '作成してはじめる' : 'ログイン'}</button>
      <button type="button" class="link" data-action="auth-toggle">${signup ? 'アカウントをお持ちの方はログイン' : 'はじめての方はアカウントを作成'}</button>
      ${signup ? '' : '<button type="button" class="link" data-action="auth-reset">パスワードを忘れた場合</button>'}
    </form>
    ${joinParam ? '<div class="demo-banner">招待リンクから開いています。アカウントを作成（またはログイン）すると参加画面に進みます。</div>' : ''}
  </main>`;
}

function householdView() {
  const h = ui.hh;
  const errMap = { 'permission-denied': 'この家計簿にアクセスできません。' };
  const storeErr = S.error && errMap[S.error] ? `<div class="err">${errMap[S.error]}</div>` : '';
  return header('家計簿の準備', '', `<button type="button" class="link" style="color:#fff" data-action="sign-out">ログアウト</button>`) + `<main class="no-tabs">
    ${storeErr}
    <form class="card stack" data-form="join" novalidate>
      <h2>パートナーの家計簿に参加する</h2>
      <span class="note">パートナーから届いた招待コードを入力してください。招待リンクから開いた場合は入力済みです。</span>
      <div class="field"><label for="h-code">招待コード</label><input id="h-code" class="input" data-ui="hh.code" value="${esc(h.code)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <button type="submit" class="btn-primary" ${h.busy ? 'disabled' : ''}>参加する</button>
    </form>
    <form class="card stack" data-form="create" novalidate>
      <h2>新しく家計簿を作る</h2>
      <span class="note">最初の1人が作成し、設定画面からパートナーを招待します。名前は後から変更できます。</span>
      <div class="grid2">
        <div class="field"><label for="h-a" class="who-a">1人目（あなた）</label><input id="h-a" class="input" data-ui="hh.nameA" value="${esc(h.nameA)}" maxlength="12"></div>
        <div class="field"><label for="h-b" class="who-b">2人目</label><input id="h-b" class="input" data-ui="hh.nameB" value="${esc(h.nameB)}" maxlength="12"></div>
      </div>
      <button type="submit" class="btn-secondary" ${h.busy ? 'disabled' : ''}>作成する</button>
    </form>
    ${h.msg ? `<div class="err">${esc(h.msg)}</div>` : ''}
  </main>`;
}

// ------------------------------------------------------------
// 操作
// ------------------------------------------------------------
let store;
const fail = (label) => (err) => { console.error(err); toast(`${label}に失敗しました（${(err && err.code) || '通信エラー'}）`); };

function authMessage(err) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-credential': 'メールアドレスかパスワードが違います。',
    'auth/wrong-password': 'メールアドレスかパスワードが違います。',
    'auth/user-not-found': 'このメールアドレスのアカウントはありません。',
    'auth/email-already-in-use': 'このメールアドレスはすでに登録されています。ログインしてください。',
    'auth/weak-password': 'パスワードは6文字以上にしてください。',
    'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
    'auth/missing-password': 'パスワードを入力してください。',
    'auth/too-many-requests': '試行回数が多すぎます。しばらく待ってから再度お試しください。',
    'auth/network-request-failed': '通信できませんでした。電波状況を確認してください。',
    'auth/operation-not-allowed': 'Firebase でメール/パスワード認証が有効になっていません。'
  };
  return map[code] || `エラーが発生しました（${code || err}）`;
}

function setUiPath(path, value) {
  const keys = path.split('.');
  let o = ui;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

function saveHousehold(patch, label = '保存') {
  store.updateHousehold(patch).catch(fail(label));
}

function goTab(tab) {
  if (tab !== 'input' && ui.form.id) ui.form = blankForm(ui.form);
  if (tab !== 'settings') ui.tab = tab;
  ui.editNames = false;
  if (tab === 'settle') { ui.settleFrom = null; ui.settleTo = null; }
  render();
  window.scrollTo(0, 0);
}

function openEntry(id, ym) {
  const e = entriesOfMonth(ym).find((x) => x.id === id);
  if (!e) return toast('記録が見つかりません');
  ui.form = { id: e.id, origYm: ym, t: e.t, amount: String(e.amount), payer: e.payer, cat: e.cat, memo: e.memo, date: e.date };
  ui.tab = 'input';
  render();
  window.scrollTo(0, 0);
}

function downloadCsv() {
  const n = names();
  const rows = [['日付', '支払者', '費目', '金額', 'メモ']];
  Object.keys(S.months || {}).sort().forEach((ym) => {
    entriesOfMonth(ym).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t).forEach((e) => {
      rows.push([e.date, n[e.payer], catName(e.cat), String(e.amount), e.memo]);
    });
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `家計簿_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copyText(v) {
  try { await navigator.clipboard.writeText(v); toast('コピーしました'); } catch (e) { toast('コピーできませんでした。長押しで選択してください'); }
}

const actions = {
  tab: (b) => goTab(b.dataset.tab),
  'open-settings': () => { ui.prevTab = ui.tab === 'settings' ? ui.prevTab : ui.tab; ui.tab = 'settings'; ui.editNames = false; render(); window.scrollTo(0, 0); },
  'close-settings': () => { ui.tab = ui.prevTab || 'input'; render(); window.scrollTo(0, 0); },
  'month-prev': () => { ui.ym = addMonths(ui.ym, -1); if (!ui.selDate.startsWith(ui.ym)) ui.selDate = `${ui.ym}-01`; render(); },
  'month-next': () => { ui.ym = addMonths(ui.ym, 1); if (!ui.selDate.startsWith(ui.ym)) ui.selDate = `${ui.ym}-01`; render(); },
  'goto-month': (b) => { ui.ym = b.dataset.ym; ui.tab = 'summary'; render(); window.scrollTo(0, 0); },

  payer: (b) => { ui.form.payer = Number(b.dataset.i); render(); },
  cat: (b) => { ui.form.cat = b.dataset.id; render(); },
  memo: (b) => { ui.form.memo = b.dataset.v; render(); },
  'toggle-names': () => { ui.editNames = !ui.editNames; render(); },
  'save-memo': () => {
    const m = (ui.form.memo || '').trim();
    if (!m) return toast('先にメモを入力してください');
    if (memos().includes(m)) return toast('すでに保存されています');
    saveHousehold({ memos: [...memos(), m] });
    toast(`「${m}」をよく使う項目に保存しました`);
  },
  save: () => {
    const f = ui.form;
    const amount = parseInt(f.amount, 10);
    if (!amount || amount <= 0) { toast('金額を入力してください'); document.getElementById('f-amount')?.focus(); return; }
    if (!f.cat) return toast('費目を選んでください');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) return toast('日付を選んでください');
    const wasEdit = !!f.id;
    store.saveExpense({ id: f.id, date: f.date, amount, payer: f.payer, cat: f.cat, memo: (f.memo || '').trim(), t: f.t }, f.origYm).catch(fail('保存'));
    toast(wasEdit ? '変更を保存しました' : `${yen(amount)}円を保存しました`);
    ui.selDate = f.date;
    ui.form = blankForm({ payer: f.payer, cat: f.cat, date: f.date });
    if (wasEdit) { ui.tab = 'calendar'; ui.ym = f.date.slice(0, 7); window.scrollTo(0, 0); }
    render();
  },
  delete: () => {
    const f = ui.form;
    if (!f.id || !confirm('この記録を削除しますか？')) return;
    store.deleteExpense(f.id, f.origYm).catch(fail('削除'));
    toast('削除しました');
    ui.form = blankForm(f);
    ui.tab = 'calendar';
    render();
  },
  'cancel-edit': () => { ui.form = blankForm(ui.form); ui.tab = 'calendar'; render(); },

  'select-day': (b) => { ui.selDate = b.dataset.date; render(); },
  'add-on-day': () => { ui.form = blankForm({ ...ui.form, date: ui.selDate }); ui.form.id = null; ui.tab = 'input'; render(); window.scrollTo(0, 0); },
  'edit-entry': (b) => openEntry(b.dataset.id, b.dataset.ym),

  'trend-mode': (b) => { ui.trendMode = b.dataset.mode; render(); },

  'settle-record': () => {
    const from = ui.settleFrom; const to = ui.settleTo;
    if (!isYm(from) || !isYm(to) || from > to) return;
    const r = computeSettle(from, to);
    const n = names();
    const msg = r.transfer > 0
      ? `${ymLabel(from)}〜${ymLabel(to)}分を精算済みとして記録しますか？\n（${n[r.payerFrom]} → ${n[1 - r.payerFrom]}：${yen(r.transfer)}円）`
      : `${ymLabel(from)}〜${ymLabel(to)}分を精算済みとして記録しますか？`;
    if (!confirm(msg)) return;
    store.addSettlement({ from, to, total: r.total, paid: r.paid, transfer: r.transfer, payerFrom: r.payerFrom, at: Date.now() }).catch(fail('記録'));
    toast('精算を記録しました');
    ui.settleFrom = null; ui.settleTo = null;
    render();
  },
  'settle-delete': (b) => {
    if (!confirm('この精算記録を削除しますか？（支出の記録は消えません）')) return;
    store.deleteSettlement(b.dataset.id).catch(fail('削除'));
  },

  'cat-add': () => {
    const name = (ui.newCat || '').trim();
    if (!name) return toast('費目名を入力してください');
    if (activeCats().some((c) => c.name === name)) return toast('同じ名前の費目があります');
    const arch = allCats().find((c) => c.archived && c.name === name);
    const cats = arch ? allCats().map((c) => (c.id === arch.id ? { id: c.id, name: c.name } : c))
      : [...allCats(), { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), name }];
    saveHousehold({ categories: cats });
    ui.newCat = '';
    toast(`「${name}」を追加しました`);
  },
  'cat-up': (b) => {
    const cats = allCats().slice();
    const act = cats.filter((c) => !c.archived);
    const i = act.findIndex((c) => c.id === b.dataset.id);
    if (i <= 0) return;
    const ia = cats.indexOf(act[i]); const ib = cats.indexOf(act[i - 1]);
    [cats[ia], cats[ib]] = [cats[ib], cats[ia]];
    saveHousehold({ categories: cats });
  },
  'cat-archive': (b) => {
    const c = allCats().find((x) => x.id === b.dataset.id);
    if (!c) return;
    if (activeCats().length <= 1) return toast('費目は1つ以上必要です');
    if (!confirm(`費目「${c.name}」を削除しますか？\n過去の記録は消えず、集計にも残ります。`)) return;
    saveHousehold({ categories: allCats().map((x) => (x.id === c.id ? { ...x, archived: true } : x)) });
  },
  'cat-restore': (b) => {
    saveHousehold({ categories: allCats().map((x) => (x.id === b.dataset.id ? { id: x.id, name: x.name } : x)) });
  },
  'memo-add': () => {
    const m = (ui.newMemo || '').trim();
    if (!m) return;
    if (memos().includes(m)) return toast('すでにあります');
    saveHousehold({ memos: [...memos(), m] });
    ui.newMemo = '';
  },
  'memo-del': (b) => {
    const i = Number(b.dataset.i);
    const list = memos().slice();
    if (!confirm(`「${list[i]}」をよく使うメモから外しますか？`)) return;
    list.splice(i, 1);
    saveHousehold({ memos: list });
  },
  copy: (b) => copyText(b.dataset.v),
  'share-link': async (b) => {
    const url = b.dataset.url;
    const text = '夫婦の家計簿に招待します。リンクを開いてアカウントを作成してください。';
    if (navigator.share) {
      try { await navigator.share({ title: '夫婦の家計簿', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyText(url);
  },
  'export-csv': () => downloadCsv(),
  'sign-out': () => { if (confirm('ログアウトしますか？')) store.signOut().catch(fail('ログアウト')); },

  'auth-toggle': () => { ui.auth.mode = ui.auth.mode === 'login' ? 'signup' : 'login'; ui.auth.msg = ''; ui.auth.ok = ''; render(); },
  'auth-reset': async () => {
    const email = ui.auth.email.trim();
    if (!email) { ui.auth.msg = 'メールアドレスを入力してから押してください。'; ui.auth.ok = ''; render(); return; }
    try { await store.resetPassword(email); ui.auth.ok = 'パスワード再設定のメールを送りました。'; ui.auth.msg = ''; }
    catch (e) { ui.auth.msg = authMessage(e); ui.auth.ok = ''; }
    render();
  }
};

const forms = {
  async auth() {
    const a = ui.auth;
    const email = a.email.trim();
    if (!email || !a.password) { a.msg = 'メールアドレスとパスワードを入力してください。'; render(); return; }
    a.busy = true; a.msg = ''; a.ok = ''; render();
    try {
      if (a.mode === 'signup') await store.signUp(email, a.password);
      else await store.signIn(email, a.password);
      a.password = '';
    } catch (e) { a.msg = authMessage(e); }
    a.busy = false;
    render();
  },
  async join() {
    const h = ui.hh;
    const code = h.code.trim();
    if (!/^[A-Za-z0-9]{10,40}$/.test(code)) { h.msg = '招待コードが正しくありません。'; render(); return; }
    h.busy = true; h.msg = ''; render();
    try {
      await store.joinHousehold(code);
      if (joinParam) history.replaceState(null, '', location.pathname);
    } catch (e) {
      const c = (e && e.code) || '';
      h.msg = c === 'not-found' ? '招待コードが見つかりません。' : c === 'permission-denied' ? 'この家計簿には参加できません（すでに2人参加している可能性があります）。' : `参加できませんでした（${c || e}）`;
    }
    h.busy = false;
    render();
  },
  async create() {
    const h = ui.hh;
    h.busy = true; h.msg = ''; render();
    try { await store.createHousehold(h.nameA.trim() || '夫', h.nameB.trim() || '妻'); } catch (e) { h.msg = `作成できませんでした（${(e && e.code) || e}）`; }
    h.busy = false;
    render();
  }
};

$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || !$app.contains(b) || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (fn) fn(b, e);
});

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const fn = forms[e.target.dataset.form];
  if (fn) fn();
});

$app.addEventListener('input', (e) => {
  const el = e.target;
  const field = el.dataset.field;
  if (field === 'amount') {
    const digits = toHalf(el.value).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
    ui.form.amount = digits;
    const shown = digits ? yen(Number(digits)) : '';
    if (el.value !== shown) {
      const fromEnd = el.value.length - (el.selectionEnd ?? el.value.length);
      el.value = shown;
      const pos = Math.max(0, shown.length - fromEnd);
      try { el.setSelectionRange(pos, pos); } catch (err) { /* noop */ }
    }
  } else if (field && field in ui.form) {
    ui.form[field] = el.value;
  }
  if (el.dataset.ui) setUiPath(el.dataset.ui, el.value);
});

$app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.hhName != null) {
    const i = Number(el.dataset.hhName);
    const v = el.value.trim();
    const n = names().slice();
    if (!v) { el.value = n[i]; return; }
    if (v === n[i]) return;
    n[i] = v;
    saveHousehold({ names: n });
  } else if (el.dataset.catRename) {
    const id = el.dataset.catRename;
    const v = el.value.trim();
    const c = allCats().find((x) => x.id === id);
    if (!c) return;
    if (!v) { el.value = c.name; return; }
    if (v === c.name) return;
    saveHousehold({ categories: allCats().map((x) => (x.id === id ? { ...x, name: v } : x)) });
  } else if (el.dataset.settle) {
    if (isYm(el.value)) {
      if (el.dataset.settle === 'from') ui.settleFrom = el.value; else ui.settleTo = el.value;
      render();
    }
  } else if (el.dataset.field === 'date') {
    ui.form.date = el.value;
  }
});

window.addEventListener('online', () => { ui.online = true; render(); });
window.addEventListener('offline', () => { ui.online = false; render(); });

// 日付が変わったまま開きっぱなしの場合に「今日」を更新
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.phase === 'ready') render();
});

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
store = createStore((state) => {
  const prevPhase = S.phase;
  S = state;
  if (S.phase === 'ready' && prevPhase !== 'ready') {
    // 招待リンクから来たが、すでに別の家計簿に入っている場合は何もしない
  }
  render();
});
render();
if (isDemo) console.info('Firebase 未設定のためデモモードで起動しました。');
