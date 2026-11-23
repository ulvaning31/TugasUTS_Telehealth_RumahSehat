/* Rumah Sehat — frontend Self-Assessment Telehealth (HTML + JS murni) */
const API = 'https://telehealth.informatikaunimus.site/api';
const app = document.getElementById('app');
let cfg = JSON.parse(localStorage.getItem('rs_cfg') || 'null'); // {nim,nama,kelas,token}
let S = {}, startSec = 0;

/* ---------- util ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const badge = s => s ? `<span class="badge ${esc(s.kode)}">${esc(s.label)}</span>` : '';
const val = o => o.value ?? o.nilai ?? o.id;
const ql = q => q.pertanyaan || q.label || q.text || q.question || q.id;
const qopts = q => q.options || q.opsi || [];
const isReq = q => !!(q.required ?? q.wajib);
const filled = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
const errMsg = e => e.status === 401 ? 'Token tidak valid. Periksa kembali di halaman Pengaturan.'
  : e.status === 409 ? 'Aksi tidak bisa dilakukan: ' + e.message : e.message || 'Terjadi kesalahan.';
const box = (t, c = 'err') => `<div class="alert ${c}">${esc(t)}</div>`;

async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + (cfg?.token || ''), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw { status: 0, message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.' }; }
  let j = {}; try { j = await r.json(); } catch {}
  if (!j.success) throw { status: r.status, message: j.message || 'Terjadi kesalahan.', errors: j.errors };
  return j;
}

function isVisible(c, a) {
  if (!c) return true;
  if (c.any) return c.any.some(x => isVisible(x, a));
  if (c.all) return c.all.every(x => isVisible(x, a));
  const v = a[c.question];
  if ('equals' in c) return v === c.equals;
  if ('in' in c) return c.in.includes(v);
  if ('includes' in c) return Array.isArray(v) && v.includes(c.includes);
  if ('filled' in c) return filled(v) === c.filled;
  return true;
}

function ansText(q, v) {
  if (!filled(v)) return '<span class="empty">Belum diisi</span>';
  const o = qopts(q), lab = x => esc((o.find(p => String(val(p)) === String(x)) || { label: x }).label);
  if (Array.isArray(v)) return v.map(lab).join(', ');
  return lab(v) + (q.type === 'number' && (q.satuan || q.unit) ? ' ' + esc(q.satuan || q.unit) : '');
}

/* ---------- router ---------- */
const routes = [['settings', pgSettings], ['form/(.+)', pgIntro], ['fill/(.+)', pgFill], ['review/(.+)', pgReview],
  ['done/(.+)', pgDone], ['history', pgHistory], ['result/(.+)', pgResult], ['status/(.+)', pgStatus], ['', pgHome]];

async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!cfg && h !== 'settings') { location.hash = '#/settings'; return; }
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.n === h.split('/')[0]));
  for (const [r, fn] of routes) {
    const m = h.match(new RegExp('^' + r + '$'));
    if (!m) continue;
    app.innerHTML = '<div class="loading">Memuat…</div>';
    try { await fn(m[1]); } catch (e) { app.innerHTML = box(errMsg(e)) + '<a class="btn o" href="#/">Kembali ke beranda</a>'; }
    window.scrollTo(0, 0); return;
  }
}
addEventListener('hashchange', route); addEventListener('load', route);

/* ---------- 0. Pengaturan / identitas ---------- */
function pgSettings() {
  const c = cfg || {};
  app.innerHTML = `<h1>Pengaturan</h1><p class="mut">Isi identitas mahasiswa dan token pasien dari dosen. Data disimpan di browser ini saja.</p>
  <div class="card"><div id="msg"></div>
  <label class="f" for="nim">NIM</label><input type="text" id="nim" value="${esc(c.nim)}" placeholder="G2A021001">
  <label class="f" for="nama">Nama lengkap</label><input type="text" id="nama" value="${esc(c.nama)}">
  <label class="f" for="kelas">Kelas</label><input type="text" id="kelas" value="${esc(c.kelas)}" placeholder="TI-5A">
  <label class="f" for="token">Token pasien</label><input type="password" id="token" value="${esc(c.token)}" placeholder="tlh_pasien_…">
  <div class="mt"><button class="btn" onclick="saveCfg()">Simpan dan uji koneksi</button></div></div>`;
}
async function saveCfg() {
  const g = id => document.getElementById(id).value.trim();
  const n = { nim: g('nim').toUpperCase(), nama: g('nama'), kelas: g('kelas'), token: g('token') };
  const m = document.getElementById('msg');
  if (!/^[A-Z0-9]{5,20}$/.test(n.nim)) return m.innerHTML = box('NIM harus 5–20 huruf atau angka.');
  if (n.nama.length < 3 || !n.kelas || !n.token) return m.innerHTML = box('Nama (min. 3 huruf), kelas, dan token wajib diisi.');
  const old = cfg; cfg = n;
  try { await api('/me?nim=' + n.nim); localStorage.setItem('rs_cfg', JSON.stringify(n)); location.hash = '#/'; route(); }
  catch (e) { cfg = old; m.innerHTML = box(errMsg(e)); }
}

/* ---------- 1. Beranda ---------- */
async function pgHome() {
  const [me, fm, uts] = await Promise.all([api('/me?nim=' + cfg.nim), api('/forms'), api('/uts/' + cfg.nim).catch(() => null)]);
  const m = me.data, st = m.statistik || {}, u = uts && uts.data;
  app.innerHTML = `<div class="hero"><h1>Halo, ${esc(m.nama)}</h1><p>No. RM ${esc(m.no_rm)} · Pengisi: ${esc(cfg.nama)} (${esc(cfg.nim)}, ${esc(cfg.kelas)})</p></div>
  ${st.perlu_klarifikasi ? `<div class="alert">Ada ${st.perlu_klarifikasi} laporan yang menunggu jawaban klarifikasi Anda. <a href="#/history">Lihat riwayat</a></div>` : ''}
  <div class="stats">${[['Total', st.total], ['Draf', st.draf], ['Menunggu', st.menunggu], ['Perlu klarifikasi', st.perlu_klarifikasi], ['Sudah ditinjau', st.sudah_ditinjau]]
    .map(([l, v]) => `<div class="stat"><b>${v ?? 0}</b><span class="mut sm">${l}</span></div>`).join('')}</div>
  <h2>Pilih formulir</h2><div class="grid">${fm.data.map(f => `<div class="card"><h3>${esc(f.judul)}</h3>
    <p class="mut">${esc(f.deskripsi || '')}</p><p class="mut sm">Sekitar ${esc(f.estimasi_menit || '?')} menit</p>
    <a class="btn" href="#/form/${esc(f.id)}">Mulai self-assessment</a></div>`).join('')}</div>
  ${u ? `<div class="card"><div class="row sp"><h3>Status tugas UTS</h3>${badge(u.penilaian?.status)}</div>
    <p class="mut">Bukti fitur terdeteksi: <b>${u.bukti_fitur.tercapai}/${u.bukti_fitur.total}</b></p>
    <div class="prog"><i style="width:${u.bukti_fitur.tercapai / u.bukti_fitur.total * 100}%"></i></div>
    <details><summary>Lihat rincian</summary><ul>${u.bukti_fitur.daftar.map(d => `<li>${d.tercapai ? '✅' : '⬜'} ${esc(d.label)}</li>`).join('')}</ul></details></div>` : ''}`;
}

/* ---------- 2. Petunjuk & persetujuan ---------- */
async function pgIntro(id) {
  const f = (await api('/forms/' + id)).data;
  const pt = Array.isArray(f.petunjuk) ? f.petunjuk : f.petunjuk ? [f.petunjuk] : [];
  const ps = typeof f.persetujuan === 'string' ? f.persetujuan : (f.persetujuan?.teks || f.persetujuan?.text || 'Saya memahami dan menyetujui penggunaan data ini.');
  app.innerHTML = `<h1>${esc(f.judul)}</h1><p class="mut">${esc(f.deskripsi || '')}</p>
  <div class="card"><h2>Petunjuk pengisian</h2><ul>${pt.map(p => `<li>${esc(typeof p === 'string' ? p : p.teks || p.text)}</li>`).join('')}</ul></div>
  <div class="card"><h2>Persetujuan penggunaan data</h2><div id="msg"></div>
    <label class="opt" style="display:block"><input type="checkbox" id="setuju" onchange="document.getElementById('go').disabled=!this.checked"><span>${esc(ps)}</span></label>
    <div class="mt row"><a class="btn o" href="#/">Kembali</a><button class="btn" id="go" disabled onclick="startForm('${esc(id)}')">Mulai mengisi</button></div></div>`;
}
async function startForm(id) {
  try {
    const r = await api('/assessments', { method: 'POST', body: { form_id: id, persetujuan: true, mahasiswa: { nim: cfg.nim, nama: cfg.nama, kelas: cfg.kelas } } });
    startSec = 0; location.hash = '#/fill/' + r.data.id;
  } catch (e) { document.getElementById('msg').innerHTML = box(errMsg(e)); }
}

/* ---------- 3. Pengisian bertahap ---------- */
async function loadFill(id) {
  const a = (await api('/assessments/' + id)).data;
  if (a.status_pengiriman?.kode === 'terkirim') { location.hash = '#/status/' + id; throw { status: 0, message: 'Laporan sudah dikirim dan tidak dapat diubah.' }; }
  const f = (await api('/forms/' + (a.form?.id || a.form_id))).data;
  S = { id, a, f, answers: { ...(a.answers || {}) }, qmap: {}, i: startSec };
  f.sections.forEach(s => s.questions.forEach(q => S.qmap[q.id] = q));
}
const visSecs = () => S.f.sections.filter(s => isVisible(s.show_if, S.answers));

async function pgFill(id) { await loadFill(id); startSec = 0; drawSection(); }

function drawSection() {
  const secs = visSecs(); S.i = Math.min(S.i, secs.length - 1);
  const s = secs[S.i], last = S.i === secs.length - 1;
  app.innerHTML = `<p class="mut sm">${esc(S.f.judul)} · Bagian ${S.i + 1} dari ${secs.length}</p>
  <div class="prog"><i style="width:${(S.i + 1) / secs.length * 100}%"></i></div>
  <div class="card"><h2>${esc(s.title || s.judul || s.nama || '')}</h2><p class="mut">${esc(s.deskripsi || s.description || '')}</p><div id="top"></div>
  <div id="qs">${s.questions.map(qHtml).join('')}</div>
  <div class="row sp mt"><div class="row">${S.i ? '<button class="btn o" onclick="prevSec()">Kembali</button>' : ''}<button class="btn o" onclick="nextSec(true)">Simpan draf</button></div>
  <button class="btn" onclick="nextSec()">${last ? 'Periksa jawaban' : 'Lanjut'}</button></div></div>`;
  const qs = document.getElementById('qs');
  qs.addEventListener('input', onAns); qs.addEventListener('change', onAns); applyVis();
}

function qHtml(q) {
  const v = S.answers[q.id], o = qopts(q), t = q.type, id = esc(q.id);
  let inp = '';
  if (t === 'single_choice' || t === 'scale')
    inp = `<div class="opts ${t === 'scale' ? 'sc' : ''}">${o.map(x => `<label class="opt"><input type="radio" name="${id}" value="${esc(val(x))}" ${filled(v) && String(v) === String(val(x)) ? 'checked' : ''}><span>${esc(x.label)}</span></label>`).join('')}</div>`;
  else if (t === 'multi_choice')
    inp = `<div class="opts">${o.map(x => `<label class="opt"><input type="checkbox" name="${id}" value="${esc(val(x))}" ${Array.isArray(v) && v.includes(val(x)) ? 'checked' : ''}><span>${esc(x.label)}</span></label>`).join('')}</div>`;
  else if (t === 'textarea') inp = `<textarea name="${id}" rows="3" maxlength="${q.max_length || 500}">${esc(v ?? '')}</textarea>`;
  else if (t === 'number') inp = `<div class="unit"><input type="number" name="${id}" step="any" min="${q.min ?? ''}" max="${q.max ?? ''}" value="${esc(v ?? '')}" placeholder="${q.min ?? ''}–${q.max ?? ''}"><span>${esc(q.satuan || q.unit || '')}</span></div>`;
  else if (t === 'date') inp = `<input type="date" name="${id}" max="${new Date().toISOString().slice(0, 10)}" value="${esc(v ?? '')}">`;
  else inp = `<input type="text" name="${id}" maxlength="${q.max_length || 150}" value="${esc(v ?? '')}">`;
  return `<div class="q" data-q="${id}"><span class="ql">${esc(ql(q))}${isReq(q) ? ' <span class="req">*</span>' : ' <span class="mut sm">(opsional)</span>'}${q.data_type === 'pengukuran' ? ' <span class="badge">ukur</span>' : ''}</span>
  ${q.hint || q.bantuan ? `<div class="hint">${esc(q.hint || q.bantuan)}</div>` : ''}${inp}<div class="err" id="e_${id}"></div></div>`;
}

function onAns(e) {
  const el = e.target, id = el.name; if (!id || !S.qmap[id]) return;
  const q = S.qmap[id], o = qopts(q);
  if (el.type === 'radio') { if (e.type !== 'change') return; S.answers[id] = val(o.find(x => String(val(x)) === el.value)); }
  else if (el.type === 'checkbox') {
    if (e.type !== 'change') return;
    const clicked = o.find(x => String(val(x)) === el.value);
    let cur = (S.answers[id] || []).filter(x => x !== val(clicked));
    if (el.checked) cur = clicked.exclusive ? [val(clicked)] : [...cur.filter(x => !o.find(p => val(p) === x)?.exclusive), val(clicked)];
    S.answers[id] = cur.length ? cur : null;
    document.querySelectorAll(`input[name="${id}"]`).forEach(c => c.checked = cur.includes(o.find(x => String(val(x)) === c.value) && val(o.find(x => String(val(x)) === c.value))));
  } else {
    if (e.type !== 'input' && el.type !== 'date') return;
    S.answers[id] = el.value === '' ? null : q.type === 'number' ? Number(el.value) : el.value;
  }
  document.getElementById('e_' + id).textContent = ''; applyVis();
}
function applyVis() {
  document.querySelectorAll('#qs [data-q]').forEach(w => { w.hidden = !isVisible(S.qmap[w.dataset.q].show_if, S.answers); });
}
function showErrors(errs) {
  Object.entries(errs || {}).forEach(([k, m]) => { const e = document.getElementById('e_' + k); if (e) e.textContent = m; });
  const f = document.querySelector('.err:not(:empty)'); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function prevSec() { S.i--; drawSection(); window.scrollTo(0, 0); }
async function nextSec(draftOnly) {
  const s = visSecs()[S.i], errs = {};
  if (!draftOnly) s.questions.forEach(q => {
    if (isVisible(q.show_if, S.answers) && isReq(q) && !filled(S.answers[q.id])) errs[q.id] = q.pesan_wajib || 'Pertanyaan ini wajib diisi.';
  });
  if (Object.keys(errs).length) return showErrors(errs);
  try { await api('/assessments/' + S.id, { method: 'PATCH', body: { answers: S.answers } }); }
  catch (e) { document.getElementById('top').innerHTML = box(errMsg(e)); return showErrors(e.errors); }
  if (draftOnly) { document.getElementById('top').innerHTML = box('Draf tersimpan. Anda dapat melanjutkannya dari Riwayat.', 'ok'); return; }
  if (S.i < visSecs().length - 1) { S.i++; drawSection(); window.scrollTo(0, 0); } else location.hash = '#/review/' + S.id;
}

/* ---------- 4. Periksa sebelum kirim ---------- */
async function pgReview(id) {
  await loadFill(id);
  const v = (await api('/forms/' + S.f.id + '/validate', { method: 'POST', body: { nim: cfg.nim, answers: S.answers } })).data;
  const errs = v.errors || {}, pct = v.kelengkapan?.persen ?? 0;
  const secOf = qid => visSecs().findIndex(s => s.questions.some(q => q.id === qid));
  app.innerHTML = `<h1>Periksa jawaban</h1><div class="card"><div class="row sp"><b>Kelengkapan</b><span class="badge ${v.valid ? 'terkirim' : 'draft'}">${v.valid ? 'Siap dikirim' : 'Belum lengkap'}</span></div>
  <div class="prog"><i style="width:${pct}%"></i></div>
  ${Object.keys(errs).length ? `<div class="alert"><b>Masih perlu dilengkapi:</b><ul>${Object.entries(errs).map(([k, m]) => `<li><a href="#" onclick="event.preventDefault();goSec('${esc(id)}',${secOf(k)})">${esc(m)}</a></li>`).join('')}</ul></div>` : ''}
  <div id="msg"></div></div>
  <div class="card"><h2>Ringkasan jawaban</h2><dl class="sum">${visSecs().flatMap(s => s.questions).filter(q => isVisible(q.show_if, S.answers))
    .map(q => `<dt>${esc(ql(q))}</dt><dd>${ansText(q, S.answers[q.id])}</dd>`).join('')}</dl></div>
  <div class="row"><button class="btn o" onclick="goSec('${esc(id)}',0)">Ubah jawaban</button>
  <button class="btn" ${v.valid ? '' : 'disabled'} onclick="submitForm('${esc(id)}')">Kirim jawaban</button></div>`;
}
function goSec(id, i) { startSec = Math.max(0, i); if (location.hash === '#/fill/' + id) route(); else location.hash = '#/fill/' + id; }
async function submitForm(id) {
  try { await api(`/assessments/${id}/submit`, { method: 'POST' }); location.hash = '#/done/' + id; }
  catch (e) { document.getElementById('msg').innerHTML = box(e.message + (e.errors ? ': ' + Object.values(e.errors).join(' ') : '')); }
}

/* ---------- 5. Konfirmasi ---------- */
async function pgDone(id) {
  const a = (await api('/assessments/' + id)).data;
  app.innerHTML = `<div class="card" style="text-align:center"><div class="big">✓</div><h1>Formulir Anda telah diterima</h1>
  <p>Nomor laporan <b>${esc(a.id)}</b> · dikirim ${fmt(a.dikirim_pada)}</p><p>${badge(a.status_peninjauan)}</p>
  <p class="mut">${esc(a.pesan_status || 'Laporan Anda sedang menunggu peninjauan petugas.')}</p>
  <div class="row mt" style="justify-content:center"><a class="btn o" href="#/result/${esc(id)}">Lihat ringkasan</a><a class="btn" href="#/status/${esc(id)}">Pantau status</a></div></div>`;
}

/* ---------- 6. Riwayat ---------- */
let hist = [];
async function pgHistory() {
  hist = (await api('/assessments?nim=' + cfg.nim)).data;
  app.innerHTML = `<div class="row sp"><h1>Riwayat</h1><select id="flt" style="width:auto" onchange="drawHist()">
  <option value="">Semua</option><option value="draft">Draf</option><option value="menunggu_peninjauan">Menunggu</option><option value="sedang_ditinjau">Diproses</option>
  <option value="perlu_klarifikasi">Perlu klarifikasi</option><option value="klarifikasi_dijawab">Klarifikasi dijawab</option><option value="sudah_ditinjau">Sudah ditinjau</option></select></div><div id="list"></div>`;
  drawHist();
}
function drawHist() {
  const f = document.getElementById('flt').value;
  const L = hist.filter(a => !f || a.status_pengiriman.kode === f || a.status_peninjauan.kode === f);
  document.getElementById('list').innerHTML = L.length ? L.map(a => {
    const d = a.status_pengiriman.kode === 'draft';
    return `<div class="card"><div class="item"><div><h3>${esc(a.judul || a.form?.judul)}</h3><div class="mut sm">${esc(a.form?.judul)} · ${esc(a.id)}<br>${d ? 'Dibuat ' + fmt(a.dibuat_pada) : 'Dikirim ' + fmt(a.dikirim_pada)}</div></div>
    <div>${badge(a.status_pengiriman)} ${d ? '' : badge(a.status_peninjauan)}</div></div>
    ${a.klarifikasi_menunggu ? '<div class="alert mt">Petugas meminta klarifikasi. Silakan jawab.</div>' : ''}
    <div class="row mt">${d ? `<a class="btn s" href="#/fill/${esc(a.id)}">Lanjutkan mengisi</a><button class="btn d s" onclick="delDraft('${esc(a.id)}')">Hapus draf</button>`
      : `<a class="btn o s" href="#/result/${esc(a.id)}">Lihat hasil</a><a class="btn s" href="#/status/${esc(a.id)}">${a.klarifikasi_menunggu ? 'Jawab klarifikasi' : a.ada_tindak_lanjut ? 'Lihat tindak lanjut' : 'Pantau status'}</a>`}</div></div>`;
  }).join('') : '<div class="card empty">Belum ada laporan. Mulai dari halaman Beranda.</div>';
}
async function delDraft(id) {
  if (!confirm('Hapus draf ini?')) return;
  try { await api('/assessments/' + id, { method: 'DELETE' }); pgHistory(); } catch (e) { alert(errMsg(e)); }
}

/* ---------- 7. Hasil ---------- */
async function pgResult(id) {
  const h = (await api(`/assessments/${id}/hasil`)).data, k = h.kelengkapan || {}, p = h.perubahan;
  app.innerHTML = `<h1>${esc(h.judul || 'Ringkasan')}</h1><p class="mut">Laporan ${esc(id)}</p>
  <div class="card"><div class="row sp"><b>Kelengkapan</b><span class="badge terkirim">${esc(k.label || '')} (${k.persen ?? 0}%)</span></div><div class="prog"><i style="width:${k.persen ?? 0}%"></i></div></div>
  ${h.skor ? `<div class="card"><h2>Skor</h2><div class="row"><span class="big">${h.skor.total}</span><span class="mut">dari ${h.skor.maks}</span><span class="badge">${esc(h.skor.kategori?.label)}</span></div><p class="mut">${esc(h.skor.keterangan)}</p></div>` : ''}
  ${p && p.pembanding_id ? `<div class="card"><h2>Perubahan dari laporan sebelumnya</h2><p class="mut">Dibandingkan dengan ${esc(p.pembanding_id)}</p>
    ${p.skor ? `<p>Skor ${p.skor.sebelumnya} → <b>${p.skor.sekarang}</b> (${p.skor.selisih > 0 ? '+' : ''}${p.skor.selisih})</p>` : ''}
    <dl class="sum">${(p.perubahan || []).map(c => `<dt>${esc(c.label)}</dt><dd>${esc(c.sebelumnya)} → <b>${esc(c.sekarang)}</b></dd>`).join('')}</dl></div>` : ''}
  <div class="card"><h2>Jawaban Anda</h2><dl class="sum">${(h.ringkasan || []).map(r => `<dt>${esc(r.label)}${r.data_type === 'pengukuran' ? ' <span class="badge">ukur</span>' : ''}</dt><dd>${r.terisi ? esc(r.jawaban_teks) : '<span class="empty">Belum diisi</span>'}</dd>`).join('')}</dl></div>
  <div class="alert"><b>Keterbatasan hasil.</b> ${esc(h.keterbatasan || 'Hasil self-assessment bukan diagnosis.')}</div>
  <div class="alert info"><b>Langkah berikutnya.</b> ${esc(h.langkah_berikutnya || '')}</div>
  <a class="btn" href="#/status/${esc(id)}">Pantau status laporan</a>`;
}

/* ---------- 8–10. Status, klarifikasi, tindak lanjut ---------- */
async function pgStatus(id) {
  const s = (await api(`/assessments/${id}/status`)).data, t = s.tindak_lanjut, kl = s.klarifikasi_menunggu || [];
  app.innerHTML = `<h1>Status laporan</h1><p class="mut">Laporan ${esc(id)}</p>
  <div class="card"><div class="row sp"><span>Pengiriman</span>${badge(s.status_pengiriman)}</div><div class="row sp mt"><span>Peninjauan</span>${badge(s.status_peninjauan)}</div>
  <div class="alert info mt">${esc(s.pesan || '')}</div></div>
  ${kl.length ? `<div class="card"><h2>Klarifikasi dari petugas</h2><div id="msg"></div>${kl.map(k => `<div class="alert"><b>Petugas:</b> ${esc(k.pertanyaan)}</div>
    <label class="f" for="r_${esc(k.id)}">Jawaban Anda</label><textarea id="r_${esc(k.id)}" rows="3" maxlength="500"></textarea>
    <div class="mt"><button class="btn" onclick="reply('${esc(id)}','${esc(k.id)}')">Kirim jawaban</button></div>`).join('')}</div>` : ''}
  ${t ? `<div class="card"><div class="row sp"><h2>Tindak lanjut</h2><span class="badge terkirim">${esc(t.jenis?.label)}</span></div><p>${esc(t.arahan)}</p>
    ${t.jadwal_konsultasi ? `<div class="alert ok"><b>Jadwal konsultasi:</b> ${fmt(t.jadwal_konsultasi)}</div>` : ''}
    <p class="mut sm">Dicatat oleh ${esc(t.dicatat_oleh?.nama)} · ${fmt(t.dicatat_pada)}</p></div>` : ''}
  <div class="card"><h2>Riwayat status</h2><ul class="tl">${[...(s.timeline || [])].reverse().map(e => `<li>${esc(e.keterangan || e.event)}<div class="mut sm">${fmt(e.waktu)}</div></li>`).join('')}</ul></div>
  <div class="row"><a class="btn o" href="#/result/${esc(id)}">Lihat ringkasan</a><button class="btn" onclick="route()">Muat ulang status</button></div>`;
}
async function reply(id, cid) {
  const j = document.getElementById('r_' + cid).value.trim(), m = document.getElementById('msg');
  if (!j) return m.innerHTML = box('Jawaban tidak boleh kosong.');
  try { await api(`/assessments/${id}/clarifications/${cid}/reply`, { method: 'POST', body: { jawaban: j } }); route(); }
  catch (e) { m.innerHTML = box(errMsg(e)); }
}
