const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const JWT_SECRET = 'gizli-anahtar-123';

let users = [];
let products = [
  { barcode: '86800001', title: 'Siyah T-Shirt', stock: 100, marketplaces: ['Trendyol','Hepsiburada'] },
  { barcode: '86800002', title: 'Beyaz Sneaker', stock: 42, marketplaces: ['Trendyol','N11','Amazon'] },
  { barcode: '86800003', title: 'Mavi Kot', stock: 15, marketplaces: ['Hepsiburada','N11'] }
];
let orders = [{ id: 1001, marketplace: 'Trendyol', orderNumber: 'TR-123', barcode: '86800001', product: 'Siyah T-Shirt', qty: 1 }];
let emailLogs = []; // Mail logları

const ALL_MARKETPLACES = [
  { id: 'trendyol', name: 'Trendyol', icon: '🟧', fields: ['supplierId','apiKey','apiSecret'], desc: 'SupplierId, API Key, Secret' },
  { id: 'hepsiburada', name: 'Hepsiburada', icon: '🟦', fields: ['apiKey','apiSecret'], desc: 'API Key, Secret' },
  { id: 'n11', name: 'N11', icon: '🔴', fields: ['apiKey','apiSecret'], desc: 'API Key, Secret' },
  { id: 'amazon', name: 'Amazon TR', icon: '📦', fields: ['sellerId','apiKey','apiSecret'], desc: 'Seller ID, MWS Token' },
  { id: 'etsy', name: 'Etsy', icon: '🟠', fields: ['apiKey','apiSecret'], desc: 'API Key, Shop ID' },
  { id: 'shopify', name: 'Shopify', icon: '💚', fields: ['storeUrl','apiKey'], desc: 'Mağaza URL, Admin Token' },
  { id: 'ciceksepeti', name: 'ÇiçekSepeti', icon: '🌸', fields: ['apiKey'], desc: 'API Key' },
  { id: 'pazarama', name: 'Pazarama', icon: '🟣', fields: ['apiKey','apiSecret'], desc: 'API Key, Secret' },
  { id: 'pttavm', name: 'PTT AVM', icon: '📮', fields: ['apiKey','apiSecret'], desc: 'API Key, Secret' },
  { id: 'idefix', name: 'İdefix', icon: '📚', fields: ['apiKey'], desc: 'API Key' }
];

let connections = {};
let siteConfig = {
  heroTitle: "1 ürün sat. 10 pazaryerinde stok düşsün.",
  heroSubtitle: "Trendyol, Hepsiburada, N11, Amazon, Etsy, Shopify, ÇiçekSepeti, Pazarama, PTT AVM, İdefix tek panel.",
  pricing: [
    { name: "Starter", price: 199, period: "ay", features: ["3 Pazaryeri", "500 Ürün", "Stok Senkron", "Email Destek"], popular: false },
    { name: "Growth", price: 399, period: "ay", features: ["7 Pazaryeri", "5.000 Ürün", "Anlık Senkron", "Sipariş Yönetimi", "Öncelikli Destek"], popular: true },
    { name: "Scale", price: 799, period: "ay", features: ["10 Pazaryeri", "Sınırsız Ürün", "API Erişimi", "Özel Entegrasyon", "7/24 Destek"], popular: false }
  ],
  announcement: "🎉 Yeni: Amazon ve Etsy entegrasyonu aktif!",
  contactEmail: "destek@pazaryerios.com",
  contactPhone: "+90 5xx xxx xx xx",
  trialDays: 14
};

const ADMIN_CREDENTIALS = { email: "admin@pazaryerios.com", password: "admin123" };

// ===== HELPER: TRIAL HESAPLAMA =====
function getTrialInfo(user){
  const now = new Date();
  const endsAt = new Date(user.trialEndsAt);
  const diffMs = endsAt - now;
  const diffDays = Math.ceil(diffMs / (1000*60*60*24));
  const isExpired = diffMs <= 0;
  const isActive = !isExpired && user.isActive !== false;
  return { diffDays: isExpired ? 0 : diffDays, isExpired, isActive, endsAt };
}

function sendEmail(to, subject, body){
  // Gerçekte burada SendGrid / Resend / SMTP olacak
  // Şimdilik logluyoruz - Render loglarında görünecek
  const log = { to, subject, body, at: new Date().toLocaleString('tr-TR') };
  emailLogs.push(log);
  console.log(`[MAIL] To:${to} Subject:${subject}`);
  return log;
}

function checkAndNotifyTrial(user){
  const info = getTrialInfo(user);
  const now = Date.now();
  // 3 gün ve 1 gün kala uyarı
  if(!user.emailsSent) user.emailsSent = {};
  
  if(info.diffDays === 3 && !user.emailsSent['3days']){
    sendEmail(user.email, '⏰ Deneme süreniz 3 gün sonra bitiyor - PazaryeriOS', `Merhaba ${user.shopName}, deneme süreniz 3 gün sonra bitiyor. Mağazanızın kapanmaması için paketinizi yükseltin: https://pazaryerios.onrender.com`);
    user.emailsSent['3days'] = true;
  }
  if(info.diffDays === 1 && !user.emailsSent['1day']){
    sendEmail(user.email, '🚨 Son 1 gün! Mağazanız yarın kapanacak - PazaryeriOS', `Merhaba ${user.shopName}, deneme süreniz yarın bitiyor. Hemen abonelik alın.`);
    user.emailsSent['1day'] = true;
  }
  if(info.isExpired && !user.emailsSent['expired']){
    sendEmail(user.email, '❌ Deneme süreniz bitti - Mağazanız durduruldu', `Merhaba ${user.shopName}, deneme süreniz bitti ve mağazanız durduruldu. Yeniden aktif etmek için abonelik alın.`);
    user.emailsSent['expired'] = true;
    user.isActive = false;
  }
  return info;
}

function auth(req,res,next){
  const t=req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error:'Giris yok'});
  try{
    const decoded = jwt.verify(t,JWT_SECRET);
    const user = users.find(u=>u.id===decoded.id);
    if(!user) return res.status(401).json({error:'Kullanıcı yok'});
    const trialInfo = checkAndNotifyTrial(user);
    if(trialInfo.isExpired){
      return res.status(403).json({error:'⛔ Deneme süreniz bitti. Lütfen abonelik satın alın.', trialExpired:true, trialInfo});
    }
    req.user=decoded;
    req.userDoc=user;
    req.trialInfo=trialInfo;
    next();
  }catch(e){
    if(e.message && e.message.includes('Deneme')) throw e;
    res.status(401).json({error:'Token hatali'})
  }
}

function adminAuth(req,res,next){
  const t=req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error:'Admin girisi yok'});
  try{ const decoded = jwt.verify(t,JWT_SECRET); if(!decoded.isAdmin) return res.status(403).json({error:'Yetki yok'}); req.admin=decoded; next(); }catch{ res.status(401).json({error:'Token hatali'}) }
}

// PUBLIC
app.get('/api/config', (req,res)=> res.json({success:true, data: siteConfig}));

// TRIAL STATUS - Giriş yapmış kullanıcı için
app.get('/api/me/trial', auth, (req,res)=>{
  res.json({success:true, data: { ...req.trialInfo, shopName: req.userDoc.shopName, email: req.userDoc.email }});
});

// ADMIN LOGIN
app.post('/api/admin/login', async (req,res)=>{
  const {email,password}=req.body;
  if(email===ADMIN_CREDENTIALS.email && password===ADMIN_CREDENTIALS.password){
    const token=jwt.sign({email, isAdmin:true}, JWT_SECRET, {expiresIn:'24h'});
    return res.json({success:true, token});
  }
  res.status(401).json({error:'Admin bilgileri hatalı'});
});
app.get('/api/admin/config', adminAuth, (req,res)=> res.json({success:true, data: siteConfig}));
app.post('/api/admin/config', adminAuth, (req,res)=>{
  const {heroTitle, heroSubtitle, pricing, announcement, contactEmail, contactPhone, trialDays} = req.body;
  if(heroTitle) siteConfig.heroTitle = heroTitle;
  if(heroSubtitle) siteConfig.heroSubtitle = heroSubtitle;
  if(pricing) siteConfig.pricing = pricing;
  if(announcement!==undefined) siteConfig.announcement = announcement;
  if(contactEmail) siteConfig.contactEmail = contactEmail;
  if(contactPhone) siteConfig.contactPhone = contactPhone;
  if(trialDays) siteConfig.trialDays = parseInt(trialDays);
  res.json({success:true, message:'Ayarlar kaydedildi', data: siteConfig});
});
app.get('/api/admin/stats', adminAuth, (req,res)=>{
  const usersWithTrial = users.map(u=>{
    const info = getTrialInfo(u);
    return { ...u, trialInfo: info, passwordHash: undefined };
  });
  res.json({
    success:true,
    data:{
      totalUsers: users.length,
      totalConnections: Object.values(connections).flat().length,
      totalProducts: products.length,
      totalOrders: orders.length,
      emailLogs: emailLogs.slice(-20).reverse(),
      users: usersWithTrial
    }
  });
});
// ADMIN - Trial uzatma
app.post('/api/admin/users/:id/extend', adminAuth, (req,res)=>{
  const user = users.find(u=>u.id==req.params.id);
  if(!user) return res.status(404).json({error:'Kullanıcı yok'});
  const {days} = req.body;
  const addDays = parseInt(days) || 7;
  const currentEnd = new Date(user.trialEndsAt);
  currentEnd.setDate(currentEnd.getDate() + addDays);
  user.trialEndsAt = currentEnd.toISOString();
  user.isActive = true;
  user.emailsSent = {}; // mailleri sıfırla
  sendEmail(user.email, `✅ Deneme süreniz ${addDays} gün uzatıldı`, `Merhaba ${user.shopName}, deneme süreniz ${addDays} gün uzatıldı. Yeni bitiş: ${currentEnd.toLocaleDateString('tr-TR')}`);
  res.json({success:true, message: `${addDays} gün uzatıldı`, user: {...user, passwordHash: undefined}});
});
// ADMIN - Kullanıcıyı aktif/pasif yap
app.post('/api/admin/users/:id/toggle', adminAuth, (req,res)=>{
  const user = users.find(u=>u.id==req.params.id);
  if(!user) return res.status(404).json({error:'Yok'});
  user.isActive = !user.isActive;
  res.json({success:true, isActive: user.isActive});
});

app.get('/api/marketplaces', (req,res)=> res.json({success:true,data:ALL_MARKETPLACES}));

app.post('/api/register', async (req,res)=>{
  const {email,password,shopName}=req.body;
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'Email var'});
  const h=await bcrypt.hash(password,10);
  const now = new Date();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(now.getDate() + (siteConfig.trialDays || 14));
  const u={
    id: Date.now(), email, passwordHash:h, shopName,
    createdAt: now.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    isActive: true,
    plan: 'trial',
    emailsSent: {}
  };
  users.push(u);
  sendEmail(email, '🎉 Hoşgeldiniz! 14 günlük denemeniz başladı', `Merhaba ${shopName}, PazaryeriOS denemeniz başladı. Bitiş: ${trialEndsAt.toLocaleDateString('tr-TR')}`);
  const token=jwt.sign({id:u.id,email,shopName},JWT_SECRET);
  res.json({success:true,token, trialEndsAt: u.trialEndsAt})
});

app.post('/api/login', async (req,res)=>{
  const {email,password}=req.body;
  const u=users.find(x=>x.email===email);
  if(!u) return res.status(404).json({error:'Yok'});
  const ok=await bcrypt.compare(password,u.passwordHash);
  if(!ok) return res.status(400).json({error:'Sifre hatali'});
  const trialInfo = checkAndNotifyTrial(u);
  if(trialInfo.isExpired){
    return res.status(403).json({error:'⛔ Deneme süreniz bitti. Lütfen abonelik satın alın.', trialExpired:true, trialInfo});
  }
  const token=jwt.sign({id:u.id,email:u.email,shopName:u.shopName},JWT_SECRET);
  res.json({success:true,token, trialInfo})
});

app.get('/api/connections',auth,(req,res)=> res.json({success:true,data:connections[req.user.id]||[], trialInfo: req.trialInfo}));
app.post('/api/connections',auth,(req,res)=>{
  const {marketplace,apiKey,apiSecret,supplierId,storeUrl,sellerId} = req.body;
  if(!connections[req.user.id]) connections[req.user.id]=[];
  connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!==marketplace);
  connections[req.user.id].push({ marketplace, apiKey, apiSecret, supplierId, storeUrl, sellerId, status:'Bagli', connectedAt: new Date().toLocaleString('tr-TR') });
  res.json({success:true, message: marketplace + ' başarıyla bağlandı!'})
});
app.delete('/api/connections/:marketplace',auth,(req,res)=>{
  if(connections[req.user.id]) connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!==req.params.marketplace);
  res.json({success:true})
});
app.get('/api/products',auth,(req,res)=>res.json({success:true,data:products, trialInfo: req.trialInfo}));
app.get('/api/orders',auth,(req,res)=>res.json({success:true,data:orders}));
app.post('/api/orders/mock-sell',auth,(req,res)=>{
  const p=products.find(x=>x.barcode===req.body.barcode);
  if(p) p.stock--;
  res.json({success:true})
});
app.get('/api/trendyol/orders',auth,async (req,res)=>{
  const userConns = connections[req.user.id] || [];
  const trendyolConn = userConns.find(c=>c.marketplace==='Trendyol');
  if(!trendyolConn) return res.json({success:false, error:'Önce Trendyol bağlantısı eklemelisin.'});
  return res.json({ success:true, count: 2, data: [
    { orderNumber: 'TR-DEMO-001', customer: 'Test Müşteri', product: 'Siyah T-Shirt', qty: 1, status: 'Created' },
    { orderNumber: 'TR-DEMO-002', customer: 'Ayşe Yılmaz', product: 'Beyaz Sneaker', qty: 2, status: 'Picking' }
  ]});
});

// CRON - Her 1 saatte bir tüm kullanıcıları kontrol et (Render'da manuel tetiklenebilir)
app.get('/api/cron/check-trials', (req,res)=>{
  let expiredCount=0, warningCount=0;
  users.forEach(u=>{
    const info = checkAndNotifyTrial(u);
    if(info.isExpired) expiredCount++;
    if(info.diffDays<=3 && info.diffDays>0) warningCount++;
  });
  res.json({success:true, checked: users.length, expired: expiredCount, warnings: warningCount, emailLogs: emailLogs.slice(-10)});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('CALISIYOR PORT:'+PORT));
