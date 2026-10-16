const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const JWT_SECRET = 'gizli-anahtar-123-renderda-degistir';
let users = [];
let products = [
  { barcode: '86800001', title: 'Siyah T-Shirt', stock: 100, marketplaces: ['Trendyol','Hepsiburada'] },
  { barcode: '86800002', title: 'Beyaz Sneaker', stock: 42, marketplaces: ['Trendyol','N11'] },
  { barcode: '86800003', title: 'Mavi Kot', stock: 15, marketplaces: ['Hepsiburada','N11'] }
];
let orders = [{ id: 1001, marketplace: 'Trendyol', orderNumber: 'TR-123', barcode: '86800001', product: 'Siyah T-Shirt', qty: 1 }];
let connections = {};
function auth(req,res,next){const t=req.headers.authorization?.split(' ')[1];if(!t)return res.status(401).json({error:'Giris yok'});try{req.user=jwt.verify(t,JWT_SECRET);next()}catch{res.status(401).json({error:'Token hatali'})}}
app.post('/api/register', async (req,res)=>{const {email,password,shopName}=req.body;if(users.find(u=>u.email===email))return res.status(400).json({error:'Email var'});const h=await bcrypt.hash(password,10);const u={id:Date.now(),email,passwordHash:h,shopName};users.push(u);const token=jwt.sign({id:u.id,email,shopName},JWT_SECRET);res.json({success:true,token})});
app.post('/api/login', async (req,res)=>{const {email,password}=req.body;const u=users.find(x=>x.email===email);if(!u)return res.status(404).json({error:'Yok'});const ok=await bcrypt.compare(password,u.passwordHash);if(!ok)return res.status(400).json({error:'Sifre hatali'});const token=jwt.sign({id:u.id,email:u.email,shopName:u.shopName},JWT_SECRET);res.json({success:true,token})});
app.get('/api/connections',auth,(req,res)=>res.json({success:true,data:connections[req.user.id]||[]}));
app.post('/api/connections',auth, async (req,res)=>{
  const {marketplace, apiKey, apiSecret, supplierId} = req.body;
  if(marketplace === 'Trendyol'){
    if(!apiKey || !apiSecret || !supplierId) return res.status(400).json({success:false, error:'Trendyol icin hepsi gerekli'});
    try{
      const authString = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const response = await axios.get(`https://api.trendyol.com/sapigw/suppliers/${supplierId}/products`, {
        headers: { 'Authorization': `Basic ${authString}`, 'User-Agent': `${supplierId} - SelfIntegration` },
        params: { page: 0, size: 1 }
      });
      if(!connections[req.user.id]) connections[req.user.id]=[];
      connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!=='Trendyol');
      connections[req.user.id].push({ marketplace, apiKey, apiSecret, supplierId, status:'Bagli', connectedAt: new Date().toLocaleString('tr-TR') });
      return res.json({success:true, message:'Trendyol baglandi!'});
    }catch(err){
      const msg = err.response?.data?.ExceptionMessage || err.response?.data?.message || err.message;
      return res.status(400).json({success:false, error:'Baglanti basarisiz: ' + msg});
    }
  } else {
    if(!connections[req.user.id]) connections[req.user.id]=[];
    connections[req.user.id] = connections[req.user.id].filter(c=>c.marketplace!==marketplace);
    connections[req.user.id].push({ marketplace, apiKey, status:'Bagli', connectedAt: new Date().toLocaleString('tr-TR') });
    return res.json({success:true});
  }
});
app.get('/api/trendyol/orders', auth, async (req,res)=>{
  const userConns = connections[req.user.id]||[];
  const conn = userConns.find(c=>c.marketplace==='Trendyol');
  if(!conn) return res.status(400).json({error:'Once Trendyol bagla'});
  try{
    const authString = Buffer.from(`${conn.apiKey}:${conn.apiSecret}`).toString('base64');
    const r = await axios.get(`https://api.trendyol.com/sapigw/suppliers/${conn.supplierId}/orders`, {
      headers: { 'Authorization': `Basic ${authString}`, 'User-Agent': `${conn.supplierId} - SelfIntegration` },
      params: { page:0, size:20, orderByDirection:'DESC' }
    });
    res.json({success:true, count: r.data.totalElements, data: r.data.content});
  }catch(e){ res.status(500).json({error: e.message, detail: e.response?.data}); }
});
app.get('/api/products',auth,(req,res)=>res.json({success:true,data:products}));
app.get('/api/orders',auth,(req,res)=>res.json({success:true,data:orders}));
app.post('/api/orders/mock-sell',auth,(req,res)=>{const p=products.find(x=>x.barcode===req.body.barcode);if(p)p.stock--;res.json({success:true})});
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('CALISIYOR PORT:'+PORT));
