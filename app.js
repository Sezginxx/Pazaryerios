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

// ===== ADMIN & SITE CONFIG =====
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
  contactPhone: "+90 5xx xxx xx xx"
};

const ADMIN_CREDENTIALS = { email: "admin@pazaryerios.com", password: "admin123" };

function auth(req,res,next){
  const t=req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error:'Giris yok'});
  try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ res.status(401).json({error:'Token hatali'}) }
}
function adminAuth(req,res,next){
  const t=req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error:'Admin girisi yok'});
  try{ 
    const decoded = jwt.verify(t,JWT_SECRET);
    if(!decoded.isAdmin) return res.status(403).json({error:'Yetki yok'});
    req.admin=decoded; next(); 
  }catch{ res.status(401).json({error:'Token hatali'}) }
}

// PUBLIC CONFIG - Herkes görebilir (anasayfa için)
app.get('/api/config', (req,res)=>{
  res.json({success:true, data: siteConfig});
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

// ADMIN - CONFIG GET
app.get('/api/admin/config', adminAuth, (req,res)=>{
  res.json({success:true, data: siteConfig});
});

// ADMIN - CONFIG UPDATE
app.post('/api/admin/config', adminAuth, (req,res)=>{
  const {heroTitle, heroSubtitle, pricing, announcement, contactEmail, contactPhone} = req.body;
  if(heroTitle) siteConfig.heroTitle = heroTitle;
  if(heroSubtitle) siteConfig.heroSubtitle = heroSubtitle;
  if(pricing) siteConfig.pricing = pricing;
  if(announcement!==undefined) siteConfig.announcement = announcement;
  if(contactEmail) siteConfig.contactEmail = contactEmail;
  if(contactPhone) siteConfig.contactPhone = contactPhone;
  res.json({success:true, message:'Ayarlar kaydedildi', data: siteConfig});
});

// ADMIN - STATS
app.get('/api/admin/stats', adminAuth, (req,res)=>{
  res.json({
    success:true,
    data:{
      totalUsers: users.length,
      totalConnections: Object.values(connections).flat().length,
      totalProducts: products.length,
      totalOrders: orders.length,
      users: users.map(u=>({email:u.email, shopName:u.shopName, id:u.id}))
    }
  });
});

app.get('/api/marketplaces', (req,res)=> res.json({success:true,data:ALL_MARKETPLACES}));
app.post('/api/register', async (req,res)=>{
  const {email,password,shopName}=req.body;
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'Email var'});
  const h=await bcrypt.hash(password,10);
  const u={id:Date.now(),email,passwordHash:h,shopName};
  users.push(u);
  const token=jwt.sign({id:u.id,email,shopName},JWT_SECRET);
  res.json({success:true,token})
});
app.post('/api/login', async (req,res)=>{
  const {email,password}=req.body;
  const u=users.find(x=>x.email===email);
  if(!u) return res.status(404).json({error:'Yok'});
  const ok=await bcrypt.compare(password,u.passwordHash);
  if(!ok) return res.status(400).json({error:'Sifre hatali'});
  const token=jwt.sign({id:u.id,email:u.email,shopName:u.shopName},JWT_SECRET);
  res.json({success:true,token})
});
app.get('/api/connections',auth,(req,res)=> res.json({success:true,data:connections[req.user.id]||[]}));
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
  return res.json({ success:true, count: 2, message: 'Demo siparişler', data: [
    { orderNumber: 'TR-DEMO-001', customer: 'Test Müşteri', product: 'Siyah T-Shirt', qty: 1, status: 'Created' },
    { orderNumber: 'TR-DEMO-002', customer: 'Ayşe Yılmaz', product: 'Beyaz Sneaker', qty: 2, status: 'Picking' }
  ]});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('CALISIYOR PORT:'+PORT));
