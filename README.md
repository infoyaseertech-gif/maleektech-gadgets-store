# Maleektech Business System

## Try it first — no setup required

Open `index.html` directly in a browser (or drag the folder onto Netlify)
and it runs in **demo mode automatically**, using sample data stored in your
browser's local storage — no Supabase project needed yet. Sign in with:

- Admin: `admin@maleektech.com` / `admin123`
- Staff: `staff@maleektech.com` / `staff123` (pre-granted Inventory + Sales access,
  so you can see a working staff view — try removing access in Settings →
  Staff accounts to see what a brand-new account looks like instead)

A banner at the top confirms you're in demo mode, with a link to reset the
sample data back to the starting 38-product catalog at any time. The moment
you fill in real credentials in `js/config.js` (step 2 below), the app talks
to your live Supabase database instead — nothing else changes.

## What's new in this version

- **My Account.** Click your name at the bottom of the sidebar (any user,
  admin or staff) to change your own full name, email, or password. The
  demo logins above (`admin@maleektech.com` / `admin123` and
  `staff@maleektech.com` / `staff123`) are just the starting defaults —
  change them any time from there. A user can never grant themselves
  admin rights or extra permissions this way — that's still admin-only,
  enforced at the database level, not just hidden in the UI.
- **Sales page now shows every available product up front** — no more
  hidden search box. Click any item to add it to the cart; each row shows
  live stock ("12 available", "3 left" in amber, or "Out of stock" greyed
  out and unclickable). Type in the filter box to narrow the list.
- **Low-stock / out-of-stock alerts fire immediately.** The moment a sale
  takes the last unit of something, you get an on-screen alert right then
  — not just a note buried in a report later.
- **Notifications tab** (in the sidebar, after Reports) keeps a running
  history of everything: new products added, restocking, low-stock and
  out-of-stock warnings, sales recorded, invoices issued, payments
  received, sales voided, and expenses recorded. A red badge on the nav
  item shows how many are new since you last checked. Expense notifications
  are admin-only, matching the rest of the system's financial privacy
  rules; stock and sales notifications show to anyone with access to that
  section.
- **Your real logo** is now used throughout (sidebar, login screen, and
  printed invoices/receipts).
- **Invoices & receipts.** Every sale gets an auto-generated invoice number
  (`MTS/INV/2026/1000`-style). From Sales → history, click the document
  button on any sale to open a print-ready page matching your invoice
  template — full business details, bank account for payment, and a
  delivery note. Before payment it prints as an **INVOICE**; once marked
  paid, the same document becomes a **RECEIPT** with a green "PAID" stamp
  and the payment date/method. Use "Print / Save as PDF" (your browser's
  native print dialog) or "Download as image" to share it directly.
  At the point of sale, uncheck "Payment received now" to issue an unpaid
  invoice for pay-before-delivery orders — mark it paid later from Sales
  history whenever the money comes in.
- **Per-user permissions.** Admins always see everything. Every other
  account starts with **no access to anything** — under Settings → Staff
  accounts, click "Edit access" on a person to tick exactly which sections
  (Dashboard, Inventory, Sales, Expenses, Reports, Settings) and which
  dashboard figures (revenue/expenses/profit) they're allowed to see.
  Nothing is visible to them until you grant it.
- **Full admin control** over everything added to the system: products
  (add/edit/retire), expense categories (add/rename/delete — blocked with
  a clear message if a category is still in use), and staff access.
- **Product photos.** Add a picture to any product from the inventory
  screen's edit form; a thumbnail now shows in the inventory table
  alongside ID, category, price, and stock.

---

A private, login-protected web app for Maleektech Mobile Gadgets & Accessories:
inventory, point-of-sale style sales entry, expenses, and reports/dashboard —
built as plain HTML/CSS/JS talking directly to Supabase (Postgres + Auth + Row
Level Security), matching your main site's brand colors.

## 1. Set up the database (5 minutes)

1. Create a new project at [supabase.com](https://supabase.com) — use a
   **separate project** from your main marketing site and from the
   maleek-tech.web.app ERP.
2. Open the SQL editor in your new project and paste in the entire contents
   of `maleektech_schema.sql` (delivered alongside this app). Run it. This
   creates every table, security policy, trigger, and the starting 38-item
   product catalog (with Phase 2 laptop accessories seeded but inactive).
3. Go to **Authentication → Users** and click **Add user** to create your
   first login (yourself, as the owner). Use a real email and a password.
4. Back in the SQL editor, run this once, with your own email, to make
   yourself an admin (everyone else defaults to "staff" automatically):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@maleektech.com';
   ```

## 2. Connect the app to your database

Open `js/config.js` and fill in your project's URL and anon/public key,
both found in **Project Settings → API** in your Supabase dashboard:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

The anon key is safe to ship in frontend code — it only grants what the Row
Level Security policies in `maleektech_schema.sql` allow. Never put a
`service_role` key anywhere in this app.

## 3. Run it

This is a static site — no build step, no server required.

- **Locally**: open `index.html` directly, or serve the folder with any
  static file server (e.g. `npx serve .` or the VS Code "Live Server"
  extension) so relative paths resolve cleanly.
- **Deployed**: upload the whole folder to any static host — Netlify,
  Vercel, GitHub Pages, Firebase Hosting, or your own web server. There's
  nothing to configure beyond `js/config.js`.

## 4. Adding staff logins

Creating a new login requires Supabase's admin API (a `service_role` key),
which must never be embedded in browser code, so it isn't done from inside
this app. Instead:

- **Easiest**: Supabase dashboard → Authentication → Users → **Invite user**.
  They'll get an email to set their password. A profile row is created for
  them automatically (as "staff") the moment they sign in for the first
  time — no extra step needed.
- Once they appear in Settings → Staff accounts, promote them to admin the
  same way you promoted yourself in step 1.4, or leave them as staff.

## What staff can and can't see

This is enforced twice — once in this app's UI, and independently at the
database level via Row Level Security, so it holds even if someone opens
browser dev tools and queries the API directly:

- Staff can record sales, stock-in items, and view current stock.
- Staff **cannot** see purchase price, margin, expenses, or profit figures
  anywhere, and cannot void sales or edit products.
- Sales and stock movements are never hard-deleted. A mistaken sale is
  **voided** (admin only) — stock is restored and the record stays for the
  audit trail.

## Files

```
index.html              All screens (login + app shell)
css/styles.css           Brand styling, mobile-responsive
js/config.js             Your Supabase project URL + anon key (fill this in)
js/app.js                All app logic — auth, data, rendering
maleektech_schema.sql     Run this in Supabase first (tables, RLS, seed data)
```

## Currency & branding

Currency is fixed to ₦ (Naira) with thousands separators throughout.
Colors match the brief: primary green `#0E7C3A`, deep green `#075C2A`,
light tint `#E7F4EA`. Business name is editable under Settings and stored
in the database, so it updates everywhere the app shows it.
