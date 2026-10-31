/**
 * Shippas — progressi. Scarica data.enc.json (scritto ogni giorno da
 * fitness/scripts/dashboard_export.py), lo decifra nel browser con la password
 * (PBKDF2-SHA256 -> AES-GCM, parametri nel file) e disegna tutto in SVG.
 *
 * La password può arrivare nel link (#k=...): viene salvata in localStorage e
 * tolta dalla barra degli indirizzi. Il frammento non viene mai inviato al server.
 */
(function () {
  'use strict';

  var PW_KEY = 'shippas_pw';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var DOW = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var D, gymByDate = {}, weightWeeks = 0;

  function $(s) { return document.querySelector(s); }

  // ---------- storage + decryption ----------

  function store(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  async function decrypt(enc, pw) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function start() {
    var m = location.hash.match(/k=([^&]+)/);
    if (m) {
      store(PW_KEY, decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname + location.search);
    }
    var enc;
    try {
      var r = await fetch('data.enc.json', { cache: 'no-store' });
      enc = await r.json();
    } catch (e) {
      $('#loading').textContent = 'Impossibile scaricare i dati.';
      return;
    }
    var pw = load(PW_KEY);
    if (pw && await tryOpen(enc, pw)) return;
    $('#loading').hidden = true;
    $('#login').hidden = false;
    $('#login').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var v = $('#pw').value;
      if (await tryOpen(enc, v)) { store(PW_KEY, v); $('#login').hidden = true; }
      else $('#login-error').hidden = false;
    });
  }

  async function tryOpen(enc, pw) {
    try { D = await decrypt(enc, pw); } catch (e) { store(PW_KEY, null); return false; }
    $('#loading').hidden = true;
    $('#app').hidden = false;
    render();
    return true;
  }

  // ---------- helpers ----------

  function parse(s) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function short(s) { var d = parse(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function dayLabel(s) { return DOW[parse(s).getDay()] + ' ' + short(s); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function monday(s) { var d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function f1(x) { return x == null ? '–' : x.toFixed(1); }
  function f0(x) { return x == null ? '–' : Math.round(x).toLocaleString('it-IT'); }
  function signed(x, dig) { return x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dig); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function logged(d) { return d.kcal != null && d.kcal >= 1000; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function epley(kg, r) { return kg && r ? kg * (1 + r / 30) : 0; }

  // ---------- tooltip ----------

  var tip;
  function showTip(ev, html) {
    tip = tip || $('#tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  // ---------- model ----------

  function weeks() {
    var by = {};
    D.days.forEach(function (d) { (by[monday(d.date)] = by[monday(d.date)] || []).push(d); });
    var out = Object.keys(by).sort().map(function (k) {
      var ds = by[k], lg = ds.filter(logged);
      var w = ds.filter(function (d) { return d.w != null; }).map(function (d) { return d.w; });
      var goals = lg.filter(function (d) { return d.goal; }).map(function (d) { return d.goal; });
      var sessions = ds.reduce(function (n, d) { return n + (gymByDate[d.date] || []).length; }, 0);
      return {
        week: k, days: ds.length, nW: w.length, w: mean(w), nLog: lg.length,
        kcal: mean(lg.map(function (d) { return d.kcal; })), goal: mean(goals),
        p: mean(lg.map(function (d) { return d.p || 0; })),
        c: mean(lg.map(function (d) { return d.c || 0; })),
        f: mean(lg.map(function (d) { return d.f || 0; })),
        sessions: sessions
      };
    });
    for (var i = 1; i < out.length; i++) {
      if (out[i].w != null && out[i - 1].w != null) out[i].dw = out[i].w - out[i - 1].w;
    }
    return out;
  }

  // ---------- sections ----------

  function render() {
    gymByDate = {};
    D.workouts.forEach(function (w) { (gymByDate[w.date] = gymByDate[w.date] || []).push(w.title); });
    var W = weeks();

    var gen = new Date(D.generated);
    $('#updated').textContent = 'Aggiornato il ' + gen.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) +
      ' alle ' + gen.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ' · dati da MyFitnessPal e Hevy.';
    alerts(gen);
    $('#phase').textContent = D.phase
      ? 'Piano attuale (dal ' + short(D.phase.start) + '): ' + D.phase.text + '. Prima del ' + short(D.phase.start) + ' l’obiettivo è quello impostato in MyFitnessPal.'
      : 'Obiettivo = quello impostato in MyFitnessPal.';
    tiles(W);
    drawWeight(W);
    drawKcal();
    weekTable(W);
    progression();
    lastWorkouts();

    document.querySelectorAll('.range button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.weeks === weightWeeks));
      b.onclick = function () {
        weightWeeks = +b.dataset.weeks;
        document.querySelectorAll('.range button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        drawWeight(W);
      };
    });
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { drawWeight(W); drawKcal(); }, 150);
    });
  }

  function alerts(gen) {
    var a = [];
    var age = (Date.now() - gen.getTime()) / 864e5;
    if (age > 2) a.push('I dati non si aggiornano da ' + Math.floor(age) + ' giorni (il PC di Tommaso è rimasto spento?).');
    if (D.status.mfp === 'login_expired') a.push('MyFitnessPal non aggiornato: login scaduto. Peso e dieta sono fermi all’ultimo aggiornamento riuscito.');
    else if (D.status.mfp !== 'ok') a.push('MyFitnessPal non raggiungibile all’ultimo aggiornamento: peso e dieta potrebbero essere indietro.');
    if (D.status.hevy !== 'ok') a.push('Hevy non raggiungibile all’ultimo aggiornamento: gli allenamenti potrebbero essere indietro.');
    $('#alerts').innerHTML = a.map(function (s) { return '<p class="alert">' + esc(s) + '</p>'; }).join('');
  }

  function tiles(W) {
    var today = D.days[D.days.length - 1].date;
    function win(endOffset, n) {
      var from = addDays(today, endOffset - n + 1), to = addDays(today, endOffset);
      return D.days.filter(function (d) { return d.date >= from && d.date <= to; });
    }
    var cur = win(0, 7), prev = win(-7, 7);
    var wCur = mean(cur.filter(function (d) { return d.w != null; }).map(function (d) { return d.w; }));
    var wPrev = mean(prev.filter(function (d) { return d.w != null; }).map(function (d) { return d.w; }));
    var nW = cur.filter(function (d) { return d.w != null; }).length;
    var first = null;
    for (var i = 0; i < W.length && !first; i++) if (W[i].nW >= 3) first = W[i];

    var food = win(-1, 7), lg = food.filter(logged);   // fino a ieri: oggi è ancora in corso
    var kcal = mean(lg.map(function (d) { return d.kcal; }));
    var goal = mean(lg.filter(function (d) { return d.goal; }).map(function (d) { return d.goal; }));
    var prot = mean(lg.map(function (d) { return d.p || 0; }));
    var sess = cur.reduce(function (n, d) { return n + (gymByDate[d.date] || []).length; }, 0);

    var T = [
      { label: 'Peso medio', value: f1(wCur) + ' kg', sub: signed(wCur != null && wPrev != null ? wCur - wPrev : null, 1) + ' kg rispetto ai 7 giorni prima · ' + nW + ' pesate' },
      { label: 'Dal ' + (first ? short(first.week) : '–'), value: signed(first && wCur != null ? wCur - first.w : null, 1) + ' kg', sub: 'media settimana ' + f1(first && first.w) + ' → ' + f1(wCur) },
      { label: 'Calorie medie (fino a ieri)', value: f0(kcal), sub: 'obiettivo ' + f0(goal) + ' · ' + lg.length + '/7 giorni loggati' },
      { label: 'Proteine medie', value: f0(prot) + ' g', sub: 'obiettivo ' + D.protein_target + ' g' },
      { label: 'Allenamenti', value: String(sess), sub: 'negli ultimi 7 giorni' }
    ];
    $('#tiles').innerHTML = T.map(function (t) {
      return '<div class="tile"><div class="label">' + esc(t.label) + '</div><div class="value">' + esc(t.value) +
        '</div><div class="sub">' + esc(t.sub) + '</div></div>';
    }).join('');
  }

  // Shared frame for the two time charts: x = one slot per day.
  function frame(host, days, height, yMin, yMax, yStep, yFmt) {
    host.innerHTML = '';
    var Wd = Math.max(300, host.clientWidth), H = height;
    var m = { l: 44, r: 10, t: 10, b: 24 };
    var svg = el('svg', { viewBox: '0 0 ' + Wd + ' ' + H, height: H, role: 'img' }, host);
    var slot = (Wd - m.l - m.r) / days.length;
    var y = function (v) { return m.t + (H - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin)); };
    for (var v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) {
      el('line', { x1: m.l, x2: Wd - m.r, y1: y(v), y2: y(v), style: 'stroke:var(--grid)', 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = yFmt(v);
    }
    // x labels on Mondays, thinned to fit
    var every = Math.max(1, Math.ceil(56 / (slot * 7)));
    var k = 0;
    days.forEach(function (d, i) {
      if (parse(d.date).getDay() !== 1) return;
      if (k++ % every) return;
      el('line', { x1: m.l + i * slot, x2: m.l + i * slot, y1: H - m.b, y2: H - m.b + 4, style: 'stroke:var(--rule)' }, svg);
      el('text', { x: m.l + i * slot, y: H - 6, 'text-anchor': 'start' }, svg).textContent = short(d.date);
    });
    return { svg: svg, x: function (i) { return m.l + (i + 0.5) * slot; }, y: y, slot: slot, m: m, W: Wd, H: H };
  }

  function hover(F, days, html) {
    var r = el('rect', { x: F.m.l, y: 0, width: F.W - F.m.l - F.m.r, height: F.H - F.m.b, fill: 'transparent' }, F.svg);
    var cross = el('line', { y1: F.m.t, y2: F.H - F.m.b, style: 'stroke:var(--text-muted)', 'stroke-width': 1, visibility: 'hidden' }, F.svg);
    r.addEventListener('mousemove', function (ev) {
      var box = F.svg.getBoundingClientRect();
      var px = (ev.clientX - box.left) * F.W / box.width;
      var i = Math.max(0, Math.min(days.length - 1, Math.floor((px - F.m.l) / F.slot)));
      cross.setAttribute('x1', F.x(i)); cross.setAttribute('x2', F.x(i)); cross.setAttribute('visibility', 'visible');
      showTip(ev, html(days[i]));
    });
    r.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }

  function drawWeight(W) {
    var days = D.days;
    if (weightWeeks) {
      var from = monday(addDays(days[days.length - 1].date, -7 * (weightWeeks - 1)));
      days = days.filter(function (d) { return d.date >= from; });
    }
    var ws = days.filter(function (d) { return d.w != null; }).map(function (d) { return d.w; });
    var host = $('#chart-weight');
    if (!ws.length) { host.textContent = 'Nessuna pesata nel periodo.'; return; }
    var lo = Math.floor(Math.min.apply(null, ws) - 0.5), hi = Math.ceil(Math.max.apply(null, ws) + 0.5);
    var step = hi - lo > 8 ? 2 : 1;
    var F = frame(host, days, 280, lo, hi, step, function (v) { return v + ' kg'; });
    var wk = {};
    W.forEach(function (w) { wk[w.week] = w; });

    // weekly mean: one 2px segment per week, labelled
    var idx = {};
    days.forEach(function (d, i) { var k = monday(d.date); (idx[k] = idx[k] || []).push(i); });
    Object.keys(idx).forEach(function (k) {
      var w = wk[k], ii = idx[k];
      if (!w || w.w == null) return;
      var x0 = F.x(ii[0]) - F.slot * 0.4, x1 = F.x(ii[ii.length - 1]) + F.slot * 0.4;
      el('line', { x1: x0, x2: x1, y1: F.y(w.w), y2: F.y(w.w), style: 'stroke:var(--series)', 'stroke-width': 2, 'stroke-linecap': 'round' }, F.svg);
      if (x1 - x0 > 34) {
        var t = el('text', {
          x: (x0 + x1) / 2, y: F.y(w.w) - 7, 'text-anchor': 'middle',
          style: 'fill:var(--text);stroke:var(--bg);stroke-width:4px;paint-order:stroke;stroke-linejoin:round'
        }, F.svg);
        t.textContent = w.w.toFixed(1);
      }
    });
    days.forEach(function (d, i) {
      if (d.w == null) return;
      el('circle', { cx: F.x(i), cy: F.y(d.w), r: 3.5, style: 'fill:var(--series-soft);stroke:var(--bg)', 'stroke-width': 1 }, F.svg);
    });
    hover(F, days, function (d) {
      var w = wk[monday(d.date)];
      return '<b>' + dayLabel(d.date) + '</b><br>Pesata: ' + (d.w != null ? d.w.toFixed(1) + ' kg' : '–') +
        '<br>Media settimana: ' + f1(w && w.w) + ' kg';
    });
  }

  function drawKcal() {
    var days = D.days;
    var host = $('#chart-kcal');
    var vals = days.map(function (d) { return Math.max(d.kcal || 0, d.goal || 0); });
    var hi = Math.ceil((Math.max.apply(null, vals) + 100) / 500) * 500;
    var F = frame(host, days, 240, 0, hi, 500, function (v) { return f0(v); });
    var bw = Math.max(1, F.slot - 2);   // 2px surface gap between bars
    days.forEach(function (d, i) {
      if (!d.kcal) return;
      var gym = !!gymByDate[d.date];
      el('rect', {
        x: F.x(i) - bw / 2, y: F.y(d.kcal), width: bw, height: F.y(0) - F.y(d.kcal),
        style: 'fill:var(' + (gym ? '--series' : '--series-soft') + ')', opacity: logged(d) ? 1 : 0.35
      }, F.svg);
    });
    // goal as a dashed step line
    var path = '', prev = null;
    days.forEach(function (d, i) {
      if (!d.goal) { prev = null; return; }
      var x0 = F.x(i) - F.slot / 2, x1 = F.x(i) + F.slot / 2, y = F.y(d.goal);
      path += (prev === null ? 'M' + x0 + ' ' + y : (prev !== d.goal ? 'L' + x0 + ' ' + y : '')) + 'L' + x1 + ' ' + y;
      prev = d.goal;
    });
    el('path', { d: path, fill: 'none', style: 'stroke:var(--text-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, F.svg);
    hover(F, days, function (d) {
      var g = gymByDate[d.date];
      return '<b>' + dayLabel(d.date) + '</b><br>' +
        (d.kcal ? f0(d.kcal) + ' kcal · P ' + f0(d.p) + ' · C ' + f0(d.c) + ' · F ' + f0(d.f) : 'non loggato') +
        (d.goal ? '<br>Obiettivo ' + f0(d.goal) : '') +
        (g ? '<br>' + g.map(esc).join('<br>') : '<br>Nessun allenamento');
    });
  }

  function weekTable(W) {
    var rows = W.slice().reverse().map(function (w, i) {
      var dw = w.dw == null ? '–' : signed(w.dw, 2);
      var part = w.days < 7 ? ' <span class="muted">(' + (i === 0 ? 'in corso' : 'parziale') + ')</span>' : '';
      return '<tr><td>' + short(w.week) + '–' + short(addDays(w.week, 6)) + part +
        '</td><td class="num">' + (w.w == null ? '–' : w.w.toFixed(2)) + '</td><td class="num">' + dw +
        '</td><td class="num">' + w.nW + '</td><td class="num">' + f0(w.kcal) + '</td><td class="num">' + f0(w.goal) +
        '</td><td class="num">' + f0(w.p) + '</td><td class="num">' + f0(w.c) + '</td><td class="num">' + f0(w.f) +
        '</td><td class="num">' + w.nLog + '/' + w.days + '</td><td class="num">' + w.sessions + '</td></tr>';
    }).join('');
    $('#weeks').innerHTML = '<thead><tr><th>Settimana</th><th class="num">Peso medio</th><th class="num">Δ kg</th>' +
      '<th class="num">Pesate</th><th class="num">kcal</th><th class="num">Obiettivo</th><th class="num">P</th>' +
      '<th class="num">C</th><th class="num">F</th><th class="num">Loggati</th><th class="num">Allenamenti</th></tr></thead><tbody>' +
      rows + '</tbody>';
  }

  // Best set per session per exercise of the current program (title prefix, e.g. "S10-26").
  function progression() {
    var ws = D.workouts;
    if (!ws.length) { $('#prog-note').textContent = 'Nessun allenamento.'; return; }
    var prog = ws[ws.length - 1].title.split(' ')[0];
    var cur = ws.filter(function (w) { return w.title.split(' ')[0] === prog; });
    $('#prog-note').textContent = 'Programma ' + prog + ' (dal ' + short(cur[0].date) + ', ' + cur.length +
      ' allenamenti). Miglior serie di ogni sessione; e1RM = stima Epley kg × (1 + reps/30), solo per confrontare sessioni. ' +
      'Serie di riscaldamento escluse.';
    var by = {}, order = [];
    cur.forEach(function (w) {
      var letter = w.title.split(' ')[1] || '';
      w.ex.forEach(function (e) {
        var sets = e.s.filter(function (s) { return s.ty !== 'warmup' && s.r; });
        if (!sets.length) return;
        var key = e.t;
        if (!by[key]) { by[key] = { name: e.t, letters: {}, rows: [] }; order.push(key); }
        by[key].letters[letter] = 1;
        var best = sets.reduce(function (a, s) {
          var sc = s.kg ? epley(s.kg, s.r) : s.r, ac = a.kg ? epley(a.kg, a.r) : a.r;
          return sc > ac ? s : a;
        });
        by[key].rows.push({
          date: w.date, best: best, e1rm: best.kg ? epley(best.kg, best.r) : null,
          reps: sets.reduce(function (n, s) { return n + s.r; }, 0), n: sets.length
        });
      });
    });
    function setTxt(s) { return (s.kg ? s.kg + ' × ' : '') + s.r + (s.kg ? '' : ' reps') + (s.rpe ? ' @' + s.rpe : ''); }
    var rows = order.map(function (k) {
      var x = by[k], a = x.rows[0], b = x.rows[x.rows.length - 1];
      var d = a.e1rm && b.e1rm ? (b.e1rm / a.e1rm - 1) * 100 : null;
      var cls = d == null ? '' : d > 0.5 ? 'ok' : d < -0.5 ? 'bad' : '';
      return { letters: Object.keys(x.letters).sort().join(''), html: '<td>' + esc(x.name) + '</td><td>' + Object.keys(x.letters).sort().join(', ') +
        '</td><td class="num">' + x.rows.length + '</td><td class="num">' + setTxt(a.best) + ' <span class="muted">' + short(a.date) +
        '</span></td><td class="num">' + setTxt(b.best) + ' <span class="muted">' + short(b.date) + '</span></td><td class="num ' + cls + '">' +
        (d == null ? '–' : signed(d, 0) + '%') + '</td><td class="spark">' + spark(x.rows) + '</td>' };
    });
    rows.sort(function (p, q) { return p.letters < q.letters ? -1 : p.letters > q.letters ? 1 : 0; });
    $('#prog').innerHTML = '<thead><tr><th>Esercizio</th><th>Scheda</th><th class="num">Sessioni</th><th class="num">Prima</th>' +
      '<th class="num">Ultima</th><th class="num">Δ e1RM</th><th>Andamento</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.html + '</tr>'; }).join('') + '</tbody>';
  }

  function spark(rows) {
    var v = rows.map(function (r) { return r.e1rm != null ? r.e1rm : r.reps; });
    if (v.length < 2) return '';
    var W = 90, H = 22, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1;
    var pts = v.map(function (y, i) { return (2 + i * (W - 4) / (v.length - 1)).toFixed(1) + ',' + (H - 3 - (y - lo) / span * (H - 6)).toFixed(1); });
    var last = pts[pts.length - 1].split(',');
    return '<svg width="' + W + '" height="' + H + '" aria-hidden="true"><polyline points="' + pts.join(' ') +
      '" fill="none" style="stroke:var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" style="fill:var(--series)"/></svg>';
  }

  function lastWorkouts() {
    var ws = D.workouts.slice(-8).reverse();
    var TY = { warmup: 'R', dropset: 'D', failure: 'C' };
    $('#last').innerHTML = (ws.length ? '' : '<p>Nessun allenamento.</p>') + ws.map(function (w, i) {
      var body = w.ex.map(function (e) {
        var sets = e.s.map(function (s) {
          var t = s.r != null ? (s.kg ? s.kg + '×' + s.r : s.r + ' reps')
            : s.sec ? Math.round(s.sec / 60) + ' min' + (s.km ? ' · ' + s.km + ' km' : '') : '–';
          if (s.rpe) t += ' @' + s.rpe;
          if (TY[s.ty]) t += ' (' + TY[s.ty] + ')';
          return t;
        }).join(', ');
        return '<tr><td>' + esc(e.t) + (e.n ? '<div class="ex-note">' + esc(e.n) + '</div>' : '') + '</td><td>' + esc(sets) + '</td></tr>';
      }).join('');
      return '<details' + (i === 0 ? ' open' : '') + '><summary>' + dayLabel(w.date) + ' · ' + esc(w.title) + ' · ' + w.min + ' min</summary>' +
        '<table><thead><tr><th>Esercizio</th><th>Serie (kg×reps; R = riscaldamento, D = dropset, C = a cedimento)</th></tr></thead><tbody>' +
        body + '</tbody></table></details>';
    }).join('');
  }

  start();
})();
