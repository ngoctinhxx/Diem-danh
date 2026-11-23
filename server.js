const express = require('express');
const cookieSession = require('cookie-session');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const onVercel = process.env.VERCEL === '1';
const mongoUri = process.env.MONGODB_URI;
const mongoClient = mongoUri ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 }) : null;
let mongoCollectionPromise;

if (!onVercel) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ course: '', className: '', term: 'Ca 1 — 7h30–9h15', qrToken: crypto.randomBytes(24).toString('hex') }, null, 2), 'utf8');
}

const defaultSettings = () => ({ course: '', className: '', term: 'Ca 1 — 7h30–9h15', qrToken: crypto.randomBytes(24).toString('hex') });
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
const requireStorage = () => { if (onVercel && !mongoClient) throw new Error('Chưa cấu hình MongoDB. Hãy thêm MONGODB_URI trong Vercel.'); };
const getCollection = async () => {
  requireStorage();
  if (!mongoClient) return null;
  if (!mongoCollectionPromise) mongoCollectionPromise = (async () => {
    await mongoClient.connect();
    const database = mongoClient.db(process.env.MONGODB_DB || 'diem_danh');
    if (!await database.listCollections({ name: 'diem_danh' }, { nameOnly: true }).hasNext()) await database.createCollection('diem_danh');
    const collection = database.collection('diem_danh');
    await collection.createIndexes([
      { key: { deviceId: 1 }, name: 'one_attendance_per_device', unique: true, partialFilterExpression: { type: 'attendance' } },
      { key: { studentKey: 1, term: 1, date: 1 }, name: 'one_student_per_term_per_day', unique: true, partialFilterExpression: { type: 'attendance' } }
    ]);
    return collection;
  })();
  return mongoCollectionPromise;
};
const getRows = async () => {
  const collection = await getCollection();
  if (!collection) return readJson(DATA_FILE, []);
  return (await collection.find({ type: 'attendance' }).sort({ date: -1, time: -1 }).toArray()).map(row => row.record);
};
const addRow = async record => {
  const collection = await getCollection();
  if (!collection) { const rows = readJson(DATA_FILE, []); rows.push(record); writeJson(DATA_FILE, rows); return; }
  await collection.insertOne({ _id: record.id, type: 'attendance', deviceId: record.deviceId, studentKey: record.studentId.toLocaleLowerCase('vi'), term: record.term, date: record.date, time: record.time, record });
};
const deleteRow = async id => {
  const collection = await getCollection();
  if (!collection) { const rows = readJson(DATA_FILE, []); const next = rows.filter(row => row.id !== id); if (rows.length === next.length) return false; writeJson(DATA_FILE, next); return true; }
  const result = await collection.deleteOne({ _id: id, type: 'attendance' });
  return result.deletedCount > 0;
};
const getSettings = async () => {
  const collection = await getCollection();
  if (!collection) return readJson(SETTINGS_FILE, defaultSettings());
  const existing = await collection.findOne({ _id: 'settings', type: 'settings' });
  if (existing?.value) return existing.value;
  const initial = defaultSettings();
  try { await collection.updateOne({ _id: 'settings' }, { $setOnInsert: { type: 'settings', value: initial } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  return (await collection.findOne({ _id: 'settings', type: 'settings' }))?.value || initial;
};
const saveSettings = async settings => {
  const collection = await getCollection();
  if (!collection) { writeJson(SETTINGS_FILE, settings); return; }
  await collection.updateOne({ _id: 'settings' }, { $set: { type: 'settings', value: settings } }, { upsert: true });
};
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const adminOnly = (req, res, next) => req.session?.admin ? next() : res.status(401).json({ error: 'Vui lòng đăng nhập.' });
const clientIp = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

app.use(express.json({ limit: '100kb' }));
app.set('trust proxy', 1);
app.use(cookieSession({ name: 'attendance-session', keys: [process.env.SESSION_SECRET || 'diem-danh-local-change-this-secret'], httpOnly: true, sameSite: 'lax', secure: onVercel, maxAge: 8 * 60 * 60 * 1000 }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/diemdanh', (req, res) => res.sendFile(path.join(__dirname, 'public', 'diemdanh.html')));

const createQrPayload = async req => {
  const s = await getSettings();
  const requestedHost = (req.get('host') || '').split(':')[0];
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(requestedHost);
  const lanIp = localHost ? lanAddresses()[0] : null;
  const host = lanIp ? `${lanIp}:${PORT}` : req.get('host');
  const link = `${req.protocol}://${host}/diemdanh?token=${encodeURIComponent(s.qrToken)}`;
  const dataUrl = await QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#172f2b', light: '#ffffff' } });
  return { link, dataUrl };
};

app.get('/api/public-info', route(async (req, res) => {
  const s = await getSettings();
  res.json({ course: s.course, className: s.className, term: s.term, token: s.qrToken });
}));
app.get('/api/public/qr', route(async (req, res) => res.json(await createQrPayload(req))));
app.post('/api/attendance', route(async (req, res) => {
  const { studentId, fullName, course, className, term, deviceId, token } = req.body || {};
  if (!studentId || !fullName || !course || !className || !term || !deviceId || !token) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin và quét đúng mã QR.' });
  const settings = await getSettings();
  if (token !== settings.qrToken) return res.status(403).json({ error: 'Mã QR đã hết hiệu lực. Vui lòng quét mã mới do giảng viên cung cấp.' });
  const rows = await getRows();
  if (rows.some(row => row.deviceId === String(deviceId))) return res.status(409).json({ error: 'Thiết bị này đã điểm danh. Liên hệ giảng viên nếu cần điểm danh lại.' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  if (rows.some(row => row.studentId.toLocaleLowerCase('vi') === String(studentId).trim().toLocaleLowerCase('vi') && row.term === term && row.date === today)) return res.status(409).json({ error: 'Mã sinh viên đã điểm danh ca này hôm nay.' });
  const now = new Date();
  const record = { id: crypto.randomUUID(), studentId: String(studentId).trim(), fullName: String(fullName).trim(), course: String(course).trim(), className: String(className).trim(), term: String(term), date: today, time: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now), deviceId: String(deviceId), ip: clientIp(req) };
  try { await addRow(record); } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'Thiết bị hoặc mã sinh viên đã điểm danh ca này hôm nay.' }); throw error; }
  res.status(201).json({ message: 'Điểm danh thành công!', record: { ...record, deviceId: undefined, ip: undefined } });
}));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== (process.env.ADMIN_USER || 'admin') || password !== (process.env.ADMIN_PASSWORD || '123456')) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
  req.session.admin = true; res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!req.session?.admin }));
app.get('/api/admin/attendance', adminOnly, route(async (req, res) => {
  const rows = await getRows(); res.json(rows.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)));
}));
app.delete('/api/admin/attendance/:id', adminOnly, route(async (req, res) => {
  if (!await deleteRow(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy lượt điểm danh.' });
  res.json({ ok: true, message: 'Đã xóa lượt điểm danh. Thiết bị có thể điểm danh lại.' });
}));
app.get('/api/admin/settings', adminOnly, route(async (req, res) => {
  const { course, className, term } = await getSettings(); res.json({ course, className, term });
}));
app.put('/api/admin/settings', adminOnly, route(async (req, res) => {
  const { course, className, term } = req.body || {};
  if (!course || !className || !term) return res.status(400).json({ error: 'Vui lòng nhập học phần, lớp và ca.' });
  const s = await getSettings(); Object.assign(s, { course: String(course).trim(), className: String(className).trim(), term: String(term) }); await saveSettings(s); res.json({ ok: true });
}));
app.post('/api/admin/qr/refresh', adminOnly, route(async (req, res) => {
  const s = await getSettings(); s.qrToken = crypto.randomBytes(24).toString('hex'); await saveSettings(s); res.json({ ok: true, token: s.qrToken });
}));
app.get('/api/admin/qr', adminOnly, route(async (req, res) => res.json(await createQrPayload(req))));
app.get('/api/admin/export', adminOnly, route(async (req, res) => {
  const params = req.query; let rows = await getRows();
  const includes = (field, value) => !value || String(field || '').toLocaleLowerCase('vi').includes(String(value).toLocaleLowerCase('vi'));
  rows = rows.filter(r => includes(r.studentId, params.studentId) && includes(r.fullName, params.fullName) && includes(r.course, params.course) && includes(r.className, params.className) && (!params.term || r.term === params.term) && (!params.date || r.date === params.date));
  const data = rows.map((r, i) => ({ STT: i + 1, 'Mã sinh viên': r.studentId, 'Họ và tên': r.fullName, 'Học phần': r.course, 'Lớp': r.className, Ca: r.term, Ngày: r.date, 'Giờ điểm danh': r.time }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Điểm danh');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); res.setHeader('Content-Disposition', 'attachment; filename="diem-danh.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
}));

app.use((error, req, res, next) => {
  console.error(error);
  const message = onVercel && !mongoClient ? error.message : 'Có lỗi máy chủ. Vui lòng kiểm tra cấu hình và nhật ký chạy.';
  res.status(500).json({ error: message });
});

function lanAddresses() { const out = []; for (const entries of Object.values(os.networkInterfaces())) for (const item of entries || []) if (item.family === 'IPv4' && !item.internal) out.push(item.address); return out; }
if (require.main === module) app.listen(PORT, '0.0.0.0', () => { console.log(`Ứng dụng điểm danh: http://localhost:${PORT}`); for (const ip of lanAddresses()) console.log(`Điện thoại cùng Wi-Fi: http://${ip}:${PORT}`); });
module.exports = app;
