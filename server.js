const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const XLSX = require('xlsx');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ course: '', className: '', term: 'Ca 1 — 7h30–9h15', qrToken: require('crypto').randomBytes(24).toString('hex') }, null, 2), 'utf8');

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
const readRows = () => readJson(DATA_FILE, []);
const readSettings = () => readJson(SETTINGS_FILE, { course: '', className: '', term: 'Ca 1 — 7h30–9h15', qrToken: '' });
const adminOnly = (req, res, next) => req.session && req.session.admin ? next() : res.status(401).json({ error: 'Vui lòng đăng nhập.' });
const clientIp = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

app.use(express.json({ limit: '100kb' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'diem-danh-local-change-this-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/public-info', (req, res) => {
  const s = readSettings();
  res.json({ course: s.course, className: s.className, term: s.term, token: s.qrToken });
});
app.post('/api/attendance', (req, res) => {
  const { studentId, fullName, course, className, term, deviceId, token } = req.body || {};
  if (!studentId || !fullName || !course || !className || !term || !deviceId || !token) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin và quét đúng mã QR.' });
  const settings = readSettings();
  if (token !== settings.qrToken) return res.status(403).json({ error: 'Mã QR đã hết hiệu lực. Vui lòng quét mã mới do giảng viên cung cấp.' });
  const rows = readRows();
  if (rows.some(row => row.deviceId === String(deviceId))) return res.status(409).json({ error: 'Thiết bị này đã điểm danh. Liên hệ giảng viên nếu cần điểm danh lại.' });
  if (rows.some(row => row.studentId.toLowerCase() === String(studentId).trim().toLowerCase() && row.term === term && row.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }))) return res.status(409).json({ error: 'Mã sinh viên đã điểm danh ca này hôm nay.' });
  const now = new Date();
  const record = { id: require('crypto').randomUUID(), studentId: String(studentId).trim(), fullName: String(fullName).trim(), course: String(course).trim(), className: String(className).trim(), term: String(term), date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now), time: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now), deviceId: String(deviceId), ip: clientIp(req) };
  rows.push(record); writeJson(DATA_FILE, rows); res.status(201).json({ message: 'Điểm danh thành công!', record: { ...record, deviceId: undefined, ip: undefined } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== (process.env.ADMIN_USER || 'admin') || password !== (process.env.ADMIN_PASSWORD || '123456')) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
  req.session.admin = true; res.json({ ok: true });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!(req.session && req.session.admin) }));
app.get('/api/admin/attendance', adminOnly, (req, res) => res.json(readRows().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))));
app.delete('/api/admin/attendance/:id', adminOnly, (req, res) => {
  const rows = readRows(); const next = rows.filter(row => row.id !== req.params.id);
  if (rows.length === next.length) return res.status(404).json({ error: 'Không tìm thấy lượt điểm danh.' });
  writeJson(DATA_FILE, next); res.json({ ok: true, message: 'Đã xóa lượt điểm danh. Thiết bị có thể điểm danh lại.' });
});
app.get('/api/admin/settings', adminOnly, (req, res) => { const { course, className, term } = readSettings(); res.json({ course, className, term }); });
app.put('/api/admin/settings', adminOnly, (req, res) => {
  const { course, className, term } = req.body || {};
  if (!course || !className || !term) return res.status(400).json({ error: 'Vui lòng nhập học phần, lớp và ca.' });
  const s = readSettings(); Object.assign(s, { course: String(course).trim(), className: String(className).trim(), term: String(term) }); writeJson(SETTINGS_FILE, s); res.json({ ok: true });
});
app.post('/api/admin/qr/refresh', adminOnly, (req, res) => { const s = readSettings(); s.qrToken = require('crypto').randomBytes(24).toString('hex'); writeJson(SETTINGS_FILE, s); res.json({ ok: true, token: s.qrToken }); });
app.get('/api/admin/qr', adminOnly, async (req, res) => {
  const s = readSettings();
  const requestedHost = (req.get('host') || '').split(':')[0];
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(requestedHost);
  const lanIp = localHost ? lanAddresses()[0] : null;
  const host = lanIp ? `${lanIp}:${PORT}` : req.get('host');
  const origin = `${req.protocol}://${host}`;
  const link = `${origin}/?token=${encodeURIComponent(s.qrToken)}`;
  try { res.json({ link, dataUrl: await QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#172f2b', light: '#ffffff' } }) }); } catch { res.status(500).json({ error: 'Không tạo được mã QR.' }); }
});
app.get('/api/admin/export', adminOnly, (req, res) => {
  const params = req.query; let rows = readRows();
  const includes = (field, value) => !value || String(field || '').toLocaleLowerCase('vi').includes(String(value).toLocaleLowerCase('vi'));
  rows = rows.filter(r => includes(r.studentId, params.studentId) && includes(r.fullName, params.fullName) && includes(r.course, params.course) && includes(r.className, params.className) && (!params.term || r.term === params.term) && (!params.date || r.date === params.date));
  const data = rows.map((r, i) => ({ 'STT': i + 1, 'Mã sinh viên': r.studentId, 'Họ và tên': r.fullName, 'Học phần': r.course, 'Lớp': r.className, 'Ca': r.term, 'Ngày': r.date, 'Giờ điểm danh': r.time }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Điểm danh');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); res.setHeader('Content-Disposition', 'attachment; filename="diem-danh.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
});

function lanAddresses() { const out = []; for (const entries of Object.values(os.networkInterfaces())) for (const item of entries || []) if (item.family === 'IPv4' && !item.internal) out.push(item.address); return out; }
app.listen(PORT, '0.0.0.0', () => { console.log(`Ứng dụng điểm danh: http://localhost:${PORT}`); for (const ip of lanAddresses()) console.log(`Điện thoại cùng Wi-Fi: http://${ip}:${PORT}`); });
