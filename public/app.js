const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const termLabels = ['Ca 1 — 7h30–9h15', 'Ca 2 — 9h45–12h00', 'Ca 3 — 13h00–15h15', 'Ca 4 — 15h45–18h00', 'Ca 5 — Buổi tối'];
const deviceId = (() => { let id = localStorage.getItem('attendance-device-id'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('attendance-device-id', id); } return id; })();
const showNotice = (text, type = 'error') => { const n = $('notice'); n.textContent = text; n.className = `notice ${type}`; };
(async () => { try { const r = await fetch('/api/public-info'); const s = await r.json(); if (s.course) $('course').value = s.course; if (s.className) $('className').value = s.className; if (s.term) $('term').value = s.term; } catch {} })();
$('attendance-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.submitter; button.disabled = true; button.innerHTML = 'Đang ghi nhận…'; $('notice').className = 'notice hidden';
  const body = { studentId: $('studentId').value.trim(), fullName: $('fullName').value.trim(), course: $('course').value.trim(), className: $('className').value.trim(), term: $('term').value, deviceId, token: params.get('token') || '' };
  try { const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Có lỗi xảy ra.'); $('attendance-form').classList.add('hidden'); $('receipt').innerHTML = `<div><span>MÃ SINH VIÊN</span><strong>${escapeHtml(body.studentId)}</strong></div><div><span>HỌ VÀ TÊN</span><strong>${escapeHtml(body.fullName)}</strong></div><div><span>HỌC PHẦN</span><strong>${escapeHtml(body.course)}</strong></div><div><span>CA HỌC</span><strong>${escapeHtml(body.term)}</strong></div>`; $('success').classList.remove('hidden'); } catch (err) { showNotice(err.message); button.disabled = false; button.innerHTML = 'Xác nhận điểm danh <span>→</span>'; }
});
function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
