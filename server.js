require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(process.env.DB_PATH || path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT DEFAULT '', price INTEGER NOT NULL CHECK(price >= 0), unit TEXT NOT NULL DEFAULT 'mètre',
 stock INTEGER NOT NULL DEFAULT 0, image_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '',
 address TEXT DEFAULT '', note TEXT DEFAULT '', total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'Nouvelle commande', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id INTEGER, product_name TEXT NOT NULL, unit TEXT NOT NULL, unit_price INTEGER NOT NULL,
 quantity REAL NOT NULL, line_total INTEGER NOT NULL, details TEXT DEFAULT ''
);
`);

const seedProducts = [
 ["Tôle transparente", "Tôle transparente", "Tôle transparente vendue au mètre. Longueurs possibles : 2 m, 2,50 m et 3 m.", 27000, "mètre", 500],
 ["Galvabac couleur 0,20", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,20.", 14000, "mètre", 500],
 ["Galvabac couleur 0,25", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,25.", 16500, "mètre", 500],
 ["Galvabac couleur 0,30", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,30.", 18400, "mètre", 500],
 ["Galvabac couleur 0,35", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,35.", 24000, "mètre", 500],
 ["Galvabac couleur 0,40", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,40.", 26500, "mètre", 500],
 ["Galvabac couleur 0,50", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,50.", 31000, "mètre", 500],
 ["Galvabac couleur 0,60", "Galvabac couleur", "Fabrication sur mesure – épaisseur 0,60.", 40000, "mètre", 500],
 ["Aluzinc Aluminium 0,18", "Aluzinc Aluminium", "Tôle sur mesure – épaisseur 0,18.", 12000, "mètre", 500],
 ["Aluzinc Aluminium 0,20", "Aluzinc Aluminium", "Tôle sur mesure – épaisseur 0,20.", 12800, "mètre", 500],
 ["Aluzinc Aluminium 0,25", "Aluzinc Aluminium", "Tôle sur mesure – épaisseur 0,25.", 16000, "mètre", 500],
 ["Aluzinc Aluminium 0,30", "Aluzinc Aluminium", "Tôle sur mesure – épaisseur 0,30.", 18000, "mètre", 500],
 ["Aluzinc Aluminium 0,40", "Aluzinc Aluminium", "Tôle sur mesure – épaisseur 0,40.", 26000, "mètre", 500],
 ["Accessoires toiture", "Accessoires", "Accessoires de toiture – prix communiqué.", 500, "pièce", 1000]
];
if (db.prepare("SELECT COUNT(*) n FROM products").get().n === 0) {
  const insert = db.prepare("INSERT INTO products(name,category,description,price,unit,stock) VALUES(?,?,?,?,?,?)");
  const tx = db.transaction(rows => rows.forEach(r => insert.run(...r)));
  tx(seedProducts);
}
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const existing = db.prepare("SELECT id FROM admins WHERE email=?").get(process.env.ADMIN_EMAIL);
  if (!existing) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    db.prepare("INSERT INTO admins(email,password_hash) VALUES(?,?)").run(process.env.ADMIN_EMAIL, hash);
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(session({
  name: "tte.sid", secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
const loginLimiter = rateLimit({ windowMs: 15*60*1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const requireAdmin = (req,res,next) => req.session.admin ? next() : res.status(401).json({error:"Connexion administrateur requise."});
const clean = v => String(v ?? "").trim();
const moneyInt = v => Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null;

app.get("/api/config", (req,res) => res.json({
 brand:"Tsara Tôle Européenne",
 whatsappPrimary:process.env.WHATSAPP_PRIMARY || "261337535347",
 whatsappSecondary:process.env.WHATSAPP_SECONDARY || "261385574790"
}));
app.get("/api/products", (req,res) => {
 const rows = db.prepare("SELECT id,name,category,description,price,unit,stock,image_url FROM products WHERE active=1 ORDER BY category,name").all();
 res.json(rows);
});
app.post("/api/orders", (req,res) => {
 const {customer, items} = req.body || {};
 if (!customer || !clean(customer.name) || !clean(customer.phone) || !Array.isArray(items) || !items.length || items.length > 40)
   return res.status(400).json({error:"Veuillez renseigner votre nom, téléphone et au moins un produit."});
 const getProduct = db.prepare("SELECT id,name,price,unit,stock,active FROM products WHERE id=?");
 const insertOrder = db.prepare("INSERT INTO orders(order_number,customer_name,phone,email,address,note,total) VALUES(?,?,?,?,?,?,?)");
 const insertItem = db.prepare("INSERT INTO order_items(order_id,product_id,product_name,unit,unit_price,quantity,line_total,details) VALUES(?,?,?,?,?,?,?,?)");
 try {
   const result = db.transaction(() => {
     let total = 0, normalized = [];
     for (const item of items) {
       const p = getProduct.get(Number(item.productId));
       const qty = Number(item.quantity);
       if (!p || !p.active || !Number.isFinite(qty) || qty <= 0 || qty > 10000) throw new Error("Produit ou quantité invalide.");
       if (qty > p.stock) throw new Error(`Stock insuffisant pour ${p.name}.`);
       const line = Math.round(p.price * qty);
       total += line;
       normalized.push({p,qty,line,details:clean(item.details).slice(0,250)});
     }
     const orderNo = "TTE-" + Date.now().toString().slice(-8);
     const info = insertOrder.run(orderNo,clean(customer.name).slice(0,100),clean(customer.phone).slice(0,40),clean(customer.email).slice(0,120),clean(customer.address).slice(0,250),clean(customer.note).slice(0,500),total);
     const orderId = Number(info.lastInsertRowid);
     for (const x of normalized) {
       insertItem.run(orderId,x.p.id,x.p.name,x.p.unit,x.p.price,x.qty,x.line,x.details);
       db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(Math.ceil(x.qty),x.p.id);
     }
     return {orderNo,total};
   })();
   res.status(201).json({message:"Commande enregistrée.",...result});
 } catch(e) { res.status(400).json({error:e.message || "Impossible d'enregistrer la commande."}); }
});

app.post("/api/admin/login", loginLimiter, (req,res) => {
 const email=clean(req.body?.email).toLowerCase(), password=String(req.body?.password || "");
 const admin=db.prepare("SELECT * FROM admins WHERE email=?").get(email);
 if(!admin || !bcrypt.compareSync(password,admin.password_hash)) return res.status(401).json({error:"Email ou mot de passe incorrect."});
 req.session.admin={id:admin.id,email:admin.email};
 res.json({email:admin.email});
});
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me", requireAdmin, (req,res)=>res.json(req.session.admin));
app.get("/api/admin/dashboard", requireAdmin, (req,res)=>{
 const sales=db.prepare("SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM orders").get();
 const pending=db.prepare("SELECT COUNT(*) count FROM orders WHERE status='Nouvelle commande'").get().count;
 const products=db.prepare("SELECT COUNT(*) count FROM products WHERE active=1").get().count;
 const recent=db.prepare("SELECT id,order_number,customer_name,phone,total,status,created_at FROM orders ORDER BY id DESC LIMIT 8").all();
 res.json({sales,pending,products,recent});
});
app.get("/api/admin/products", requireAdmin, (req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products", requireAdmin, (req,res)=>{
 const b=req.body||{}, price=moneyInt(b.price), stock=moneyInt(b.stock);
 if(!clean(b.name)||!clean(b.category)||price===null||stock===null||!clean(b.unit))return res.status(400).json({error:"Vérifiez les champs obligatoires."});
 const info=db.prepare("INSERT INTO products(name,category,description,price,unit,stock,image_url,active) VALUES(?,?,?,?,?,?,?,?)").run(clean(b.name),clean(b.category),clean(b.description),price,clean(b.unit),stock,clean(b.image_url),b.active===false?0:1);
 res.status(201).json({id:info.lastInsertRowid});
});
app.put("/api/admin/products/:id", requireAdmin, (req,res)=>{
 const b=req.body||{}, price=moneyInt(b.price), stock=moneyInt(b.stock);
 if(!clean(b.name)||!clean(b.category)||price===null||stock===null||!clean(b.unit))return res.status(400).json({error:"Vérifiez les champs obligatoires."});
 const info=db.prepare("UPDATE products SET name=?,category=?,description=?,price=?,unit=?,stock=?,image_url=?,active=? WHERE id=?").run(clean(b.name),clean(b.category),clean(b.description),price,clean(b.unit),stock,clean(b.image_url),b.active===false?0:1,Number(req.params.id));
 if(!info.changes)return res.status(404).json({error:"Produit introuvable."});
 res.json({ok:true});
});
app.delete("/api/admin/products/:id", requireAdmin, (req,res)=>{
 db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id));res.json({ok:true});
});
app.get("/api/admin/orders", requireAdmin, (req,res)=>{
 const orders=db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all();
 const getItems=db.prepare("SELECT * FROM order_items WHERE order_id=?");
 res.json(orders.map(o=>({...o,items:getItems.all(o.id)})));
});
app.patch("/api/admin/orders/:id", requireAdmin, (req,res)=>{
 const allowed=["Nouvelle commande","Confirmée","En préparation","Prête","Livrée","Annulée"];
 const status=clean(req.body?.status);if(!allowed.includes(status))return res.status(400).json({error:"Statut invalide."});
 const info=db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,Number(req.params.id));
 if(!info.changes)return res.status(404).json({error:"Commande introuvable."});res.json({ok:true});
});

app.use(express.static(path.join(__dirname,"public")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Tsara Tôle Européenne running on port ${PORT}`));
