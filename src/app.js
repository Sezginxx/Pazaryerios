const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = 'pazaryeri-saaas-cok-gizli-anahtar';

// HAFIZA VERITABANI
let users = []; // {id, email, passwordHash, shopName}
let products = [
  { barcode: '86800001', title: 'Siyah T-Shirt', stock: 100, marketplaces: ['【entity-Trendyol¦canonical_name=Trendyol】', '【entity-Hepsiburada¦canonical_name=Hepsiburada】'] },
  { barcode: '86800002', title: 'Beyaz Sneaker', stock: 42, marketplaces: ['【entity-Trendyol¦canonical_name=Trendyol】', '【entity-N11¦canonical_name=N11】'] },
  { barcode: '86800003', title: 'Mavi Kot', stock: 15, marketplaces: ['【entity-Hepsiburada¦canonical_name=Hepsiburada】', '【entity-N11¦canonical_name=N11】'] }
];
let orders = [
  { id: 1001, marketplace: '【entity-Trendyol¦canonical_name=Trendyol】', orderNumber: 'TR-123456', barcode: '86800001', product: 'Siyah T-Shirt', qty: 1, customer: 'Ahmet Y.' }
];

// AUTH MIDDLEWARE
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Giris yapmalisin' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Token gecersiz' }); }
}

// REGISTER
app.post('/api/register', async (req, res) => {
  const { email, password, shopName } = req.body;
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Bu email zaten var' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now(), email, passwordHash: hash, shopName };
  users.push(user);
  const token = jwt.sign({ id: user.id, email, shopName }, JWT_SECRET);
  res.json({ success: true, token, user: { email, shopName } });
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Kullanici yok' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Sifre yanlis' });
  const token = jwt.sign({ id: user.id, email: user.email, shopName: user.shopName }, JWT_SECRET);
  res.json({ success: true, token, user: { email: user.email, shopName: user.shopName } });
});

// PROTECTED API'LER
app.get('/api/products', auth, (req, res) => res.json({ success: true, data: products }));
app.get('/api/orders', auth, (req, res) => res.json({ success: true, data: orders }));

app.post('/api/orders/mock-sell', auth, (req, res) => {
  const { barcode, marketplace, qty } = req.body;
  const product = products.find(p => p.barcode === barcode);
  if (!product) return res.status(404).json({ error: 'Urun yok' });
  product.stock -= qty;
  const newOrder = { id: Date.now(), marketplace, orderNumber: `TEST-${Date.now()}`, barcode, product: product.title, qty, customer: 'Test' };
  orders.unshift(newOrder);
  console.log(`[SENKRON] ${req.user.shopName} -> ${product.title} satildi, kalan ${product.stock}`);
  res.json({ success: true, product, order: newOrder });
});

app.listen(3001, () => console.log('CALISIYOR: http://localhost:3001'));