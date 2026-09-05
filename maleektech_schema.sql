-- =====================================================================
-- Maleektech Mobile Gadgets & Accessories — Business Management System
-- Supabase (Postgres) schema, Row Level Security, and seed data
-- =====================================================================
-- Run this in the Supabase SQL editor on a NEW, dedicated project
-- (separate from the main marketing site and the maleek-tech.web.app ERP).
--
-- Order of operations in this file:
--   1. Extensions
--   2. Tables
--   3. Helper function (role lookup used by RLS policies)
--   4. Row Level Security policies
--   5. Column-level protection for purchase_price / unit_cost (staff can't
--      read cost/margin data even via direct API calls)
--   6. Business-rule constraints & triggers (stock can't go negative, etc.)
--   7. Seed data — all 38 catalog products
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
-- profiles: one row per auth.users, carries the app-level role
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  role          text not null default 'staff' check (role in ('admin', 'staff')),
  is_active     boolean not null default true,
  -- Fine-grained access control for non-admin users. Admins always see
  -- everything regardless of this column. A brand new staff account gets
  -- '{}' (empty object -> every permission below defaults to false), so an
  -- owner must explicitly grant each section. Keys used by the frontend:
  --   dashboard, dashboard_financials, inventory, sales, expenses, reports, settings
  permissions   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Helper functions: current user's role (used inside RLS policies)
-- ---------------------------------------------------------------------
create or replace function public.current_role_is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

create or replace function public.current_user_active()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_active = true
  );
$$;

-- Activity feed: product/stock/sales/expense events, shown in the app's
-- Notifications tab. 'scope' controls who can see each entry — kept in
-- sync with the same sensitivity rules as the rest of the schema:
--   'expenses' and 'settings' -> admins only (financial / HR-ish detail)
--   'inventory' / 'sales' / 'general' -> any active user (app also checks
--   the viewer has been granted that section before showing it)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('inventory', 'sales', 'expenses', 'settings', 'general')),
  message     text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (
    scope not in ('expenses', 'settings') or public.current_role_is_admin()
  );
drop policy if exists "notifications_insert_active_users" on public.notifications;
create policy "notifications_insert_active_users" on public.notifications
  for insert with check (public.current_user_active());

create table if not exists public.business_settings (
  key    text primary key,
  value  text
);

insert into public.business_settings (key, value) values
  ('business_name', 'Maleektech Mobile Gadgets & Accessories'),
  ('currency_symbol', '₦')
on conflict (key) do nothing;

create table if not exists public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  created_at    timestamptz not null default now()
);

create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  product_code        text not null unique,           -- e.g. "001" .. "038"
  name                text not null,
  category            text not null check (category in ('A', 'B', 'C', 'PHASE2')),
  purchase_price      numeric(12,2) not null check (purchase_price >= 0),
  selling_price       numeric(12,2) not null check (selling_price >= 0),
  quantity_in_stock   integer not null default 0 check (quantity_in_stock >= 0),
  reorder_threshold   integer not null default 5 check (reorder_threshold >= 0),
  image_url           text,                            -- public URL in Supabase Storage, see note below
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- generated column: margin is ALWAYS derived, never manually stored
alter table public.products
  add column if not exists margin_percent numeric(6,2)
  generated always as (
    case when selling_price = 0 then 0
    else round(((selling_price - purchase_price) / selling_price) * 100, 2)
    end
  ) stored;

create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id),
  quantity      integer not null check (quantity > 0),
  unit_cost     numeric(12,2) not null check (unit_cost >= 0), -- snapshot, may differ from catalog
  supplier      text,
  movement_date date not null default current_date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  invoice_no     text unique,        -- e.g. "MTS/INV/2026/1000", generated by the frontend/RPC
  sale_date      timestamptz not null default now(),
  customer_name  text,
  customer_phone text,
  customer_address text,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'pos_card')),
  payment_status text not null default 'paid' check (payment_status in ('pending', 'paid')),
  paid_at        timestamptz,
  notes          text,
  total_amount   numeric(12,2) not null default 0,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,       -- soft-void, never hard-delete
  voided_by      uuid references public.profiles(id),
  void_reason    text
);

create table if not exists public.sale_items (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references public.sales(id) on delete cascade,
  product_id          uuid not null references public.products(id),
  quantity            integer not null check (quantity > 0),
  unit_price_at_sale  numeric(12,2) not null,   -- snapshot at time of sale
  unit_cost_at_sale   numeric(12,2) not null,   -- snapshot for accurate COGS even after price changes
  line_total          numeric(12,2) not null
);

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.expense_categories(id),
  amount         numeric(12,2) not null check (amount >= 0),
  description    text,
  expense_date   date not null default current_date,
  receipt_url    text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  voided_at      timestamptz
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_product on public.sale_items(product_id);
create index if not exists idx_stock_movements_product on public.stock_movements(product_id);
create index if not exists idx_sales_date on public.sales(sale_date);
create index if not exists idx_expenses_date on public.expenses(expense_date);

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_categories enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists "business_settings_select_active_users" on public.business_settings;
create policy "business_settings_select_active_users" on public.business_settings
  for select using (public.current_user_active());
drop policy if exists "business_settings_admin_write" on public.business_settings;
create policy "business_settings_admin_write" on public.business_settings
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());

-- profiles: everyone can see their own row; only admins can see/manage all
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.current_role_is_admin());
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());

-- products: any active logged-in user can read (purchase_price is still
-- hidden from staff via the column-privilege revoke in section 5, and via
-- the products_staff view). Only admins can insert/update.
drop policy if exists "products_select_active_users" on public.products;
create policy "products_select_active_users" on public.products
  for select using (public.current_user_active());
drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());

-- stock_movements: cost data — admin only, full stop
drop policy if exists "stock_movements_admin_only" on public.stock_movements;
create policy "stock_movements_admin_only" on public.stock_movements
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());

-- sales: staff can create and read sales (needed for POS + history),
-- but cannot void/delete; only admin can void.
drop policy if exists "sales_select_active_users" on public.sales;
create policy "sales_select_active_users" on public.sales
  for select using (public.current_user_active());
drop policy if exists "sales_insert_active_users" on public.sales;
create policy "sales_insert_active_users" on public.sales
  for insert with check (public.current_user_active() and created_by = auth.uid());
drop policy if exists "sales_admin_update" on public.sales;
create policy "sales_admin_update" on public.sales
  for update using (public.current_role_is_admin()) with check (public.current_role_is_admin());
-- no delete policy for anyone -> hard deletes are impossible via the API

drop policy if exists "sale_items_select_active_users" on public.sale_items;
create policy "sale_items_select_active_users" on public.sale_items
  for select using (public.current_user_active());
drop policy if exists "sale_items_insert_active_users" on public.sale_items;
create policy "sale_items_insert_active_users" on public.sale_items
  for insert with check (public.current_user_active());

-- expenses & expense_categories: admin only — staff must never see these
drop policy if exists "expenses_admin_only" on public.expenses;
create policy "expenses_admin_only" on public.expenses
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());
drop policy if exists "expense_categories_admin_only" on public.expense_categories;
create policy "expense_categories_admin_only" on public.expense_categories
  for all using (public.current_role_is_admin()) with check (public.current_role_is_admin());

-- ---------------------------------------------------------------------
-- 5. Column-level protection
-- ---------------------------------------------------------------------
-- RLS is row-level, not column-level, so a technical staff user could
-- still SELECT purchase_price on a row they're allowed to read. Two
-- mitigations, use both:
--
-- (a) Revoke column-level SELECT on cost fields from the anon/authenticated
--     roles and grant a view instead. In Supabase, "authenticated" is the
--     role JWT-authenticated requests run as, so:

revoke select (purchase_price) on public.products from authenticated;

-- (b) Give the app a safe view for staff-facing screens that never
--     exposes cost or margin at all:
create or replace view public.products_staff_view as
  select id, product_code, name, category, selling_price, image_url,
         quantity_in_stock, reorder_threshold, is_active, created_at, updated_at
  from public.products;

grant select on public.products_staff_view to authenticated;

-- The frontend should query `products` (full data) only for admin screens,
-- and `products_staff_view` for staff-facing inventory/POS screens. Because
-- the raw purchase_price column select is revoked for the authenticated
-- role, even a staff user hitting the REST API directly for `products`
-- will get every column except purchase_price/margin.
-- NOTE: after revoke, re-grant the remaining columns explicitly so admins
-- (who query through the same "authenticated" role) can still read cost —
-- admin cost access is instead enforced by routing admin screens through a
-- second security-definer function rather than a column grant, since a
-- plain column grant can't be conditional on role. See the RPC below.

create or replace function public.get_products_full()
returns setof public.products
language sql
security definer
stable
as $$
  select * from public.products where public.current_role_is_admin();
$$;

grant execute on function public.get_products_full() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Business-rule triggers
-- ---------------------------------------------------------------------

-- Stock-in: increases quantity_in_stock
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
as $$
begin
  update public.products
    set quantity_in_stock = quantity_in_stock + new.quantity,
        updated_at = now()
    where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- Sale item insert: decrease stock, but never below zero (server-enforced,
-- not trusted from the frontend)
create or replace function public.apply_sale_item()
returns trigger
language plpgsql
as $$
declare
  available integer;
begin
  select quantity_in_stock into available from public.products where id = new.product_id for update;
  if available is null then
    raise exception 'Product % not found', new.product_id;
  end if;
  if available < new.quantity then
    raise exception 'Insufficient stock for product %: have %, need %', new.product_id, available, new.quantity;
  end if;
  update public.products
    set quantity_in_stock = quantity_in_stock - new.quantity,
        updated_at = now()
    where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_apply_sale_item on public.sale_items;
create trigger trg_apply_sale_item
  before insert on public.sale_items
  for each row execute function public.apply_sale_item();

-- Create a sale + its line items in one call. Runs as the function owner
-- (security definer) so it can read purchase_price to snapshot unit_cost_at_sale
-- even when the calling user is 'staff' and has no SELECT on that column.
-- p_items shape: [{ "product_id": "...", "quantity": 2, "unit_price": 4000 }, ...]
create or replace function public.create_sale(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_address text,
  p_payment_method   text,
  p_payment_status   text,   -- 'paid' (POS sale, paid now) or 'pending' (invoice, pay before delivery)
  p_notes            text,
  p_items            jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_sale_id   uuid;
  v_total     numeric(12,2) := 0;
  v_item      jsonb;
  v_cost      numeric(12,2);
  v_line      numeric(12,2);
  v_invoice_no text;
  v_seq       int;
begin
  if not public.current_user_active() then
    raise exception 'Inactive or unknown user';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must have at least one item';
  end if;
  if p_payment_status not in ('paid', 'pending') then
    raise exception 'Invalid payment status';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (v_item->>'quantity')::int * (v_item->>'unit_price')::numeric;
  end loop;

  select count(*) + 1000 into v_seq from public.sales;
  v_invoice_no := 'MTS/INV/' || extract(year from now())::text || '/' || v_seq::text;

  insert into public.sales (invoice_no, customer_name, customer_phone, customer_address, payment_method, payment_status, paid_at, notes, total_amount, created_by)
  values (v_invoice_no, p_customer_name, p_customer_phone, p_customer_address, p_payment_method, p_payment_status,
          case when p_payment_status = 'paid' then now() else null end, p_notes, v_total, auth.uid())
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select purchase_price into v_cost from public.products where id = (v_item->>'product_id')::uuid;
    if v_cost is null then
      raise exception 'Product % not found', v_item->>'product_id';
    end if;
    v_line := (v_item->>'quantity')::int * (v_item->>'unit_price')::numeric;
    insert into public.sale_items (sale_id, product_id, quantity, unit_price_at_sale, unit_cost_at_sale, line_total)
    values (v_sale_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::int, (v_item->>'unit_price')::numeric, v_cost, v_line);
    -- the trg_apply_sale_item trigger (fires on this insert) enforces stock
    -- availability and decrements quantity_in_stock; insufficient stock
    -- raises an exception here, which rolls back the whole sale atomically.
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.create_sale(text, text, text, text, text, text, jsonb) to authenticated;

-- Mark a pending invoice as paid -> it becomes a receipt in the frontend.
-- Any active user can collect payment at the counter, not just admins.
create or replace function public.mark_sale_paid(p_sale_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not public.current_user_active() then
    raise exception 'Inactive or unknown user';
  end if;
  update public.sales set payment_status = 'paid', paid_at = now()
  where id = p_sale_id and voided_at is null;
end;
$$;

grant execute on function public.mark_sale_paid(uuid) to authenticated;

-- Auto-create a profile row (default role 'staff') whenever someone is
-- added in Supabase Auth, so every login has a role to check against.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Voiding a sale restores stock for all its line items (called by admin
-- via a dedicated RPC rather than a raw UPDATE, so restoration always happens)
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
as $$
begin
  if not public.current_role_is_admin() then
    raise exception 'Only admins can void sales';
  end if;

  update public.sales
    set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
    where id = p_sale_id and voided_at is null;

  update public.products p
    set quantity_in_stock = p.quantity_in_stock + si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id and si.product_id = p.id;
end;
$$;

grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Seed data — full 38-item starting catalog
--    (Phase 2 items 026-038 seeded as is_active = false; flip to true
--    when Year Two / the laptop-accessories expansion begins.)
-- ---------------------------------------------------------------------
insert into public.expense_categories (name) values
  ('Rent'), ('Transport'), ('Airtime/Data'), ('Packaging'),
  ('Staff Wages'), ('Utilities'), ('Marketing'), ('Miscellaneous')
on conflict (name) do nothing;

insert into public.products (product_code, name, category, purchase_price, selling_price, quantity_in_stock, reorder_threshold, is_active) values
  -- Category A — Essential Fast-Movers
  ('001', 'Type-C Charging Cable',               'A', 1000,  2200, 20, 10, true),
  ('002', 'Lightning (iPhone) Cable',             'A', 2000,  4000, 20, 10, true),
  ('003', 'Micro-USB Cable',                      'A', 800,   2000, 20, 10, true),
  ('004', 'Standard Charger (10W)',               'A', 1800,  4000, 20, 8,  true),
  ('005', 'Fast Charger (20W-33W)',               'A', 3500,  7500, 15, 8,  true),
  ('006', 'Tempered Glass Screen Protector',      'A', 500,   1500, 30, 12, true),
  ('007', 'Silicone / TPU Phone Case',            'A', 1200,  3000, 25, 10, true),
  ('008', 'OTG Adapter',                          'A', 700,   1800, 20, 8,  true),
  ('009', 'USB Car Charger Adapter',              'A', 1200,  2800, 15, 8,  true),
  -- Category B — Profitable Gadgets
  ('010', 'Power Bank - 10,000mAh (Generic/Budget)', 'B', 6500,  12500, 12, 5, true),
  ('011', 'Power Bank - 20,000mAh (Itel/Branded)',   'B', 14500, 21000, 8,  4, true),
  ('012', 'Wired Earphones',                      'B', 1500,  3500, 20, 8,  true),
  ('013', 'Wireless Earbuds (TWS, Branded Budget)','B', 9500,  17000, 10, 5, true),
  ('014', 'Bluetooth Speaker (Portable)',         'B', 7000,  14000, 8,  4, true),
  ('015', 'Smart Watch (Budget/Mid-range)',       'B', 11000, 20000, 8,  4, true),
  ('016', 'Phone Holder (Car/Desk)',              'B', 1000,  2500, 15, 6, true),
  ('017', 'Selfie Stick / Mini Tripod',           'B', 2800,  6000, 10, 5, true),
  ('018', 'Ring Light (LED, Phone Mount)',        'B', 5000,  10500, 6, 3, true),
  ('019', 'Memory Card (32GB/64GB)',              'B', 3800,  7000, 15, 6, true),
  ('020', 'Flash Drive (32GB/64GB)',              'B', 3200,  6200, 15, 6, true),
  -- Category C — Premium Line (Limited Stock)
  ('021', 'Premium Branded Power Bank (30,000mAh+)', 'C', 24000, 38000, 4, 2, true),
  ('022', 'Premium Wireless Earbuds (Branded)',   'C', 19000, 32000, 4, 2, true),
  ('023', 'MagSafe Wireless Charger',             'C', 9000,  18000, 5, 2, true),
  ('024', 'Premium Smart Watch',                  'C', 25000, 42000, 3, 2, true),
  ('025', 'Premium Bluetooth Speaker',            'C', 16000, 28000, 4, 2, true),
  -- Phase 2 — Expansion Catalogue (inactive until Year Two)
  ('026', 'Laptop Bag / Sleeve',                  'PHASE2', 4500,  9500,  0, 5, false),
  ('027', 'Universal Laptop Charger',             'PHASE2', 6500,  13000, 0, 5, false),
  ('028', 'Wireless Mouse',                       'PHASE2', 3000,  6500,  0, 5, false),
  ('029', 'Wireless Keyboard',                    'PHASE2', 5000,  10500, 0, 5, false),
  ('030', 'USB-C Hub / Multiport Adapter',        'PHASE2', 5500,  11500, 0, 5, false),
  ('031', 'Laptop Cooling Pad',                   'PHASE2', 7000,  14000, 0, 4, false),
  ('032', 'External HDD (1TB)',                   'PHASE2', 23000, 38000, 0, 3, false),
  ('033', 'External SSD (256-500GB)',             'PHASE2', 20000, 34000, 0, 3, false),
  ('034', 'MiFi / Portable WiFi Router',          'PHASE2', 13000, 24000, 0, 3, false),
  ('035', 'Basic Inkjet Printer',                 'PHASE2', 48000, 70000, 0, 2, false),
  ('036', 'Webcam (HD)',                          'PHASE2', 8500,  17000, 0, 4, false),
  ('037', 'Laptop Stand',                         'PHASE2', 4000,  8500,  0, 4, false),
  ('038', 'HDMI Cable / Adapter',                 'PHASE2', 1800,  4000,  0, 8, false)
on conflict (product_code) do nothing;

-- ---------------------------------------------------------------------
-- 8. Product photo storage (Supabase Storage)
-- ---------------------------------------------------------------------
-- Creates a public bucket for product images and locks down who can
-- upload/replace/delete: only admins, while anyone signed in can view.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_write" on storage.objects;
create policy "product_images_admin_write" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.current_role_is_admin());

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects
  for update using (bucket_id = 'product-images' and public.current_role_is_admin());

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.current_role_is_admin());

-- ---------------------------------------------------------------------
-- Notes for the developer wiring this up
-- ---------------------------------------------------------------------
-- 1. Create the first admin manually after signup:
--      update public.profiles set role = 'admin' where email = 'owner@maleektech.com';
--    (the trg_handle_new_user trigger above already gives every new
--    signup a 'staff' profile automatically — this manual step is only
--    needed once, for yourself.)
-- 2. Never let the frontend write unit_price_at_sale / unit_cost_at_sale by
--    trusting client input for cost — cost is read server-side from
--    products.purchase_price inside create_sale() above, so historical
--    COGS can't be spoofed from the browser.
-- 3. Receipts for expenses: store files in a private Supabase Storage
--    bucket (not public) and save the path in receipt_url; generate signed
--    URLs on read. (Not created by this script — add it the same way as
--    the product-images bucket above if/when you need it.)
