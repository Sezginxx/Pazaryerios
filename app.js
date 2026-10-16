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

// TÜM PAZARYERLERİ LİSTESİ
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

function auth(req,res,next){
  const t=req.headers.authorization?.split(' ')[1];
  if(!t) return res.status(401).json({error:'Giris yok'});
  try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ res.status(401).json({error:'Token hatali'}) }
}

app.get('/api/marketplaces', (req,res)=>{
  res.json({success:true,data:ALL_MARKETPLACES});
});

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

app.get('/api/connections',auth,(req,res)=>{
  res.json({success:true,data:connections[req.user.id]||[]})
});

app.post('/api/connections',auth,(req,res)=>{
  const {marketplace,apiKey,apiSecret,supplierId,storeUrl,sellerId} = req.body;
  if(!connections[req.user.id]) connections[req.user.id]=[];
  // Aynı pazaryeri varsa güncelle
  connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!==marketplace);
  connections[req.user.id].push({
    marketplace, apiKey, apiSecret, supplierId, storeUrl, sellerId,
    status:'Bagli', connectedAt: new Date().toLocaleString('tr-TR')
  });
  res.json({success:true, message: marketplace + ' başarıyla bağlandı!'})
});

app.delete('/api/connections/:marketplace',auth,(req,res)=>{
  if(connections[req.user.id]){
    connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!==req.params.marketplace);
  }
  res.json({success:true})
});

app.get('/api/products',auth,(req,res)=>res.json({success:true,data:products}));
app.get('/api/orders',auth,(req,res)=>res.json({success:true,data:orders}));
app.post('/api/orders/mock-sell',auth,(req,res)=>{
  const p=products.find(x=>x.barcode===req.body.barcode);
  if(p) p.stock--;
  res.json({success:true})
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('CALISIYOR PORT:'+PORT));
