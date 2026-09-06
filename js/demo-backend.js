/* ============================================================================
   Demo backend — mimics just enough of the supabase-js v2 query API for
   app.js to run against sample data in the browser, with no server at all.
   Data is kept in localStorage so your test sales/expenses survive reloads.
   Swap this out entirely once js/config.js points at a real Supabase
   project — app.js picks the real client automatically at that point.
   ========================================================================== */

const DEMO_DB_KEY = "maleektech_demo_db_v1";
const DEMO_SESSION_KEY = "maleektech_demo_session_v1";

const DEMO_USERS = [
  { id: "demo-admin", email: "admin@maleektech.com", password: "admin123", full_name: "Amaka Obi", role: "admin", is_active: true, permissions: {} },
  { id: "demo-staff", email: "staff@maleektech.com", password: "staff123", full_name: "Tunde Bello", role: "staff", is_active: true, permissions: { inventory: true, sales: true } },
];

const DEMO_SEED_PRODUCTS = [
  ["001","Type-C Charging Cable","A",1000,2200,20,10,true],
  ["002","Lightning (iPhone) Cable","A",2000,4000,20,10,true],
  ["003","Micro-USB Cable","A",800,2000,20,10,true],
  ["004","Standard Charger (10W)","A",1800,4000,20,8,true],
  ["005","Fast Charger (20W-33W)","A",3500,7500,15,8,true],
  ["006","Tempered Glass Screen Protector","A",500,1500,30,12,true],
  ["007","Silicone / TPU Phone Case","A",1200,3000,25,10,true],
  ["008","OTG Adapter","A",700,1800,20,8,true],
  ["009","USB Car Charger Adapter","A",1200,2800,15,8,true],
  ["010","Power Bank — 10,000mAh (Generic/Budget)","B",6500,12500,12,5,true],
  ["011","Power Bank — 20,000mAh (Itel/Branded)","B",14500,21000,8,4,true],
  ["012","Wired Earphones","B",1500,3500,20,8,true],
  ["013","Wireless Earbuds (TWS, Branded Budget)","B",9500,17000,10,5,true],
  ["014","Bluetooth Speaker (Portable)","B",7000,14000,8,4,true],
  ["015","Smart Watch (Budget/Mid-range)","B",11000,20000,8,4,true],
  ["016","Phone Holder (Car/Desk)","B",1000,2500,15,6,true],
  ["017","Selfie Stick / Mini Tripod","B",2800,6000,10,5,true],
  ["018","Ring Light (LED, Phone Mount)","B",5000,10500,6,3,true],
  ["019","Memory Card (32GB/64GB)","B",3800,7000,15,6,true],
  ["020","Flash Drive (32GB/64GB)","B",3200,6200,15,6,true],
  ["021","Premium Branded Power Bank (30,000mAh+)","C",24000,38000,4,2,true],
  ["022","Premium Wireless Earbuds (Branded)","C",19000,32000,4,2,true],
  ["023","MagSafe Wireless Charger","C",9000,18000,5,2,true],
  ["024","Premium Smart Watch","C",25000,42000,3,2,true],
  ["025","Premium Bluetooth Speaker","C",16000,28000,4,2,true],
  ["026","Laptop Bag / Sleeve","PHASE2",4500,9500,0,5,false],
  ["027","Universal Laptop Charger","PHASE2",6500,13000,0,5,false],
  ["028","Wireless Mouse","PHASE2",3000,6500,0,5,false],
  ["029","Wireless Keyboard","PHASE2",5000,10500,0,5,false],
  ["030","USB-C Hub / Multiport Adapter","PHASE2",5500,11500,0,5,false],
  ["031","Laptop Cooling Pad","PHASE2",7000,14000,0,4,false],
  ["032","External HDD (1TB)","PHASE2",23000,38000,0,3,false],
  ["033","External SSD (256-500GB)","PHASE2",20000,34000,0,3,false],
  ["034","MiFi / Portable WiFi Router","PHASE2",13000,24000,0,3,false],
  ["035","Basic Inkjet Printer","PHASE2",48000,70000,0,2,false],
  ["036","Webcam (HD)","PHASE2",8500,17000,0,4,false],
  ["037","Laptop Stand","PHASE2",4000,8500,0,4,false],
  ["038","HDMI Cable / Adapter","PHASE2",1800,4000,0,8,false],
].map(([code, name, category, purchase_price, selling_price, quantity_in_stock, reorder_threshold, is_active]) => ({
  id: "p_" + code, product_code: code, name, category, purchase_price, selling_price,
  quantity_in_stock, reorder_threshold, is_active, image_url: null,
  get margin_percent() { return this.selling_price ? Number((((this.selling_price - this.purchase_price) / this.selling_price) * 100).toFixed(2)) : 0; },
}));

function demoUid() { return "d_" + Math.random().toString(36).slice(2, 10); }

function seedDemoDb() {
  return {
    products: DEMO_SEED_PRODUCTS.map((p) => ({ ...p, margin_percent: p.margin_percent })),
    profiles: DEMO_USERS.map(({ password, ...rest }) => rest),
    auth_users: DEMO_USERS.map(({ id, email, password }) => ({ id, email, password })),
    expense_categories: ["Rent", "Transport", "Airtime/Data", "Packaging", "Staff Wages", "Utilities", "Marketing", "Miscellaneous"]
      .map((name) => ({ id: demoUid(), name })),
    business_settings: [
      { key: "business_name", value: "Maleektech Mobile Gadgets & Accessories" },
      { key: "currency_symbol", value: "₦" },
    ],
    sales: [],
    sale_items: [],
    expenses: [],
    stock_movements: [],
    notifications: [],
  };
}

function loadDemoDb() {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const fresh = seedDemoDb();
      let changed = false;
      Object.keys(fresh).forEach((key) => {
        if (!(key in parsed)) { parsed[key] = fresh[key]; changed = true; }
      });
      if (changed) saveDemoDb(parsed);
      return parsed;
    }
  } catch (e) { /* fall through to reseed */ }
  const fresh = seedDemoDb();
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(fresh));
  return fresh;
}
function saveDemoDb(db) { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); }
function resetDemoData() { localStorage.removeItem(DEMO_DB_KEY); localStorage.removeItem(DEMO_SESSION_KEY); location.reload(); }
window.resetDemoData = resetDemoData;

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ---------------------------------------------------------------------- */
/* Chainable query builder — mimics the subset of supabase-js used by app.js */
/* ---------------------------------------------------------------------- */
class DemoQuery {
  constructor(db, table) {
    this.db = db; this.table = table;
    this.filters = [];
    this._order = null; this._limit = null;
    this._single = false; this._maybeSingle = false;
    this._insertPayload = null; this._updatePayload = null; this._upsertPayload = null;
  }
  select() { return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  is(col, val) { this.filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val)); return this; }
  gte(col, val) { this.filters.push((r) => String(r[col]) >= String(val)); return this; }
  lte(col, val) { this.filters.push((r) => String(r[col]) <= String(val)); return this; }
  order(col, opts) { this._order = { col, asc: !(opts && opts.ascending === false) }; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }
  insert(payload) { this._insertPayload = payload; return this; }
  update(payload) { this._updatePayload = payload; return this; }
  upsert(payload) { this._upsertPayload = payload; return this; }
  delete() { this._deleteFlag = true; return this; }

  _rows() { return (this.db[this.table] || []).filter((r) => this.filters.every((f) => f(r))); }

  _recomputeMargin(row) {
    if (this.table === "products" && row.selling_price != null) {
      row.margin_percent = row.selling_price ? Number((((row.selling_price - row.purchase_price) / row.selling_price) * 100).toFixed(2)) : 0;
    }
  }

  _run() {
    if (!this.db[this.table]) this.db[this.table] = [];
    if (this._deleteFlag) {
      const matches = this._rows();
      const ids = new Set(matches.map((r) => r.id));
      this.db[this.table] = this.db[this.table].filter((r) => !ids.has(r.id));
      saveDemoDb(this.db);
      return { data: null, error: null };
    }
    if (this._insertPayload) {
      const row = { id: demoUid(), ...this._insertPayload };
      this._recomputeMargin(row);
      this.db[this.table].push(row);
      saveDemoDb(this.db);
      return { data: [row], error: null };
    }
    if (this._upsertPayload) {
      const key = Object.keys(this._upsertPayload)[0];
      const existing = this.db[this.table].find((r) => r[key] === this._upsertPayload[key]);
      if (existing) Object.assign(existing, this._upsertPayload);
      else this.db[this.table].push({ id: demoUid(), ...this._upsertPayload });
      saveDemoDb(this.db);
      return { data: null, error: null };
    }
    if (this._updatePayload) {
      const matches = this._rows();
      matches.forEach((r) => { Object.assign(r, this._updatePayload); this._recomputeMargin(r); });
      saveDemoDb(this.db);
      return { data: matches, error: null };
    }

    let rows = clone(this._rows());
    if (this.table === "sales") {
      rows = rows.map((s) => ({ ...s, sale_items: this.db.sale_items.filter((it) => it.sale_id === s.id) }));
    }
    if (this._order) rows.sort((a, b) => (a[this._order.col] > b[this._order.col] ? 1 : -1) * (this._order.asc ? 1 : -1));
    if (this._limit) rows = rows.slice(0, this._limit);

    if (this._single) return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "Not found" } };
    if (this._maybeSingle) return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }

  then(resolve) { resolve(this._run()); }
}

/* ---------------------------------------------------------------------- */
/* RPC implementations                                                    */
/* ---------------------------------------------------------------------- */
function demoRpc(db, name, params) {
  if (name === "get_products_full") {
    return { data: clone(db.products), error: null };
  }

  if (name === "create_sale") {
    const items = params.p_items || [];
    if (items.length === 0) return { data: null, error: { message: "A sale must have at least one item" } };
    for (const it of items) {
      const product = db.products.find((p) => p.id === it.product_id);
      if (!product) return { data: null, error: { message: "Product not found" } };
      if (product.quantity_in_stock < it.quantity) {
        return { data: null, error: { message: `Only ${product.quantity_in_stock} of ${product.name} in stock.` } };
      }
    }
    const saleId = demoUid();
    const seq = db.sales.length + 1000;
    const invoiceNo = `MTS/INV/${new Date().getFullYear()}/${seq}`;
    const paymentStatus = params.p_payment_status === "pending" ? "pending" : "paid";
    let total = 0;
    const saleItems = items.map((it) => {
      const product = db.products.find((p) => p.id === it.product_id);
      const line_total = it.quantity * it.unit_price;
      total += line_total;
      product.quantity_in_stock -= it.quantity;
      return { id: demoUid(), sale_id: saleId, product_id: it.product_id, quantity: it.quantity, unit_price_at_sale: it.unit_price, unit_cost_at_sale: product.purchase_price, line_total };
    });
    db.sales.push({
      id: saleId, invoice_no: invoiceNo, sale_date: new Date().toISOString(),
      customer_name: params.p_customer_name, customer_phone: params.p_customer_phone, customer_address: params.p_customer_address,
      payment_method: params.p_payment_method, payment_status: paymentStatus, paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
      notes: params.p_notes, total_amount: total, voided_at: null, voided_by: null, void_reason: null,
    });
    db.sale_items.push(...saleItems);
    saveDemoDb(db);
    return { data: saleId, error: null };
  }

  if (name === "mark_sale_paid") {
    const sale = db.sales.find((s) => s.id === params.p_sale_id);
    if (sale && !sale.voided_at) { sale.payment_status = "paid"; sale.paid_at = new Date().toISOString(); saveDemoDb(db); }
    return { data: null, error: null };
  }

  if (name === "void_sale") {
    const sale = db.sales.find((s) => s.id === params.p_sale_id);
    if (!sale || sale.voided_at) return { data: null, error: null };
    sale.voided_at = new Date().toISOString();
    sale.void_reason = params.p_reason;
    db.sale_items.filter((it) => it.sale_id === sale.id).forEach((it) => {
      const product = db.products.find((p) => p.id === it.product_id);
      if (product) product.quantity_in_stock += it.quantity;
    });
    saveDemoDb(db);
    return { data: null, error: null };
  }

  return { data: null, error: { message: `Unknown demo RPC: ${name}` } };
}

/* ---------------------------------------------------------------------- */
/* Also apply the stock_movements side-effect (increase stock on stock-in) */
/* since the demo has no real trigger layer.                              */
/* ---------------------------------------------------------------------- */
function applyStockMovementSideEffect(db, row) {
  const product = db.products.find((p) => p.id === row.product_id);
  if (product) product.quantity_in_stock += row.quantity;
}

/* ---------------------------------------------------------------------- */
/* Public factory                                                         */
/* ---------------------------------------------------------------------- */
function createDemoClient() {
  const db = loadDemoDb();
  const authListeners = [];

  const client = {
    auth: {
      async getSession() {
        try {
          const raw = localStorage.getItem(DEMO_SESSION_KEY);
          if (!raw) return { data: { session: null } };
          return { data: { session: JSON.parse(raw) } };
        } catch (e) { return { data: { session: null } }; }
      },
      onAuthStateChange(cb) { authListeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        const match = (db.auth_users || []).find((u) => u.email === email && u.password === password);
        if (!match) return { data: null, error: { message: "Invalid login credentials" } };
        const session = { user: { id: match.id, email: match.email } };
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
        return { data: { user: session.user }, error: null };
      },
      async updateUser({ email, password }) {
        try {
          const raw = localStorage.getItem(DEMO_SESSION_KEY);
          if (!raw) return { data: null, error: { message: "Not signed in" } };
          const session = JSON.parse(raw);
          const authUser = (db.auth_users || []).find((u) => u.id === session.user.id);
          if (!authUser) return { data: null, error: { message: "Account not found" } };
          if (email) { authUser.email = email; session.user.email = email; }
          if (password) authUser.password = password;
          saveDemoDb(db);
          localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
          return { data: { user: session.user }, error: null };
        } catch (e) { return { data: null, error: { message: "Update failed" } }; }
      },
      async signOut() {
        localStorage.removeItem(DEMO_SESSION_KEY);
        authListeners.forEach((cb) => cb("SIGNED_OUT"));
        return { error: null };
      },
    },
    from(table) {
      const q = new DemoQuery(db, table);
      // intercept insert() on stock_movements to also bump product quantity
      const originalInsert = q.insert.bind(q);
      q.insert = (payload) => {
        if (table === "stock_movements") applyStockMovementSideEffect(db, payload);
        return originalInsert(payload);
      };
      return q;
    },
    async rpc(name, params) { return demoRpc(db, name, params || {}); },
  };
  return client;
}

window.createDemoClient = createDemoClient;
window.DEMO_USERS = DEMO_USERS;
