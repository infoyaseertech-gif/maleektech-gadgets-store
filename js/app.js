/* ============================================================================
   Maleektech Business System — application logic
   Talks to Supabase using the schema in maleektech_schema.sql.
   ========================================================================== */

const DEMO_MODE = typeof SUPABASE_URL === "undefined" || !SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF");
const sb = DEMO_MODE ? window.createDemoClient() : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_LABEL = { A: "Essential fast-movers", B: "Profitable gadgets", C: "Premium line", PHASE2: "Expansion (Phase 2)" };

// Defaults — overwritten at load time from the business_settings table
// (Settings → Business profile), so none of this needs a code change again.
const BUSINESS_INFO = {
  legalName: "MALEEKTECH SERVICES LTD",
  tagline: "ICT Training & Consultancy",
  address: "7 Dariqa Central Mosque, Sokoto Road, Opp. First Bank, Funtua, Katsina State",
  phones: "+234 803 1836 295 | +234 808 4478 856",
  email: "aamaleektech@gmail.com",
  tin: "31509385-0001",
  rc: "1967471",
  bankLine: "MALEEKTECH SERVICES LTD (Guaranty Trust Bank) 0799455316",
};
const BUSINESS_INFO_KEY_MAP = {
  legal_name: "legalName", tagline: "tagline", address: "address", phones: "phones",
  email: "email", tin: "tin", rc: "rc", bank_line: "bankLine",
};

// Sections a non-admin account can be granted access to. Admins always see
// everything and are never limited by this list. A brand-new staff account
// starts with none of these granted — the owner decides what to add.
const PERMISSION_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "dashboard_financials", label: "Dashboard — revenue, expenses & profit figures" },
  { key: "inventory", label: "Inventory" },
  { key: "sales", label: "Sales (record & history)" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

function hasPermission(key) {
  if (isAdmin()) return true;
  return !!(state.profile && state.profile.permissions && state.profile.permissions[key]);
}

/* ---------------------------------------------------------------------- */
/* Toasts — immediate on-screen alerts (in addition to the Notifications  */
/* tab, which keeps a permanent history)                                 */
/* ---------------------------------------------------------------------- */
function showToast(message, kind = "info") {
  const root = $("#toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind === "warning" ? " warning" : kind === "danger" ? " danger" : "");
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 4200);
}

/* ---------------------------------------------------------------------- */
/* Notifications — persistent activity feed                              */
/* ---------------------------------------------------------------------- */
async function logNotification(scope, message) {
  try {
    await sb.from("notifications").insert({ scope, message, created_by: state.profile ? state.profile.id : null });
  } catch (e) { /* non-critical — never block the action that triggered it */ }
  if (state.currentView === "notifications") loadNotifications();
  else refreshNotifBadgeCount();
}

function notifSeenKey() { return `maleektech_notif_seen_${state.profile ? state.profile.id : "anon"}`; }

function visibleNotificationScopes() {
  const scopes = ["general"];
  if (isAdmin() || hasPermission("inventory")) scopes.push("inventory");
  if (isAdmin() || hasPermission("sales")) scopes.push("sales");
  if (isAdmin()) scopes.push("expenses", "settings");
  return scopes;
}

async function loadNotifications() {
  const { data, error } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return;
  const scopes = visibleNotificationScopes();
  const visible = (data || []).filter((n) => scopes.includes(n.scope));

  localStorage.setItem(notifSeenKey(), new Date().toISOString());
  refreshNotifBadgeCount();

  const dotClass = (n) => {
    if (n.scope === "expenses") return "expenses";
    if (n.scope === "settings") return "settings";
    if (n.scope === "inventory" && /out of stock/i.test(n.message)) return "inventory-out";
    if (n.scope === "inventory" && /low stock/i.test(n.message)) return "inventory-warn";
    return "";
  };
  const timeAgo = (iso) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  $("#notifications-list").innerHTML = visible.length ? visible.map((n) => `
    <div class="notif-row">
      <div class="notif-dot ${dotClass(n)}"></div>
      <div>
        <div class="notif-text">${escapeHtml(n.message)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join("") : `<div class="card-pad muted" style="font-size:13.5px;">No notifications yet — they'll show up here as sales, stock changes, and other activity happen.</div>`;
}

async function refreshNotifBadgeCount() {
  const badge = $("#notif-badge");
  if (!badge) return;
  const lastSeen = localStorage.getItem(notifSeenKey());
  const { data, error } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return;
  const scopes = visibleNotificationScopes();
  const visible = (data || []).filter((n) => scopes.includes(n.scope));
  const unread = lastSeen ? visible.filter((n) => n.created_at > lastSeen).length : visible.length;
  if (unread > 0) { badge.textContent = unread > 99 ? "99+" : String(unread); badge.classList.remove("hidden"); }
  else { badge.classList.add("hidden"); }
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const naira = (n) => "₦" + Math.round(n || 0).toLocaleString("en-US");
const pctFmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "0.0") + "%";
const todayStr = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };

const state = {
  profile: null,       // { id, email, full_name, role, is_active }
  products: [],         // cached product rows (full or staff-view depending on role)
  expenseCategories: [],
  businessName: "Maleektech Mobile Gadgets & Accessories",
  currentView: "dashboard",
};

function isAdmin() { return state.profile && state.profile.role === "admin"; }

/* ---------------------------------------------------------------------- */
/* Boot / auth                                                            */
/* ---------------------------------------------------------------------- */
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await handleSignedIn(session.user);
  } else {
    showLogin();
  }
  $("#loading-screen").classList.add("hidden");

  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      state.profile = null;
      showLogin();
    }
  });
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app-shell").classList.add("hidden");
}

async function handleSignedIn(user) {
  const { data: profile, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error || !profile) {
    loginError("Your account isn't set up yet. Ask an admin to add you under Settings → Staff accounts.");
    await sb.auth.signOut();
    return;
  }
  if (!profile.is_active) {
    loginError("Your account has been deactivated. Contact the business owner.");
    await sb.auth.signOut();
    return;
  }
  state.profile = profile;
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  $("#user-name-text").textContent = profile.full_name || profile.email;
  $("#user-role").textContent = profile.role;

  applyPermissionsToNav();

  await Promise.all([loadProducts(), loadExpenseCategories(), loadBusinessName()]);
  refreshNotifBadgeCount();

  const order = ["dashboard", "inventory", "sales", "expenses", "reports", "settings"];
  const allowed = order.filter((v) => isAdmin() || hasPermission(v));
  if (allowed.length === 0) {
    setView("notifications");
  } else {
    setView(allowed.includes("dashboard") ? "dashboard" : allowed[0]);
  }
}

function applyPermissionsToNav() {
  $$("#nav button[data-view]").forEach((btn) => {
    const visible = btn.dataset.view === "notifications" || isAdmin() || hasPermission(btn.dataset.view);
    btn.style.display = visible ? "" : "none";
  });
  // Elements marked admin-only (e.g. "Add product") stay admin-exclusive
  // regardless of any granted permission — editing/deleting is never
  // delegated, only viewing specific sections is.
  $$("[data-admin-only]").forEach((el) => { el.style.display = isAdmin() ? "" : "none"; });
}

function showNoAccessScreen() {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#main").insertAdjacentHTML("beforeend", `
    <div id="no-access-view" class="card card-pad" style="max-width:480px;margin:60px auto;text-align:center;">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">No access granted yet</div>
      <p class="muted" style="font-size:13.5px;">Your account is active, but the admin hasn't given you access to
      any part of the system yet. Ask them to open Settings → Staff accounts and grant you access.</p>
    </div>`);
}

function loginError(msg) {
  const el = $("#login-error");
  el.textContent = msg;
  el.classList.add("show");
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").classList.remove("show");
  $("#login-submit").disabled = true;
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  $("#login-submit").disabled = false;
  if (error) { loginError("Incorrect email or password."); return; }
  await handleSignedIn(data.user);
});

$("#sign-out-btn").addEventListener("click", async () => { await sb.auth.signOut(); });

/* ---------------------------------------------------------------------- */
/* My Account — self-service name/email/password, available to everyone   */
/* ---------------------------------------------------------------------- */
function openMyAccountModal() {
  const p = state.profile;
  openModal("My account", `
    <div class="field" style="margin-bottom:10px;"><label>Full name</label><input id="acct-name" value="${escapeHtml(p.full_name || "")}" /></div>
    <div class="field" style="margin-bottom:10px;"><label>Email</label><input id="acct-email" type="email" value="${escapeHtml(p.email || "")}" /></div>
    <div class="field" style="margin-bottom:10px;"><label>New password (leave blank to keep current)</label><input id="acct-password" type="password" placeholder="••••••••" /></div>
    <div class="field"><label>Confirm new password</label><input id="acct-password-confirm" type="password" placeholder="••••••••" /></div>
    <div id="acct-error" class="error-text hidden"></div>
    <p class="muted" style="font-size:11.5px;margin-top:10px;">${DEMO_MODE ? "Demo mode: changes are saved locally in this browser." : "Changing your email may require confirming it via a link Supabase sends, depending on your project's auth settings."}</p>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="acct-submit">Save changes</button></div>
  `, () => {
    $("#acct-submit").addEventListener("click", async () => {
      const errEl = $("#acct-error");
      errEl.classList.add("hidden");
      const newName = $("#acct-name").value.trim();
      const newEmail = $("#acct-email").value.trim();
      const pw1 = $("#acct-password").value, pw2 = $("#acct-password-confirm").value;
      if (!newName || !newEmail) { errEl.textContent = "Name and email can't be empty."; errEl.classList.remove("hidden"); return; }
      if (pw1 || pw2) {
        if (pw1.length < 6) { errEl.textContent = "New password must be at least 6 characters."; errEl.classList.remove("hidden"); return; }
        if (pw1 !== pw2) { errEl.textContent = "Passwords don't match."; errEl.classList.remove("hidden"); return; }
      }

      $("#acct-submit").disabled = true;
      const authUpdates = {};
      if (newEmail !== p.email) authUpdates.email = newEmail;
      if (pw1) authUpdates.password = pw1;

      if (Object.keys(authUpdates).length > 0) {
        const { error: authErr } = await sb.auth.updateUser(authUpdates);
        if (authErr) { showModalError("acct-error", authErr.message); $("#acct-submit").disabled = false; return; }
      }
      const { error: profErr } = await sb.from("profiles").update({ full_name: newName, email: newEmail }).eq("id", p.id);
      $("#acct-submit").disabled = false;
      if (profErr) { showModalError("acct-error", profErr.message); return; }

      state.profile.full_name = newName;
      state.profile.email = newEmail;
      $("#user-name-text").textContent = newName;
      closeModal();
      showToast("Account updated.");
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Navigation                                                             */
/* ---------------------------------------------------------------------- */
$("#nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  if (!isAdmin() && btn.dataset.view !== "notifications" && !hasPermission(btn.dataset.view)) return;
  setView(btn.dataset.view);
});

function setView(view) {
  if (!isAdmin() && view !== "notifications" && !hasPermission(view)) return;
  const noAccess = $("#no-access-view");
  if (noAccess) noAccess.remove();
  state.currentView = view;
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "dashboard") renderDashboard();
  if (view === "inventory") renderInventory();
  if (view === "sales") { renderProductPicker(""); renderPosCart(); loadSalesHistory(); }
  if (view === "expenses") loadExpenses();
  if (view === "reports") loadReports();
  if (view === "notifications") loadNotifications();
  if (view === "settings") renderSettings();
}

/* ---------------------------------------------------------------------- */
/* Data loading                                                           */
/* ---------------------------------------------------------------------- */
async function loadProducts() {
  if (isAdmin()) {
    const { data, error } = await sb.rpc("get_products_full");
    if (!error) state.products = data || [];
  } else {
    const { data, error } = await sb.from("products_staff_view").select("*");
    if (!error) state.products = data || [];
  }
}

async function loadExpenseCategories() {
  const { data, error } = await sb.from("expense_categories").select("*").order("name");
  if (!error) state.expenseCategories = data || [];
}

async function loadBusinessName() {
  const { data, error } = await sb.from("business_settings").select("*");
  if (error || !data) return;
  data.forEach((row) => {
    if (row.key === "business_name") state.businessName = row.value;
    if (BUSINESS_INFO_KEY_MAP[row.key]) BUSINESS_INFO[BUSINESS_INFO_KEY_MAP[row.key]] = row.value;
  });
  $("#brand-name").innerHTML = `${escapeHtml(state.businessName.split(" ")[0])}<small>${escapeHtml(state.businessName.split(" ").slice(1).join(" "))}</small>`;
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */
let activityChart = null;
let activityPeriod = "daily";
let activityDataCache = null;

async function renderDashboard() {
  const now = new Date();
  $("#dashboard-date").textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 29); thirtyDaysAgo.setHours(0, 0, 0, 0);

  const { data: sales } = await sb.from("sales").select("*, sale_items(*)").is("voided_at", null).gte("sale_date", thirtyDaysAgo.toISOString());
  const liveSales = sales || [];

  const today = todayStr();
  const todaySales = liveSales.filter((s) => s.sale_date.slice(0, 10) === today);
  const monthSales = liveSales.filter((s) => s.sale_date >= monthStart);
  const monthRevenue = monthSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const todayTotal = todaySales.reduce((a, s) => a + Number(s.total_amount), 0);

  let statsHtml = `
    <div class="stat-card"><div class="stat-label">Today's sales</div><div class="stat-value">${naira(todayTotal)}</div><div class="stat-sub">${todaySales.length} sale${todaySales.length === 1 ? "" : "s"}</div></div>
    <div class="stat-card"><div class="stat-label">This month's revenue</div><div class="stat-value">${naira(monthRevenue)}</div></div>`;

  if (isAdmin() || hasPermission("dashboard_financials")) {
    const { data: expenses } = await sb.from("expenses").select("*").is("voided_at", null).gte("expense_date", monthStart.slice(0, 10));
    const monthCOGS = monthSales.reduce((a, s) => a + s.sale_items.reduce((b, it) => b + Number(it.unit_cost_at_sale) * it.quantity, 0), 0);
    const monthExpenseTotal = (expenses || []).reduce((a, e) => a + Number(e.amount), 0);
    const monthNetProfit = monthRevenue - monthCOGS - monthExpenseTotal;
    statsHtml += `
      <div class="stat-card"><div class="stat-label">This month's expenses</div><div class="stat-value">${naira(monthExpenseTotal)}</div></div>
      <div class="stat-card"><div class="stat-label">This month's net profit</div><div class="stat-value ${monthNetProfit >= 0 ? "up" : "down"}">${naira(monthNetProfit)}</div></div>`;
  }

  const lowStock = state.products.filter((p) => p.is_active && p.quantity_in_stock <= p.reorder_threshold);
  statsHtml += `<div class="stat-card"><div class="stat-label">Low-stock alerts</div><div class="stat-value ${lowStock.length ? "down" : ""}">${lowStock.length}</div></div>`;
  $("#dashboard-stats").innerHTML = statsHtml;

  activityDataCache = null;
  await renderActivityChart(activityPeriod);

  if (lowStock.length) {
    $("#low-stock-alert").innerHTML = `
      <div class="alert-warning">
        <div class="head"><i data-lucide="alert-triangle" width="16" height="16"></i> Low stock — reorder soon</div>
        <div class="items">${lowStock.map((p) => `<span>${escapeHtml(p.product_code)} · ${escapeHtml(p.name)} (${p.quantity_in_stock} left)</span>`).join("")}</div>
      </div>`;
  } else {
    $("#low-stock-alert").innerHTML = "";
  }
  refreshIcons();
}

async function loadActivityData() {
  if (activityDataCache) return activityDataCache;
  const showExpenses = isAdmin() || hasPermission("dashboard_financials");
  const [salesRes, expensesRes] = await Promise.all([
    sb.from("sales").select("sale_date, total_amount").is("voided_at", null).order("sale_date", { ascending: true }).limit(5000),
    showExpenses
      ? sb.from("expenses").select("expense_date, amount").is("voided_at", null).order("expense_date", { ascending: true }).limit(5000)
      : Promise.resolve({ data: [] }),
  ]);
  activityDataCache = { sales: salesRes.data || [], expenses: expensesRes.data || [] };
  return activityDataCache;
}

// Groups rows into labeled buckets (daily/weekly/monthly/annually) and sums
// valueField within each bucket — shared by both the Sales and Expenses series.
function bucketActivity(rows, dateField, valueField, period) {
  const now = new Date();
  const buckets = [];

  if (period === "daily") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      buckets.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) });
    }
  } else if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now); end.setDate(now.getDate() - i * 7);
      const start = new Date(end); start.setDate(end.getDate() - 6);
      buckets.push({ start, end, label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) });
    }
  } else if (period === "monthly") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) });
    }
  } else {
    let minYear = now.getFullYear();
    rows.forEach((r) => { const y = new Date(r[dateField]).getFullYear(); if (y < minYear) minYear = y; });
    minYear = Math.max(minYear, now.getFullYear() - 5);
    for (let y = minYear; y <= now.getFullYear(); y++) buckets.push({ year: y, label: String(y) });
  }

  const sums = buckets.map(() => 0);
  rows.forEach((r) => {
    const d = new Date(r[dateField]);
    const val = Number(r[valueField]) || 0;
    let idx = -1;
    if (period === "daily") idx = buckets.findIndex((b) => b.key === d.toISOString().slice(0, 10));
    else if (period === "weekly") idx = buckets.findIndex((b) => d >= b.start && d < new Date(b.end.getTime() + 86400000));
    else if (period === "monthly") idx = buckets.findIndex((b) => b.year === d.getFullYear() && b.month === d.getMonth());
    else idx = buckets.findIndex((b) => b.year === d.getFullYear());
    if (idx !== -1) sums[idx] += val;
  });
  return { labels: buckets.map((b) => b.label), values: sums };
}

async function renderActivityChart(period) {
  activityPeriod = period;
  $$("#activity-period-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.period === period));
  const { sales, expenses } = await loadActivityData();
  const showExpenses = isAdmin() || hasPermission("dashboard_financials");
  $("#activity-expense-note").style.display = showExpenses ? "" : "none";

  const salesBucket = bucketActivity(sales, "sale_date", "total_amount", period);
  const datasets = [{ label: "Sales", data: salesBucket.values, backgroundColor: "#0E7C3A", borderRadius: 4 }];
  if (showExpenses) {
    const expenseBucket = bucketActivity(expenses, "expense_date", "amount", period);
    datasets.push({ label: "Expenses", data: expenseBucket.values, backgroundColor: "#B8760A", borderRadius: 4 });
  }

  const ctx = $("#activity-chart");
  if (activityChart) activityChart.destroy();
  activityChart = new Chart(ctx, {
    type: "bar",
    data: { labels: salesBucket.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: showExpenses, position: "top", align: "end", labels: { boxWidth: 12, font: { size: 11.5 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${naira(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10.5 } } }, y: { ticks: { callback: (v) => "₦" + (v >= 1000 ? (v / 1000) + "k" : v) } } },
    },
  });
  refreshIcons();
}

$("#activity-period-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-period]");
  if (!btn) return;
  renderActivityChart(btn.dataset.period);
});

/* ---------------------------------------------------------------------- */
/* Inventory                                                              */
/* ---------------------------------------------------------------------- */
function marginOf(p) { return p.margin_percent != null ? Number(p.margin_percent) : (p.selling_price ? ((p.selling_price - p.purchase_price) / p.selling_price) * 100 : 0); }

function renderInventory() {
  $("#inventory-head").innerHTML = `
    <th>Photo</th><th>ID</th><th>Product</th><th>Category</th>
    ${isAdmin() ? '<th class="right">Cost</th>' : ""}
    <th class="right">Price</th>
    ${isAdmin() ? '<th class="right">Margin</th>' : ""}
    <th class="right">Stock</th><th class="right">Actions</th>`;
  drawInventoryRows();
  refreshIcons();
}

function productThumb(p) {
  if (p.image_url) return `<img src="${p.image_url}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" />`;
  return `<div style="width:36px;height:36px;border-radius:6px;background:var(--tint);display:flex;align-items:center;justify-content:center;color:var(--primary-dark);"><i data-lucide="image" width="16" height="16"></i></div>`;
}

function drawInventoryRows() {
  const q = $("#inventory-search").value.trim().toLowerCase();
  const cat = $("#inventory-category-filter").value;
  const rows = state.products.filter((p) => {
    if (cat !== "ALL" && p.category !== cat) return false;
    if (q && !(p.name.toLowerCase().includes(q) || p.product_code.includes(q))) return false;
    return true;
  });
  $("#inventory-count").textContent = `${rows.length} of ${state.products.length} products`;

  $("#inventory-body").innerHTML = rows.map((p) => {
    const low = p.quantity_in_stock <= p.reorder_threshold;
    return `<tr style="opacity:${p.is_active ? 1 : 0.5}">
      <td>${productThumb(p)}</td>
      <td class="mono">${escapeHtml(p.product_code)}</td>
      <td>${escapeHtml(p.name)}${!p.is_active ? ' <span style="font-size:11px;color:var(--ink-soft)">(inactive)</span>' : ""}</td>
      <td>${CATEGORY_LABEL[p.category] || p.category}</td>
      ${isAdmin() ? `<td class="right mono">${naira(p.purchase_price)}</td>` : ""}
      <td class="right mono">${naira(p.selling_price)}</td>
      ${isAdmin() ? `<td class="right mono">${pctFmt(marginOf(p))}</td>` : ""}
      <td class="right"><span class="badge ${low ? "low" : ""}">${p.quantity_in_stock}</span></td>
      <td class="right">
        <button class="btn btn-outline" style="padding:5px 9px;" onclick="openStockInModal('${p.id}')">Stock in</button>
        ${isAdmin() ? `<button class="btn" style="padding:5px 7px;" onclick="openProductEditModal('${p.id}')"><i data-lucide="pencil" width="14" height="14"></i></button>` : ""}
      </td>
    </tr>`;
  }).join("") || `<tr class="empty-row"><td colspan="9">No products match.</td></tr>`;
  refreshIcons();
}

$("#inventory-search").addEventListener("input", drawInventoryRows);
$("#inventory-category-filter").addEventListener("change", drawInventoryRows);

function openModal(title, bodyHtml, onMount) {
  $("#modal-root").innerHTML = `
    <div class="modal-backdrop" id="active-modal-backdrop">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-head"><h3>${title}</h3><button onclick="closeModal()"><i data-lucide="x" width="18" height="18"></i></button></div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  $("#active-modal-backdrop").addEventListener("click", closeModal);
  refreshIcons();
  if (onMount) onMount();
}
function closeModal() { $("#modal-root").innerHTML = ""; }

function openStockInModal(productId) {
  const p = state.products.find((x) => x.id === productId);
  openModal(`Stock in — ${escapeHtml(p.name)}`, `
    <div class="form-grid">
      <div class="field"><label>Quantity received</label><input type="number" min="1" id="si-qty" value="1" /></div>
      <div class="field"><label>Cost per unit (₦)</label><input type="number" min="0" id="si-cost" value="${p.purchase_price}" /></div>
      <div class="field"><label>Supplier (optional)</label><input id="si-supplier" /></div>
      <div class="field"><label>Date</label><input type="date" id="si-date" value="${todayStr()}" /></div>
    </div>
    <div id="si-error" class="error-text hidden"></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="si-submit">Record stock-in</button></div>
  `, () => {
    $("#si-submit").addEventListener("click", async () => {
      const qty = +$("#si-qty").value, unit_cost = +$("#si-cost").value, supplier = $("#si-supplier").value, date = $("#si-date").value;
      if (!qty || qty <= 0) { showModalError("si-error", "Enter a quantity greater than zero."); return; }
      const { error } = await sb.from("stock_movements").insert({ product_id: p.id, quantity: qty, unit_cost, supplier, movement_date: date, created_by: state.profile.id });
      if (error) { showModalError("si-error", error.message); return; }
      closeModal();
      await loadProducts(); drawInventoryRows(); renderDashboard();
      const updated = state.products.find((x) => x.id === p.id);
      const newQty = updated ? updated.quantity_in_stock : p.quantity_in_stock + qty;
      logNotification("inventory", `Restocked ${qty} × ${p.name} (${p.product_code}) — now ${newQty} in stock`);
      showToast(`Stock updated: ${p.name} now has ${newQty} in stock.`);
    });
  });
}

function openProductEditModal(productId) {
  const existing = productId ? state.products.find((x) => x.id === productId) : null;
  const p = existing || { product_code: "", name: "", category: "A", purchase_price: 0, selling_price: 0, quantity_in_stock: 0, reorder_threshold: 5, is_active: true, image_url: "" };
  openModal(existing ? `Edit — ${escapeHtml(p.name)}` : "Add product", `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;">
      <div id="pe-photo-preview">${p.image_url ? `<img src="${p.image_url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />` : `<div style="width:64px;height:64px;border-radius:8px;background:var(--tint);display:flex;align-items:center;justify-content:center;color:var(--primary-dark);"><i data-lucide="image" width="22" height="22"></i></div>`}</div>
      <div class="field" style="flex:1;">
        <label>Product photo</label>
        <input type="file" id="pe-photo-input" accept="image/*" />
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Product ID / code</label><input id="pe-code" value="${escapeHtml(p.product_code)}" ${existing ? "disabled" : ""} /></div>
      <div class="field"><label>Category</label>
        <select id="pe-category">
          <option value="A" ${p.category === "A" ? "selected" : ""}>A — Essential fast-movers</option>
          <option value="B" ${p.category === "B" ? "selected" : ""}>B — Profitable gadgets</option>
          <option value="C" ${p.category === "C" ? "selected" : ""}>C — Premium line</option>
          <option value="PHASE2" ${p.category === "PHASE2" ? "selected" : ""}>Phase 2 — Expansion</option>
        </select>
      </div>
      <div class="field" style="grid-column:span 2;"><label>Name</label><input id="pe-name" value="${escapeHtml(p.name)}" /></div>
      <div class="field"><label>Purchase price (₦)</label><input type="number" id="pe-purchase" value="${p.purchase_price}" /></div>
      <div class="field"><label>Selling price (₦)</label><input type="number" id="pe-selling" value="${p.selling_price}" /></div>
      <div class="field"><label>Quantity in stock</label><input type="number" id="pe-qty" value="${p.quantity_in_stock}" /></div>
      <div class="field"><label>Reorder threshold</label><input type="number" id="pe-threshold" value="${p.reorder_threshold}" /></div>
      <div class="field"><label>Status</label>
        <select id="pe-active"><option value="1" ${p.is_active ? "selected" : ""}>Active</option><option value="0" ${!p.is_active ? "selected" : ""}>Inactive / discontinued</option></select>
      </div>
    </div>
    <div id="pe-error" class="error-text hidden"></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="pe-submit">Save product</button></div>
  `, () => {
    let pendingImageUrl = p.image_url || "";
    $("#pe-photo-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        pendingImageUrl = reader.result; // data URL preview immediately; uploaded properly on save if live mode
        $("#pe-photo-preview").innerHTML = `<img src="${pendingImageUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />`;
      };
      reader.readAsDataURL(file);
    });

    $("#pe-submit").addEventListener("click", async () => {
      const code = $("#pe-code").value.trim(), name = $("#pe-name").value.trim();
      if (!code || !name) { showModalError("pe-error", "Product ID and name are required."); return; }
      $("#pe-submit").disabled = true;

      let imageUrl = pendingImageUrl;
      const file = $("#pe-photo-input").files[0];
      if (file && !DEMO_MODE) {
        const path = `${code}-${Date.now()}.${file.name.split(".").pop()}`;
        const { error: upErr } = await sb.storage.from("product-images").upload(path, file, { upsert: true });
        if (upErr) { showModalError("pe-error", "Photo upload failed: " + upErr.message); $("#pe-submit").disabled = false; return; }
        imageUrl = sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        product_code: code, name, category: $("#pe-category").value,
        purchase_price: +$("#pe-purchase").value, selling_price: +$("#pe-selling").value,
        quantity_in_stock: +$("#pe-qty").value, reorder_threshold: +$("#pe-threshold").value,
        is_active: $("#pe-active").value === "1", image_url: imageUrl || null,
      };
      const query = existing ? sb.from("products").update(payload).eq("id", existing.id) : sb.from("products").insert(payload);
      const { error } = await query;
      $("#pe-submit").disabled = false;
      if (error) { showModalError("pe-error", error.message); return; }
      closeModal();
      await loadProducts(); drawInventoryRows(); renderDashboard();
      if (!existing) {
        logNotification("inventory", `New product added: ${name} (${code})`);
        showToast(`Added "${name}" to the catalog.`);
      }
    });
  });
}

function showModalError(id, msg) { const el = $("#" + id); el.textContent = msg; el.classList.remove("hidden"); }

$("#add-product-btn").addEventListener("click", () => openProductEditModal(null));

/* ---------------------------------------------------------------------- */
/* Sales (POS)                                                            */
/* ---------------------------------------------------------------------- */
let cart = [];

$("#pos-search-input").addEventListener("input", (e) => renderProductPicker(e.target.value));

function renderProductPicker(filterText) {
  const box = $("#pos-product-list");
  if (!box) return;
  const q = (filterText !== undefined ? filterText : $("#pos-search-input").value).trim().toLowerCase();
  const list = state.products
    .filter((p) => p.is_active && (!q || p.name.toLowerCase().includes(q) || p.product_code.includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (list.length === 0) { box.innerHTML = `<div class="row disabled">No matching products.</div>`; return; }

  box.innerHTML = list.map((p) => {
    const out = p.quantity_in_stock <= 0;
    const low = !out && p.quantity_in_stock <= p.reorder_threshold;
    const stockLabel = out
      ? `<span class="stock-note out">Out of stock</span>`
      : low
        ? `<span class="stock-note low">${p.quantity_in_stock} left</span>`
        : `<span class="stock-note muted">${p.quantity_in_stock} available</span>`;
    return `<div class="row ${out ? "disabled" : ""}" ${out ? "" : `onclick="addToCart('${p.id}')"`}>
      <span class="name">${productThumb(p)}<span class="mono" style="color:var(--ink-soft);">${escapeHtml(p.product_code)}</span>${escapeHtml(p.name)}</span>
      <span style="display:flex;align-items:center;gap:10px;">${stockLabel}<span class="mono">${naira(p.selling_price)}</span></span>
    </div>`;
  }).join("");
  refreshIcons();
}

function addToCart(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p || p.quantity_in_stock <= 0) return;
  const existing = cart.find((i) => i.productId === productId);
  if (existing) {
    if (existing.qty < p.quantity_in_stock) existing.qty += 1;
  } else {
    cart.push({ productId, code: p.product_code, name: p.name, qty: 1, unitPrice: p.selling_price, maxQty: p.quantity_in_stock });
  }
  renderPosCart();
}
function updateCartLine(productId, field, value) {
  const line = cart.find((i) => i.productId === productId);
  if (line) line[field] = value;
  renderPosCart();
}
function removeCartLine(productId) { cart = cart.filter((i) => i.productId !== productId); renderPosCart(); }

function renderPosCart() {
  const body = $("#cart-body");
  if (cart.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No items yet — click a product on the left to add it.</td></tr>`;
  } else {
    body.innerHTML = cart.map((i) => `
      <tr>
        <td>${escapeHtml(i.name)}${i.qty >= i.maxQty ? ' <span style="font-size:11px;color:var(--amber);">(last in stock)</span>' : ""}</td>
        <td class="right"><input type="number" min="1" max="${i.maxQty}" value="${i.qty}" class="qty-input" onchange="updateCartLine('${i.productId}','qty',+this.value)" /></td>
        <td class="right"><input type="number" min="0" value="${i.unitPrice}" class="price-input" onchange="updateCartLine('${i.productId}','unitPrice',+this.value)" /></td>
        <td class="right mono">${naira(i.qty * i.unitPrice)}</td>
        <td class="right"><button class="remove-line" onclick="removeCartLine('${i.productId}')"><i data-lucide="x" width="15" height="15"></i></button></td>
      </tr>`).join("");
  }
  const total = cart.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  $("#pos-total").textContent = naira(total);
  refreshIcons();
}

$("#pos-submit").addEventListener("click", async () => {
  const errEl = $("#pos-error");
  errEl.classList.add("hidden");
  if (cart.length === 0) { errEl.textContent = "Add at least one item to the cart."; errEl.classList.remove("hidden"); return; }
  for (const i of cart) {
    if (i.qty <= 0) { errEl.textContent = `Quantity for ${i.name} must be at least 1.`; errEl.classList.remove("hidden"); return; }
    if (i.qty > i.maxQty) { errEl.textContent = `Only ${i.maxQty} of ${i.name} in stock.`; errEl.classList.remove("hidden"); return; }
  }
  $("#pos-submit").disabled = true;
  const soldSnapshot = cart.map((i) => ({ productId: i.productId, name: i.name, code: i.code, qty: i.qty }));
  const isPaidNow = $("#pos-paid-now").checked;
  const total = cart.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const { data: saleId, error } = await sb.rpc("create_sale", {
    p_customer_name: $("#pos-customer-name").value || null,
    p_customer_phone: $("#pos-customer-phone").value || null,
    p_customer_address: $("#pos-customer-address").value || null,
    p_payment_method: $("#pos-payment-method").value,
    p_payment_status: isPaidNow ? "paid" : "pending",
    p_notes: $("#pos-notes").value || null,
    p_items: cart.map((i) => ({ product_id: i.productId, quantity: i.qty, unit_price: i.unitPrice })),
  });
  $("#pos-submit").disabled = false;
  if (error) { errEl.textContent = error.message; errEl.classList.remove("hidden"); return; }
  cart = [];
  $("#pos-customer-name").value = ""; $("#pos-customer-phone").value = ""; $("#pos-customer-address").value = "";
  $("#pos-notes").value = ""; $("#pos-payment-method").value = "cash"; $("#pos-paid-now").checked = true;
  renderPosCart();
  await loadProducts();
  renderProductPicker("");
  loadSalesHistory();

  showToast(isPaidNow ? `Sale recorded — ${naira(total)}` : `Invoice issued (unpaid) — ${naira(total)}`);
  logNotification("sales", isPaidNow ? `Sale recorded — ${naira(total)} (${soldSnapshot.length} item${soldSnapshot.length === 1 ? "" : "s"})` : `Invoice issued (unpaid) — ${naira(total)}`);

  soldSnapshot.forEach((item) => {
    const updated = state.products.find((p) => p.id === item.productId);
    if (!updated) return;
    if (updated.quantity_in_stock <= 0) {
      showToast(`Out of stock: ${item.name} — please restock.`, "danger");
      logNotification("inventory", `Out of stock: ${item.name} (${item.code}) — please restock`);
    } else if (updated.quantity_in_stock <= updated.reorder_threshold) {
      showToast(`Low stock: ${item.name} — ${updated.quantity_in_stock} left.`, "warning");
      logNotification("inventory", `Low stock: ${item.name} (${item.code}) — ${updated.quantity_in_stock} left`);
    }
  });
});

let cachedSales = [];

async function loadSalesHistory() {
  const from = $("#sales-from").value, to = $("#sales-to").value, method = $("#sales-method-filter").value;
  let query = sb.from("sales").select("*, sale_items(*)").order("sale_date", { ascending: false }).limit(200);
  if (from) query = query.gte("sale_date", from);
  if (to) query = query.lte("sale_date", to + "T23:59:59");
  if (method !== "ALL") query = query.eq("payment_method", method);
  const { data, error } = await query;
  if (error) return;
  cachedSales = data || [];

  $("#sales-history-head").innerHTML = `<th>Invoice #</th><th>Date</th><th>Items</th><th>Customer</th><th>Method</th><th class="right">Total</th><th class="right">Status</th><th class="right">Actions</th>`;

  $("#sales-history-body").innerHTML = cachedSales.map((s) => {
    const itemsLabel = s.sale_items.map((it) => {
      const prod = state.products.find((p) => p.id === it.product_id);
      return `${it.quantity}×${prod ? prod.product_code : "?"}`;
    }).join(", ");
    let statusBadge;
    if (s.voided_at) statusBadge = '<span style="color:var(--red);font-size:12px;">Voided</span>';
    else if (s.payment_status === "pending") statusBadge = '<span style="color:var(--amber);font-size:12px;">Unpaid invoice</span>';
    else statusBadge = '<span style="color:var(--primary-dark);font-size:12px;">Paid</span>';

    const actions = [];
    if (!s.voided_at) {
      actions.push(`<button class="btn btn-outline" style="padding:4px 8px;" onclick="printSaleDocument('${s.id}')"><i data-lucide="printer" width="13" height="13"></i> ${s.payment_status === "pending" ? "Invoice" : "Receipt"}</button>`);
      if (s.payment_status === "pending") actions.push(`<button class="btn btn-primary" style="padding:4px 8px;" onclick="markSalePaid('${s.id}')">Mark paid</button>`);
      if (isAdmin()) actions.push(`<button class="btn btn-danger" style="padding:4px 8px;" onclick="openVoidModal('${s.id}')"><i data-lucide="ban" width="13" height="13"></i> Void</button>`);
    }

    return `<tr style="opacity:${s.voided_at ? 0.5 : 1}">
      <td class="mono">${escapeHtml(s.invoice_no || "—")}</td>
      <td class="mono">${new Date(s.sale_date).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${escapeHtml(itemsLabel)}</td>
      <td>${escapeHtml(s.customer_name) || "—"}</td>
      <td style="text-transform:capitalize">${s.payment_method.replace("_", " ")}</td>
      <td class="right mono">${naira(s.total_amount)}</td>
      <td class="right">${statusBadge}</td>
      <td class="right" style="white-space:nowrap;">${actions.join(" ")}</td>
    </tr>`;
  }).join("") || `<tr class="empty-row"><td colspan="8">No sales in this range.</td></tr>`;
  refreshIcons();
}
$("#sales-from").addEventListener("change", loadSalesHistory);
$("#sales-to").addEventListener("change", loadSalesHistory);
$("#sales-method-filter").addEventListener("change", loadSalesHistory);

async function markSalePaid(saleId) {
  const { error } = await sb.rpc("mark_sale_paid", { p_sale_id: saleId });
  if (error) { alert(error.message); return; }
  const sale = cachedSales.find((s) => s.id === saleId);
  showToast(`Payment received${sale ? ` — ${naira(sale.total_amount)}` : ""}.`);
  logNotification("sales", `Payment received — invoice ${sale ? sale.invoice_no : saleId}`);
  loadSalesHistory();
}

function openVoidModal(saleId) {
  openModal("Void this sale", `
    <p style="font-size:13px;color:var(--ink-soft);">This restores stock and marks the sale voided. The original record is kept for the audit trail, never deleted.</p>
    <div class="field"><label>Reason</label><input id="void-reason" placeholder="e.g. entered by mistake" /></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-danger" id="void-submit">Void sale</button></div>
  `, () => {
    $("#void-submit").addEventListener("click", async () => {
      const sale = cachedSales.find((s) => s.id === saleId);
      const { error } = await sb.rpc("void_sale", { p_sale_id: saleId, p_reason: $("#void-reason").value || null });
      if (error) { alert(error.message); return; }
      closeModal();
      await loadProducts();
      loadSalesHistory();
      renderDashboard();
      showToast("Sale voided — stock restored.", "warning");
      logNotification("sales", `Sale voided — invoice ${sale ? sale.invoice_no : saleId}`);
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Invoice / receipt printing                                             */
/* ---------------------------------------------------------------------- */
function printSaleDocument(saleId) {
  const sale = cachedSales.find((s) => s.id === saleId);
  if (!sale) return;
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to print invoices/receipts."); return; }
  win.document.write(buildInvoiceDocument(sale));
  win.document.close();
}

function buildInvoiceDocument(sale) {
  const isPaid = sale.payment_status === "paid" && !sale.voided_at;
  const docLabel = isPaid ? "RECEIPT" : "INVOICE";
  const items = sale.sale_items.map((it) => {
    const prod = state.products.find((p) => p.id === it.product_id);
    return { name: prod ? prod.name : "Item", qty: it.quantity, price: it.unit_price_at_sale, total: it.line_total };
  });
  const subtotal = items.reduce((a, i) => a + Number(i.total), 0);
  const blankRows = Math.max(0, 4 - items.length);
  const dateStr = new Date(sale.sale_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const itemRows = items.map((i) => `
    <tr><td>${escapeHtml(i.name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${naira(i.price)}</td><td style="text-align:right;">${naira(i.total)}</td></tr>
  `).join("") + Array.from({ length: blankRows }).map(() => `<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join("");

  const paymentBlock = isPaid ? `
    <div class="terms-box paid-box">
      <div class="terms-head">PAYMENT RECEIVED</div>
      <div class="terms-body">
        <p><strong>Amount paid:</strong> ${naira(sale.total_amount)}</p>
        <p><strong>Payment method:</strong> <span style="text-transform:capitalize;">${sale.payment_method.replace("_", " ")}</span></p>
        <p><strong>Date paid:</strong> ${sale.paid_at ? new Date(sale.paid_at).toLocaleString("en-GB") : dateStr}</p>
      </div>
    </div>` : `
    <div class="terms-box">
      <div class="terms-head">PAYMENT TERMS</div>
      <div class="terms-body">
        <p>• PAYMENT IS DONE BEFORE THE DELIVERY</p>
        <p>• Payment methods: Bank Transfer, Cheque, or Cash</p>
        <p style="color:#B8760A;"><strong>• BANK DETAILS: ${escapeHtml(BUSINESS_INFO.bankLine)}</strong></p>
      </div>
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${docLabel} ${escapeHtml(sale.invoice_no || "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #16221A; margin: 0; padding: 24px; background: #f2f2f2; }
  .sheet { max-width: 780px; margin: 0 auto; background: #fff; position: relative; padding: 24px 36px 24px; }
  .top-tagline { text-align: center; color: #B8460A; font-weight: 700; font-size: 12.5px; letter-spacing: .3px; margin-bottom: 14px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 16px; }
  .head img { height: 70px; }
  .head .right { text-align: right; }
  .head .doc-title { font-size: 30px; font-weight: 800; color: #075C2A; margin: 0 0 6px; }
  .head .right p { margin: 2px 0; font-size: 12px; font-weight: 600; color: #075C2A; }
  .bar { background: #1F6F43; color: #fff; text-align: center; font-weight: 700; padding: 8px; font-size: 13px; letter-spacing: .3px; margin-bottom: 14px; }
  .two { display: flex; gap: 0; margin-bottom: 14px; }
  .bill-to { flex: 1.4; background: #2E8B57; color: #fff; padding: 14px 16px; }
  .bill-to .t { font-weight: 700; font-size: 12px; margin-bottom: 8px; }
  .bill-to p { margin: 4px 0; font-size: 12.5px; }
  .inv-box { flex: 1; }
  .inv-box .row { display: flex; }
  .inv-box .cell-a { background: #075C2A; color: #fff; font-weight: 700; font-size: 12px; padding: 10px 12px; flex: 1; display: flex; align-items: center; }
  .inv-box .cell-b { background: #E7F4EA; font-size: 13px; padding: 10px 12px; flex: 1.3; display: flex; align-items: center; font-family: monospace; word-break: break-word; }
  .terms-box { margin-bottom: 20px; }
  .terms-box.paid-box .terms-head { background: #0E7C3A; }
  .terms-head { background: #1F6F43; color: #fff; font-weight: 700; font-size: 12px; padding: 8px 12px; }
  .terms-body { background: #E7F4EA; padding: 10px 12px; }
  .terms-body p { margin: 4px 0; font-size: 12.5px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items th { background: #075C2A; color: #fff; font-size: 11.5px; text-align: left; padding: 9px 10px; }
  table.items td { border: 1px solid #ddd; padding: 9px 10px; font-size: 12.5px; height: 20px; }
  .totals { width: 260px; margin-left: auto; margin-bottom: 4px; }
  .totals .row { display: flex; }
  .totals .label { background: #075C2A; color: #fff; font-weight: 700; font-size: 12.5px; padding: 8px 12px; flex: 1; }
  .totals .val { background: #E7F4EA; text-align: right; font-family: monospace; font-size: 13px; padding: 8px 12px; flex: 1; }
  .paid-stamp {
    position: absolute; top: 180px; right: 60px; border: 6px solid #0E7C3A; color: #0E7C3A;
    font-size: 46px; font-weight: 900; padding: 4px 18px; transform: rotate(-18deg); opacity: .75;
    border-radius: 8px; letter-spacing: 2px;
  }
  .actions { max-width: 780px; margin: 16px auto; display: flex; gap: 10px; justify-content: center; }
  .actions button { font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 6px; cursor: pointer; border: 1px solid #DCE6DF; background: #fff; }
  .actions button.primary { background: #0E7C3A; color: #fff; border-color: #0E7C3A; }
  @media print { .actions { display: none; } body { background: #fff; padding: 0; } .sheet { padding: 16px 24px; } }
  @media (max-width: 560px) {
    body { padding: 10px; }
    .sheet { padding: 16px 16px 20px; }
    .head { flex-direction: column; align-items: center; text-align: center; }
    .head .right { text-align: center; }
    .head img { height: 54px; }
    .head .doc-title { font-size: 22px; }
    .two { flex-direction: column; }
    .bill-to, .inv-box { width: 100%; }
    table.items { font-size: 11px; }
    table.items th, table.items td { padding: 6px; }
    .totals { width: 100%; }
    .paid-stamp { position: static; display: inline-block; margin: 12px auto 0; transform: rotate(0deg); font-size: 30px; }
  }
</style>
</head>
<body>
  <div class="sheet" id="invoice-sheet">
    <div class="top-tagline">${escapeHtml(BUSINESS_INFO.tagline)}</div>
    <div class="head">
      <img src="${LOGO_DATA_URI}" alt="Maleektech logo" />
      <div class="right">
        <div class="doc-title">${docLabel}</div>
        <p>${escapeHtml(BUSINESS_INFO.address)}</p>
        <p>${escapeHtml(BUSINESS_INFO.phones)}</p>
        <p>${escapeHtml(BUSINESS_INFO.email)}</p>
        <p>TIN: ${escapeHtml(BUSINESS_INFO.tin)} | RC: ${escapeHtml(BUSINESS_INFO.rc)}</p>
      </div>
    </div>

    <div class="bar">${escapeHtml(BUSINESS_INFO.legalName)} ${docLabel}</div>

    <div class="two">
      <div class="bill-to">
        <div class="t">BILL TO</div>
        <p>Name: ${escapeHtml(sale.customer_name) || "—"}</p>
        <p>Address: ${escapeHtml(sale.customer_address) || "—"}</p>
        <p>Phone No: ${escapeHtml(sale.customer_phone) || "—"}</p>
      </div>
      <div class="inv-box">
        <div class="row"><div class="cell-a">Invoice</div><div class="cell-b">${escapeHtml(sale.invoice_no || "—")}</div></div>
        <div class="row"><div class="cell-a">Date</div><div class="cell-b">${dateStr}</div></div>
      </div>
    </div>

    ${paymentBlock}

    <table class="items">
      <thead><tr><th>DESCRIPTION OF SERVICES</th><th>QTY</th><th>UNIT PRICE (₦)</th><th>AMOUNT (₦)</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><div class="label">Subtotal</div><div class="val">${naira(subtotal)}</div></div>
      <div class="row"><div class="label">Net Total</div><div class="val">${naira(subtotal)}</div></div>
    </div>

    ${isPaid ? '<div class="paid-stamp">PAID</div>' : ""}
  </div>

  <div class="actions">
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button id="dl-img-btn">Download as image</button>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
  <script>
    document.getElementById('dl-img-btn').addEventListener('click', function () {
      html2canvas(document.getElementById('invoice-sheet')).then(function (canvas) {
        var a = document.createElement('a');
        a.download = '${docLabel.toLowerCase()}-${(sale.invoice_no || sale.id).replace(/[^a-zA-Z0-9]/g, "-")}.png';
        a.href = canvas.toDataURL();
        a.click();
      });
    });
  <\/script>
</body></html>`;
}
/* ---------------------------------------------------------------------- */
async function loadExpenses() {
  $("#expense-date").value = $("#expense-date").value || todayStr();
  $("#expense-category").innerHTML = state.expenseCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  const { data, error } = await sb.from("expenses").select("*").is("voided_at", null).order("expense_date", { ascending: false }).limit(200);
  if (error) return;
  const catName = (id) => state.expenseCategories.find((c) => c.id === id)?.name || "—";
  $("#expenses-body").innerHTML = (data || []).map((e) => `
    <tr><td class="mono">${e.expense_date}</td><td>${escapeHtml(catName(e.category_id))}</td><td>${escapeHtml(e.description) || "—"}</td><td class="right mono">${naira(e.amount)}</td></tr>
  `).join("") || `<tr class="empty-row"><td colspan="4">No expenses recorded yet.</td></tr>`;
}

$("#expense-submit").addEventListener("click", async () => {
  const errEl = $("#expense-error");
  errEl.classList.add("hidden");
  const amount = +$("#expense-amount").value;
  const category_id = $("#expense-category").value;
  if (!amount || amount <= 0) { errEl.textContent = "Enter an amount greater than zero."; errEl.classList.remove("hidden"); return; }
  if (!category_id) { errEl.textContent = "Choose a category."; errEl.classList.remove("hidden"); return; }
  const { error } = await sb.from("expenses").insert({
    amount, category_id, description: $("#expense-description").value || null,
    expense_date: $("#expense-date").value || todayStr(), created_by: state.profile.id,
  });
  if (error) { errEl.textContent = error.message; errEl.classList.remove("hidden"); return; }
  const catName = state.expenseCategories.find((c) => c.id === category_id)?.name || "Expense";
  $("#expense-amount").value = ""; $("#expense-description").value = "";
  loadExpenses();
  showToast(`Expense recorded — ${naira(amount)} (${catName})`);
  logNotification("expenses", `Expense recorded — ${naira(amount)} (${catName})`);
});

$("#add-expense-category-btn").addEventListener("click", async () => {
  const name = $("#new-expense-category").value.trim();
  if (!name) return;
  const { error } = await sb.from("expense_categories").insert({ name });
  if (!error) { $("#new-expense-category").value = ""; await loadExpenseCategories(); loadExpenses(); }
});

/* ---------------------------------------------------------------------- */
/* Reports                                                                */
/* ---------------------------------------------------------------------- */
let expenseChart = null;

function defaultReportRange() {
  const monthStart = new Date(); monthStart.setDate(1);
  if (!$("#report-from").value) $("#report-from").value = monthStart.toISOString().slice(0, 10);
  if (!$("#report-to").value) $("#report-to").value = todayStr();
}

async function loadReports() {
  defaultReportRange();
  const from = $("#report-from").value, to = $("#report-to").value;

  const [{ data: sales }, { data: expenses }] = await Promise.all([
    sb.from("sales").select("*, sale_items(*)").is("voided_at", null).gte("sale_date", from).lte("sale_date", to + "T23:59:59"),
    sb.from("expenses").select("*").is("voided_at", null).gte("expense_date", from).lte("expense_date", to),
  ]);
  const liveSales = sales || [], liveExpenses = expenses || [];

  const revenue = liveSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const cogs = liveSales.reduce((a, s) => a + s.sale_items.reduce((b, it) => b + Number(it.unit_cost_at_sale) * it.quantity, 0), 0);
  const grossProfit = revenue - cogs;
  const totalExpenses = liveExpenses.reduce((a, e) => a + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;

  $("#pnl-card").innerHTML = `
    <div class="pnl-row"><span class="muted">Revenue</span><span class="amt">${naira(revenue)}</span></div>
    <div class="pnl-row"><span class="muted">Cost of goods sold</span><span class="amt neg">-${naira(cogs)}</span></div>
    <div class="pnl-row"><span style="font-weight:700;">Gross profit</span><span class="amt" style="font-weight:700;">${naira(grossProfit)}</span></div>
    <div class="pnl-row"><span class="muted">Total expenses</span><span class="amt neg">-${naira(totalExpenses)}</span></div>
    <div class="pnl-total"><span style="font-weight:700;font-size:14.5px;">Net profit</span><span class="amt" style="font-size:16px;color:${netProfit >= 0 ? "var(--primary-dark)" : "var(--red)"}">${naira(netProfit)}</span></div>
  `;

  const salesByProduct = {};
  liveSales.forEach((s) => s.sale_items.forEach((it) => { salesByProduct[it.product_id] = (salesByProduct[it.product_id] || 0) + it.quantity; }));
  const rows = Object.entries(salesByProduct).map(([productId, qty]) => ({ product: state.products.find((p) => p.id === productId), qty })).filter((r) => r.product);
  const best = [...rows].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const worst = [...rows].sort((a, b) => a.qty - b.qty).slice(0, 5);
  const rowsHtml = (arr) => arr.map((r) => `<tr><td class="mono">${escapeHtml(r.product.product_code)}</td><td>${escapeHtml(r.product.name)}</td><td class="right mono">${r.qty}</td></tr>`).join("") || `<tr class="empty-row"><td colspan="3">No sales in range.</td></tr>`;
  $("#best-sellers-body").innerHTML = rowsHtml(best);
  $("#worst-sellers-body").innerHTML = rowsHtml(worst);

  const expenseByCat = {};
  liveExpenses.forEach((e) => { expenseByCat[e.category_id] = (expenseByCat[e.category_id] || 0) + Number(e.amount); });
  const catEntries = Object.entries(expenseByCat).map(([id, amount]) => ({ name: state.expenseCategories.find((c) => c.id === id)?.name || "Other", amount }));
  const ctx = $("#expense-chart");
  if (expenseChart) expenseChart.destroy();
  if (catEntries.length) {
    $("#expense-chart-wrap").classList.remove("hidden");
    expenseChart = new Chart(ctx, {
      type: "bar",
      data: { labels: catEntries.map((c) => c.name), datasets: [{ label: "Amount", data: catEntries.map((c) => c.amount), backgroundColor: "#0E7C3A", borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => naira(c.parsed.y) } } }, scales: { y: { ticks: { callback: (v) => "₦" + (v >= 1000 ? (v / 1000) + "k" : v) } } } },
    });
  } else {
    $("#expense-chart-wrap").innerHTML = `<p class="muted" style="font-size:13px;margin:0;">No expenses in this range.</p>`;
  }

  const stockRows = state.products.filter((p) => p.is_active).map((p) => ({ ...p, value: p.quantity_in_stock * p.purchase_price }));
  const total = stockRows.reduce((a, p) => a + p.value, 0);
  $("#stock-valuation-body").innerHTML = stockRows.filter((p) => p.quantity_in_stock > 0).map((p) => `
    <tr><td class="mono">${escapeHtml(p.product_code)}</td><td>${escapeHtml(p.name)}</td><td class="right mono">${p.quantity_in_stock}</td><td class="right mono">${naira(p.purchase_price)}</td><td class="right mono">${naira(p.value)}</td></tr>
  `).join("");
  $("#stock-valuation-total").textContent = naira(total);

  $("#report-export-btn").onclick = () => exportPnlCsv(from, to, { revenue, cogs, grossProfit, totalExpenses, netProfit });
  $("#report-export-pdf-btn").onclick = () => exportPnlPdf(from, to, { revenue, cogs, grossProfit, totalExpenses, netProfit, best, worst, catEntries, stockRows: stockRows.filter((p) => p.quantity_in_stock > 0), stockTotal: total });
}
$("#report-from").addEventListener("change", loadReports);
$("#report-to").addEventListener("change", loadReports);

function exportPnlCsv(from, to, m) {
  const rows = [
    ["Report", "Maleektech P&L"], ["From", from], ["To", to], [],
    ["Metric", "Amount (NGN)"],
    ["Revenue", m.revenue], ["COGS", m.cogs], ["Gross profit", m.grossProfit],
    ["Total expenses", m.totalExpenses], ["Net profit", m.netProfit],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `maleektech-pnl-${from}-to-${to}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportPnlPdf(from, to, m) {
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to export as PDF."); return; }
  const rowsHtml = (arr) => arr.map((r) => `<tr><td>${escapeHtml(r.product.product_code)}</td><td>${escapeHtml(r.product.name)}</td><td style="text-align:right;">${r.qty}</td></tr>`).join("") || `<tr><td colspan="3">No sales in range.</td></tr>`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Maleektech Report ${from} to ${to}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #16221A; padding: 28px; }
    h1 { color: #075C2A; font-size: 22px; margin: 0 0 2px; }
    .sub { color: #4C5A50; font-size: 12.5px; margin-bottom: 20px; }
    h2 { color: #075C2A; font-size: 14px; border-bottom: 2px solid #E7F4EA; padding-bottom: 6px; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12.5px; }
    th { background: #075C2A; color: #fff; text-align: left; padding: 7px 10px; }
    td { padding: 7px 10px; border-bottom: 1px solid #E7E7E7; }
    .row { display: flex; justify-content: space-between; padding: 7px 10px; border-bottom: 1px solid #E7E7E7; font-size: 13px; }
    .row.total { font-weight: 700; background: #E7F4EA; }
    .two { display: flex; gap: 24px; }
    .two > div { flex: 1; }
    .actions { margin-top: 24px; }
    .actions button { font-size: 13px; padding: 8px 16px; border-radius: 6px; border: 1px solid #0E7C3A; background: #0E7C3A; color: #fff; cursor: pointer; }
    @media print { .actions { display: none; } }
  </style></head>
  <body>
    <h1>Maleektech — Business Report</h1>
    <div class="sub">${escapeHtml(from)} to ${escapeHtml(to)}</div>

    <h2>Profit &amp; loss</h2>
    <div class="row"><span>Revenue</span><span>${naira(m.revenue)}</span></div>
    <div class="row"><span>Cost of goods sold</span><span>-${naira(m.cogs)}</span></div>
    <div class="row"><span>Gross profit</span><span>${naira(m.grossProfit)}</span></div>
    <div class="row"><span>Total expenses</span><span>-${naira(m.totalExpenses)}</span></div>
    <div class="row total"><span>Net profit</span><span>${naira(m.netProfit)}</span></div>

    <h2>Best &amp; slowest sellers</h2>
    <div class="two">
      <div><table><thead><tr><th>ID</th><th>Product</th><th>Units</th></tr></thead><tbody>${rowsHtml(m.best)}</tbody></table></div>
      <div><table><thead><tr><th>ID</th><th>Product</th><th>Units</th></tr></thead><tbody>${rowsHtml(m.worst)}</tbody></table></div>
    </div>

    ${m.catEntries.length ? `<h2>Expense breakdown</h2><table><thead><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${m.catEntries.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:right;">${naira(c.amount)}</td></tr>`).join("")}</tbody></table>` : ""}

    <h2>Stock valuation (current)</h2>
    <table><thead><tr><th>ID</th><th>Product</th><th>Qty</th><th>Cost/unit</th><th>Value</th></tr></thead>
    <tbody>${m.stockRows.map((p) => `<tr><td>${escapeHtml(p.product_code)}</td><td>${escapeHtml(p.name)}</td><td>${p.quantity_in_stock}</td><td>${naira(p.purchase_price)}</td><td>${naira(p.value)}</td></tr>`).join("")}</tbody></table>
    <div class="row total"><span>Total sitting on the shelf</span><span>${naira(m.stockTotal)}</span></div>

    <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
  </body></html>`);
  win.document.close();
}

/* ---------------------------------------------------------------------- */
/* Settings                                                               */
/* ---------------------------------------------------------------------- */
async function renderSettings() {
  $("#settings-business-name").value = state.businessName;
  $("#settings-legal-name").value = BUSINESS_INFO.legalName;
  $("#settings-tagline").value = BUSINESS_INFO.tagline;
  $("#settings-address").value = BUSINESS_INFO.address;
  $("#settings-phones").value = BUSINESS_INFO.phones;
  $("#settings-email").value = BUSINESS_INFO.email;
  $("#settings-tin").value = BUSINESS_INFO.tin;
  $("#settings-rc").value = BUSINESS_INFO.rc;
  $("#settings-bank-line").value = BUSINESS_INFO.bankLine;

  const phase2 = state.products.filter((p) => p.category === "PHASE2");
  const activeCount = phase2.filter((p) => p.is_active).length;
  $("#phase2-status").textContent = `${activeCount} of ${phase2.length} laptop/computer accessory products are active.`;
  const allActive = phase2.length > 0 && activeCount === phase2.length;
  $("#phase2-toggle-btn").textContent = allActive ? "Deactivate Phase 2 catalogue" : "Activate Phase 2 catalogue";
  $("#phase2-toggle-btn").className = "btn " + (allActive ? "btn-outline" : "btn-primary");
  $("#phase2-toggle-btn").onclick = async () => {
    const { error } = await sb.from("products").update({ is_active: !allActive }).eq("category", "PHASE2");
    if (!error) { await loadProducts(); renderSettings(); }
  };

  $("#settings-categories").innerHTML = state.expenseCategories.map((c) => `
    <span class="chip">${escapeHtml(c.name)}
      <i data-lucide="pencil" width="11" height="11" style="cursor:pointer;" onclick="renameCategoryPrompt('${c.id}','${escapeHtml(c.name)}')"></i>
      <i data-lucide="trash-2" width="11" height="11" style="cursor:pointer;" onclick="deleteCategoryPrompt('${c.id}','${escapeHtml(c.name)}')"></i>
    </span>
  `).join("");

  const { data: staff } = await sb.from("profiles").select("*").order("full_name");
  state.staffCache = staff || [];
  $("#staff-body").innerHTML = (staff || []).map((s) => `
    <tr style="opacity:${s.is_active ? 1 : 0.5}">
      <td>${escapeHtml(s.full_name || "—")}</td><td>${escapeHtml(s.email)}</td><td style="text-transform:capitalize">${s.role}</td>
      <td class="right">${s.is_active ? "Active" : "Deactivated"}</td>
      <td class="right" style="white-space:nowrap;">
        ${s.role !== "admin" ? `<button class="btn btn-outline" style="padding:4px 9px;" onclick="openPermissionsModal('${s.id}')">Edit access</button>` : ""}
        <button class="btn btn-outline" style="padding:4px 9px;" onclick="toggleStaffActive('${s.id}', ${s.is_active})">${s.is_active ? "Deactivate" : "Reactivate"}</button>
      </td>
    </tr>`).join("");

  refreshIcons();
}

async function renameCategoryPrompt(id, currentName) {
  const name = prompt("Rename category", currentName);
  if (!name || name === currentName) return;
  const { error } = await sb.from("expense_categories").update({ name }).eq("id", id);
  if (!error) { await loadExpenseCategories(); renderSettings(); }
}

async function deleteCategoryPrompt(id, name) {
  const { data: inUse } = await sb.from("expenses").select("id").eq("category_id", id).limit(1);
  if (inUse && inUse.length > 0) {
    alert(`"${name}" is used by existing expenses and can't be deleted. Rename it instead, or leave it in place.`);
    return;
  }
  if (!confirm(`Delete the "${name}" category?`)) return;
  const { error } = await sb.from("expense_categories").delete().eq("id", id);
  if (error) { alert(error.message); return; }
  await loadExpenseCategories(); renderSettings();
}

async function toggleStaffActive(id, currentlyActive) {
  const { error } = await sb.from("profiles").update({ is_active: !currentlyActive }).eq("id", id);
  if (!error) renderSettings();
}

function openPermissionsModal(profileId) {
  const person = (state.staffCache || []).find((s) => s.id === profileId);
  if (!person) return;
  const perms = person.permissions || {};
  openModal(`Access for ${escapeHtml(person.full_name || person.email)}`, `
    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">Choose exactly what this account can open. Nothing is visible until you tick it — this doesn't affect what admins can see.</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${PERMISSION_ITEMS.map((item) => `
        <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;cursor:pointer;">
          <input type="checkbox" data-perm="${item.key}" ${perms[item.key] ? "checked" : ""} style="width:16px;height:16px;" />
          ${escapeHtml(item.label)}
        </label>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="perm-submit">Save access</button></div>
  `, () => {
    $("#perm-submit").addEventListener("click", async () => {
      const newPerms = {};
      $$("[data-perm]").forEach((cb) => { newPerms[cb.dataset.perm] = cb.checked; });
      const { error } = await sb.from("profiles").update({ permissions: newPerms }).eq("id", profileId);
      if (error) { alert(error.message); return; }
      closeModal();
      renderSettings();
    });
  });
}

$("#save-business-name-btn").addEventListener("click", async () => {
  const fields = {
    business_name: $("#settings-business-name").value.trim(),
    legal_name: $("#settings-legal-name").value.trim(),
    tagline: $("#settings-tagline").value.trim(),
    address: $("#settings-address").value.trim(),
    phones: $("#settings-phones").value.trim(),
    email: $("#settings-email").value.trim(),
    tin: $("#settings-tin").value.trim(),
    rc: $("#settings-rc").value.trim(),
    bank_line: $("#settings-bank-line").value.trim(),
  };
  if (!fields.business_name) return;
  for (const [key, value] of Object.entries(fields)) {
    const { error } = await sb.from("business_settings").upsert({ key, value });
    if (error) { alert(`Couldn't save ${key}: ${error.message}`); return; }
  }
  await loadBusinessName();
  showToast("Business profile updated.");
});

/* ---------------------------------------------------------------------- */
boot();
