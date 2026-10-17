const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const JWT_SECRET = process.env.JWT_SECRET || 'gizli-anahtar-123';
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''; // Render'da Environment'dan gelecek
const FROM_EMAIL = process.env.FROM_EMAIL || 'PazaryeriOS <onboarding@resend.dev>'; // Resend test domain

let users = [];
let products = [
  { barcode: '86800001', title: 'Siyah T-Shirt', stock: 100, marketplaces: ['Trendyol','Hepsiburada'] },
  { barcode: '86800002', title: 'Beyaz Sneaker', stock: 42, marketplaces: ['Trendyol','N11','Amazon'] },
  { barcode: '86800003', title: 'Mavi Kot', stock: 15, marketplaces: ['Hepsiburada','N11'] }
];
let orders = [{ id: 1001, marketplace: 'Trendyol', orderNumber: 'TR-123', barcode: '86800001', product: 'Siyah T-Shirt', qty: 1 }];
let emailLogs = [];

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

function getTrialInfo(user){
  const now = new Date();
  const endsAt = new Date(user.trialEndsAt);
  const diffMs = endsAt - now;
  const diffDays = Math.ceil(diffMs / (1000*60*60*24));
  const isExpired = diffMs <= 0;
  const isActive = !isExpired && user.isActive !== false;
  return { diffDays: isExpired ? 0 : diffDays, isExpired, isActive, endsAt };
}

// ===== GERÇEK MAİL GÖNDERME - RESEND =====
async function sendEmail(to, subject, htmlBody){
  const log = { to, subject, body: htmlBody, at: new Date().toLocaleString('tr-TR'), status: 'logged' };
  emailLogs.push(log);
  
  // Eğer RESEND_API_KEY yoksa sadece logla
  if(!RESEND_API_KEY){
    console.log(`[MAIL-LOG] To:${to} Subject:${subject} (API anahtarı yok, sadece log)`);
    log.status = 'logged - no API key';
    return log;
  }

  try{
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        html: htmlBody
      })
    });
    const data = await response.json();
    if(!response.ok){
      console.error('[MAIL-ERROR] Resend hatası:', data);
      log.status = 'failed: ' + JSON.stringify(data);
      log.error = data;
    } else {
      console.log(`[MAIL-SENT] To:${to} ID:${data.id}`);
      log.status = 'sent';
      log.resendId = data.id;
    }
  }catch(e){
    console.error('[MAIL-ERROR]', e.message);
    log.status = 'error: ' + e.message;
    log.error = e.message;
  }
  return log;
}

function emailTemplate(title, message, shopName, ctaText, ctaLink){
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
    <div style="background:#111;color:#fff;padding:20px;text-align:center;font-weight:900;font-size:20px">pazaryeriOS</div>
    <div style="padding:30px">
      <h2 style="margin:0 0 12px 0;font-size:22px">${title}</h2>
      <p style="color:#444;line-height:1.6">Merhaba <b>${shopName}</b>,</p>
      <p style="color:#444;line-height:1.6">${message}</p>
      ${ctaText ? `<div style="text-align:center;margin:28px 0"><a href="${ctaLink}" style="background:#111;color:#fff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">${ctaText}</a></div>` : ''}
      <p style="color:#888;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:16px">Bu mail PazaryeriOS tarafından otomatik gönderildi. Destek: ${siteConfig.contactEmail}</p>
    </div>
  </div>`;
}

async function checkAndNotifyTrial(user){
  const info = getTrialInfo(user);
  if(!user.emailsSent) user.emailsSent = {};
  
  if(info.diffDays === 3 && !user.emailsSent['3days']){
    await sendEmail(user.email, '⏰ Deneme süreniz 3 gün sonra bitiyor - PazaryeriOS',
      emailTemplate('⏰ 3 gün kaldı', `Deneme süreniz <b>3 gün sonra bitiyor</b>. Mağazanızın kapanmaması için hemen paketinizi yükseltin.<br><br>Bitiş tarihi: <b>${info.endsAt.toLocaleDateString('tr-TR')}</b>`, user.shopName, 'Paketimi Yükselt →', 'https://pazaryerios.onrender.com/#pricing'));
    user.emailsSent['3days'] = true;
  }
  if(info.diffDays === 1 && !user.emailsSent['1day']){
    await sendEmail(user.email, '🚨 Son 1 gün! Mağazanız yarın kapanacak - PazaryeriOS',
      emailTemplate('🚨 Son 1 gün!', `Deneme süreniz <b>yarın bitiyor</b>. Mağazanızın kapanmaması için son şans!<br><br>Yarın bu saatte mağazanız durdurulacak.`, user.shopName, 'Hemen Abone Ol →', 'https://pazaryerios.onrender.com/#pricing'));
    user.emailsSent['1day'] = true;
  }
  if(info.isExpired && !user.emailsSent['expired']){
    await sendEmail(user.email, '❌ Deneme süreniz bitti - Mağazanız durduruldu',
      emailTemplate('❌ Mağazanız durduruldu', `Deneme süreniz bitti ve mağazanız <b>durduruldu</b>.<br><br>Tekrar aktif etmek için bir paket seçin ve bizimle iletişime geçin. Verileriniz 30 gün daha saklanacak.`, user.shopName, 'Destek ile Görüş →', `mailto:${siteConfig.contactEmail}`));
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
    const trialInfo = getTrialInfo(user);
    if(trialInfo.isExpired){
      return res.status(403).json({error:'⛔ Deneme süreniz bitti. Lütfen abonelik satın alın.', trialExpired:true, trialInfo});
    }
    // Async mail check - bekletmeden
    checkAndNotifyTrial(user).catch(()=>{});
    req.user=decoded; req.userDoc=user; req.trialInfo=trialInfo;
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
app.get('/api/me/trial', auth, (req,res)=> res.json({success:true, data: { ...req.trialInfo, shopName: req.userDoc.shopName, email: req.userDoc.email }}));
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
  const usersWithTrial = users.map(u=>({...u, trialInfo: getTrialInfo(u), passwordHash: undefined}));
  res.json({success:true, data:{ totalUsers: users.length, totalConnections: Object.values(connections).flat().length, totalProducts: products.length, totalOrders: orders.length, emailLogs: emailLogs.slice(-30).reverse(), users: usersWithTrial, resendConfigured: !!RESEND_API_KEY }});
});
app.post('/api/admin/users/:id/extend', adminAuth, async (req,res)=>{
  const user = users.find(u=>u.id==req.params.id);
  if(!user) return res.status(404).json({error:'Kullanıcı yok'});
  const addDays = parseInt(req.body.days) || 7;
  const currentEnd = new Date(user.trialEndsAt);
  currentEnd.setDate(currentEnd.getDate() + addDays);
  user.trialEndsAt = currentEnd.toISOString();
  user.isActive = true;
  user.emailsSent = {};
  await sendEmail(user.email, `✅ Deneme süreniz ${addDays} gün uzatıldı`,
    emailTemplate(`✅ ${addDays} gün uzatıldı!`, `Deneme süreniz <b>${addDays} gün uzatıldı</b>.<br>Yeni bitiş: <b>${currentEnd.toLocaleDateString('tr-TR')}</b>`, user.shopName, 'Panele Git →', 'https://pazaryerios.onrender.com/dashboard.html'));
  res.json({success:true, message: `${addDays} gün uzatıldı`});
});
app.post('/api/admin/users/:id/toggle', adminAuth, (req,res)=>{
  const user = users.find(u=>u.id==req.params.id);
  if(!user) return res.status(404).json({error:'Yok'});
  user.isActive = !user.isActive;
  res.json({success:true, isActive: user.isActive});
});
// ADMIN - Test mail gönder
app.post('/api/admin/test-email', adminAuth, async (req,res)=>{
  const {to} = req.body;
  if(!to) return res.status(400).json({error:'Email gerekli'});
  const result = await sendEmail(to, '✅ PazaryeriOS Mail Testi',
    emailTemplate('✅ Mail sistemi çalışıyor!', 'Bu bir test mailidir. Resend entegrasyonunuz başarıyla çalışıyor. Artık müşterilerinize otomatik mail gidecek.', 'Test Mağaza', 'Panele Git', 'https://pazaryerios.onrender.com'));
  res.json({success:true, result});
});

app.get('/api/marketplaces', (req,res)=> res.json({success:true,data:ALL_MARKETPLACES}));
app.post('/api/register', async (req,res)=>{
  const {email,password,shopName}=req.body;
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'Email var'});
  const h=await bcrypt.hash(password,10);
  const now = new Date();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(now.getDate() + (siteConfig.trialDays || 14));
  const u={ id: Date.now(), email, passwordHash:h, shopName, createdAt: now.toISOString(), trialEndsAt: trialEndsAt.toISOString(), isActive: true, plan: 'trial', emailsSent: {} };
  users.push(u);
  await sendEmail(email, '🎉 Hoşgeldiniz! 14 günlük denemeniz başladı',
    emailTemplate('🎉 Hoşgeldiniz!', `PazaryeriOS denemeniz başladı!<br><br><b>${siteConfig.trialDays} gün boyunca</b> tüm pazaryerlerini ücretsiz deneyebilirsiniz.<br>Bitiş: <b>${trialEndsAt.toLocaleDateString('tr-TR')}</b><br><br>Hemen mağazanızı bağlayarak başlayın.`, shopName, 'Mağazamı Kur →', 'https://pazaryerios.onrender.com/dashboard.html'));
  const token=jwt.sign({id:u.id,email,shopName},JWT_SECRET);
  res.json({success:true,token, trialEndsAt: u.trialEndsAt})
});
app.post('/api/login', async (req,res)=>{
  const {email,password}=req.body;
  const u=users.find(x=>x.email===email);
  if(!u) return res.status(404).json({error:'Yok'});
  const ok=await bcrypt.compare(password,u.passwordHash);
  if(!ok) return res.status(400).json({error:'Sifre hatali'});
  const trialInfo = getTrialInfo(u);
  if(trialInfo.isExpired) return res.status(403).json({error:'⛔ Deneme süreniz bitti.', trialExpired:true, trialInfo});
  checkAndNotifyTrial(u).catch(()=>{});
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
app.get('/api/products',auth,(req,res)=>res.json({success:true,data:products}));
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
  return res.json({ success:true, count: 2, data: [{ orderNumber: 'TR-DEMO-001', customer: 'Test Müşteri', product: 'Siyah T-Shirt', qty: 1, status: 'Created' }]});
});
app.get('/api/cron/check-trials', async (req,res)=>{
  let expiredCount=0, warningCount=0;
  for(const u of users){
    const info = await checkAndNotifyTrial(u);
    if(info.isExpired) expiredCount++;
    if(info.diffDays<=3 && info.diffDays>0) warningCount++;
  }
  res.json({success:true, checked: users.length, expired: expiredCount, warnings: warningCount, emailLogs: emailLogs.slice(-10), resendConfigured: !!RESEND_API_KEY});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('CALISIYOR PORT:'+PORT+' RESEND:'+(RESEND_API_KEY?'AKTIF':'YOK')));
