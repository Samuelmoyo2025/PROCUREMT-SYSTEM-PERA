-- =====================================================================
-- Pera (by HeartPath Solutions) — Supabase schema (one client company per Supabase project)
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Administrator email is set near the bottom (search for admin-1).
-- =====================================================================
create extension if not exists pgcrypto;

create sequence if not exists seq_req;  create sequence if not exists seq_exp;
create sequence if not exists seq_rfq;  create sequence if not exists seq_po;
create sequence if not exists seq_grn;  create sequence if not exists seq_inv;
create sequence if not exists seq_ct;   create sequence if not exists seq_rq;

-- =====================================================================
-- TABLES
-- =====================================================================
create table if not exists app_users (
  id text primary key default gen_random_uuid()::text,
  name text not null, email text not null unique,
  role text not null default 'requisitioner' check (role in ('requisitioner','approver','procurement','finance','admin','supplier')),
  department text, title text, branch_id text, supplier_id text,
  favourites jsonb not null default '[]', delegate_to text, delegate_until date,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
alter table app_users add column if not exists delegate_to text;
alter table app_users add column if not exists delegate_until date;
-- profile & company administration: contact details, picture, personal preferences, extra departments, sign-in history
alter table app_users add column if not exists phone text;
alter table app_users add column if not exists avatar text;
alter table app_users add column if not exists prefs jsonb not null default '{}';
alter table app_users add column if not exists departments jsonb not null default '[]';
alter table app_users add column if not exists last_login_at timestamptz;
create table if not exists settings ( id int primary key default 1 check (id = 1), value jsonb not null );
create table if not exists categories (
  id text primary key default gen_random_uuid()::text, name text not null, description text,
  type text not null default 'item' check (type in ('item','supplier')),
  parent_id text references categories(id), branch_id text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists suppliers (
  id text primary key default gen_random_uuid()::text,
  name text not null, contact text, phone text, email text, country text, address text,
  registration_no text, tax_number text, bank_details text,
  category_ids jsonb not null default '[]', supplier_category_ids jsonb not null default '[]', tags jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','approved','suspended','blacklisted')),
  documents jsonb not null default '[]', reviews jsonb not null default '[]', notes text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists items (
  id text primary key default gen_random_uuid()::text, item_number text unique, name text not null,
  category_id text references categories(id), uom text, price numeric(14,2) default 0,
  track_stock boolean not null default false, stock_qty numeric not null default 0, reorder_level numeric not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists budgets (
  id text primary key default gen_random_uuid()::text, code text not null, name text not null, department text, branch_id text,
  category_id text references categories(id), year int, amount numeric(16,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists contracts (
  id text primary key default gen_random_uuid()::text,
  number text unique,                                   -- CT-00001, set by trigger
  title text not null, supplier_id text references suppliers(id), type text, start_date date, end_date date,
  value numeric(16,2), currency text, branch_id text, notes text, attachments jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','pending','active','rejected','terminated')),
  approver_ids jsonb not null default '[]', approvals_required int not null default 0, approvals jsonb not null default '[]',
  submitted_at timestamptz, decided_at timestamptz,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists requisitions (
  id text primary key default gen_random_uuid()::text,
  number text unique,                                   -- R-00001 or EX-00001, set by trigger
  title text not null, description text,
  kind text not null default 'purchase' check (kind in ('purchase','payment','expense')),
  category_id text references categories(id), supplier_id text references suppliers(id), payee text,
  contract_id text references contracts(id), budget_id text references budgets(id), plan_line_id text,
  department text, branch_id text, currency text not null default 'USD', payment_method text, due_date date, expense_date date,
  lines jsonb not null default '[]', total numeric(16,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','pending','review','approved','rejected','paid','withdrawn')),
  created_by text not null references app_users(id), created_at timestamptz not null default now(),
  submitted_at timestamptz, decided_at timestamptz, paid_at timestamptz,
  approver_ids jsonb not null default '[]', approvals_required int not null default 0, tier_label text,
  approvals jsonb not null default '[]', attachments jsonb not null default '[]', payment jsonb,
  reviewed_by text, reviewed_by_name text, reviewed_at timestamptz, review_note text
);
-- requisition controls: approval steps, purchaser, addresses, paying account, duplicate acknowledgement
alter table requisitions add column if not exists stages jsonb not null default '[]';
alter table requisitions add column if not exists purchaser_id text references app_users(id);
alter table requisitions add column if not exists delivery_address_id text;
alter table requisitions add column if not exists delivery_address text;
alter table requisitions add column if not exists distribution_address_id text;
alter table requisitions add column if not exists distribution_address text;
alter table requisitions add column if not exists pay_from_id text;
alter table requisitions add column if not exists dup_note text;
create table if not exists plan_lines (
  id text primary key default gen_random_uuid()::text, year int, quarter text, department text, description text not null,
  category_id text references categories(id), qty numeric default 1, est_cost numeric(16,2), currency text, method text,
  status text default 'planned', req_id text references requisitions(id), active boolean default true, created_at timestamptz not null default now()
);
create table if not exists requests (
  id text primary key default gen_random_uuid()::text,
  number text unique,                                   -- RQ-00001, set by trigger
  title text not null, description text, type text, category_id text references categories(id), department text, branch_id text,
  items jsonb not null default '[]', needed_by date, priority text default 'Normal',
  status text not null default 'draft' check (status in ('draft','pending','open','scheduled','completed','cancelled')),
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly','quarterly')), next_run date,
  parent_id text references requests(id), req_id text references requisitions(id), assigned_to text references app_users(id),
  completed_at timestamptz, resolution text, attachments jsonb not null default '[]',
  created_by text not null references app_users(id), created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists rfqs (
  id text primary key default gen_random_uuid()::text,
  number text not null unique default ('RFQ-' || lpad(nextval('seq_rfq')::text,5,'0')),
  title text not null, description text, req_id text references requisitions(id), category_id text references categories(id),
  currency text, lines jsonb not null default '[]', invited_ids jsonb not null default '[]',
  closing_at timestamptz not null, sealed boolean not null default true, criteria jsonb,
  status text not null default 'open' check (status in ('draft','open','awarded','cancelled')),
  created_by text, created_at timestamptz not null default now(), opened_at timestamptz,
  awarded_bid_id text, award_note text, awarded_at timestamptz, attachments jsonb not null default '[]'
);
create table if not exists bids (
  id text primary key default gen_random_uuid()::text, rfq_id text not null references rfqs(id), supplier_id text not null references suppliers(id),
  amount numeric(16,2) not null, currency text, delivery_days int, validity_days int, notes text, technical_score numeric default 0,
  submitted_at timestamptz not null default now(), submitted_by text, attachments jsonb not null default '[]',
  unique (rfq_id, supplier_id)
);
create table if not exists purchase_orders (
  id text primary key default gen_random_uuid()::text,
  number text unique,                                   -- PO-00001, set by trigger
  req_id text references requisitions(id), rfq_id text references rfqs(id), contract_id text references contracts(id),
  supplier_id text not null references suppliers(id), currency text, lines jsonb not null default '[]', total numeric(16,2) not null default 0,
  delivery_date date, delivery_address text, terms text, branch_id text,
  status text not null default 'draft' check (status in ('draft','pending_approval','review','rejected','issued','partially_received','received','closed','cancelled')),
  approver_ids jsonb not null default '[]', approvals_required int not null default 0, approvals jsonb not null default '[]',
  submitted_at timestamptz, decided_at timestamptz, reviewed_by text, reviewed_by_name text, reviewed_at timestamptz, review_note text,
  created_by text, created_at timestamptz not null default now()
);
create table if not exists receipts (
  id text primary key default gen_random_uuid()::text,
  number text not null unique default ('GRN-' || lpad(nextval('seq_grn')::text,5,'0')),
  po_id text not null references purchase_orders(id), lines jsonb not null default '[]', received_on date,
  received_by text, received_by_name text, condition text, notes text, attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists invoices (
  id text primary key default gen_random_uuid()::text,
  number text not null unique default ('INV-' || lpad(nextval('seq_inv')::text,5,'0')),
  supplier_invoice_no text not null, supplier_id text not null references suppliers(id), po_id text references purchase_orders(id),
  req_id text references requisitions(id), currency text, amount numeric(16,2) not null, invoice_date date, due_date date,
  status text not null default 'captured' check (status in ('captured','disputed','paid')),
  created_by text, created_at timestamptz not null default now(), attachments jsonb not null default '[]',
  unique (supplier_id, supplier_invoice_no)
);
create table if not exists stock_moves (
  id text primary key default gen_random_uuid()::text, item_id text not null references items(id),
  qty numeric not null, reason text not null, ref text, user_id text, user_name text, at timestamptz not null default now()
);
create table if not exists comments (
  id text primary key default gen_random_uuid()::text, entity_type text not null, entity_id text not null, entity_number text,
  body text not null, user_id text, user_name text, at timestamptz not null default now()
);
create index if not exists comments_entity_idx on comments(entity_id);
create table if not exists audit_log (
  id text primary key default gen_random_uuid()::text, entity_type text, entity_id text, entity_number text,
  action text not null, details text, user_id text, user_name text, at timestamptz not null default now()
);
create index if not exists audit_entity_idx on audit_log(entity_id);
create table if not exists notifications (
  id text primary key default gen_random_uuid()::text, user_id text not null references app_users(id),
  entity_type text, entity_id text, message text not null, read boolean not null default false,
  emailed boolean not null default false, at timestamptz not null default now()
);
-- "removed" notifications are hidden from the person's list, never deleted
alter table notifications add column if not exists dismissed boolean not null default false;

-- =====================================================================
-- WHO IS CALLING
-- =====================================================================
create or replace function me() returns app_users language sql stable security definer set search_path = public as $$
  select * from app_users where lower(email) = lower(auth.jwt() ->> 'email') and active limit 1 $$;
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$ select (me()).role $$;
create or replace function my_supplier() returns text language sql stable security definer set search_path = public as $$ select (me()).supplier_id $$;
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(my_role() in ('approver','procurement','finance','admin'), false) $$;
create or replace function is_member() returns boolean language sql stable security definer set search_path = public as $$ select (me()).id is not null and my_role() <> 'supplier' $$;
create or replace function via_engine() returns boolean language sql stable as $$ select coalesce(current_setting('app.via_engine', true), '') = '1' $$;

-- small helpers used by triggers
create or replace function note(p_user text, p_type text, p_id text, p_msg text) returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, entity_type, entity_id, message) select p_user, p_type, p_id, p_msg where p_user is not null $$;
create or replace function note_role(p_role text, p_type text, p_id text, p_msg text) returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, entity_type, entity_id, message) select id, p_type, p_id, p_msg from app_users where role = p_role and active $$;
create or replace function audit(p_type text, p_id text, p_number text, p_action text, p_details text) returns void language sql security definer set search_path = public as $$
  insert into audit_log(entity_type, entity_id, entity_number, action, details) values (p_type, p_id, p_number, p_action, coalesce(p_details,'')) $$;

-- =====================================================================
-- STAMPS: audit author/time, updated_at, stock movements
-- =====================================================================
create or replace function stamp_author() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin new.at := now();
  -- automatic entries (e.g. escalations) keep their "Pera (automatic)" author even when a signed-in person's visit triggered them
  if coalesce(current_setting('app.system_actor', true), '') = '1' and tg_table_name = 'audit_log' then new.user_id := null; return new; end if;
  if u.id is not null then new.user_id := u.id; new.user_name := u.name; end if; return new; end $$;
drop trigger if exists trg_stamp_audit on audit_log;    create trigger trg_stamp_audit before insert on audit_log for each row execute function stamp_author();
drop trigger if exists trg_stamp_comment on comments;   create trigger trg_stamp_comment before insert on comments for each row execute function stamp_author();

create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['app_users','categories','suppliers','items','budgets','contracts','requests'] loop
    execute format('drop trigger if exists trg_touch on %I', t);
    execute format('create trigger trg_touch before update on %I for each row execute function touch()', t);
  end loop; end $$;

create or replace function apply_stock_move() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me(); q numeric;
begin
  new.at := now(); if u.id is not null then new.user_id := u.id; new.user_name := u.name; end if;
  if coalesce(trim(new.reason),'') = '' then raise exception 'A reason is required for every stock movement'; end if;
  update items set stock_qty = stock_qty + new.qty where id = new.item_id and track_stock returning stock_qty into q;
  if q is null then raise exception 'This item is not tracked in stores'; end if;
  if q < 0 then raise exception 'Not enough stock: this would take it below zero'; end if;
  return new;
end $$;
drop trigger if exists trg_stock on stock_moves; create trigger trg_stock before insert on stock_moves for each row execute function apply_stock_move();

-- users may change only their own favourites, delegation, job title, phone, picture, preferences and sign-in time;
-- name, email, role, departments, branch and active status stay with administrators
create or replace function guard_user_update() returns trigger language plpgsql security definer set search_path = public as $$
declare own constant text[] := array['favourites','delegate_to','delegate_until','updated_at','title','phone','avatar','prefs','last_login_at'];
begin
  if my_role() <> 'admin' and (to_jsonb(new) - own) is distinct from (to_jsonb(old) - own) then
    raise exception 'Only an administrator can change user details'; end if;
  if my_role() <> 'admin' and new.id <> (me()).id then raise exception 'You can only change your own profile'; end if;
  if new.avatar is not null and length(new.avatar) > 400000 then raise exception 'Profile picture is too large'; end if;
  return new;
end $$;
drop trigger if exists trg_user_update on app_users; create trigger trg_user_update before update on app_users for each row execute function guard_user_update();

-- =====================================================================
-- APPROVAL ROUTE (by amount, from Settings)
-- =====================================================================
create or replace function pick_tier(p_currency text, p_total numeric) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; rate numeric; base numeric; t jsonb; best jsonb;
begin
  select value into s from settings where id = 1;
  select coalesce((c ->> 'rate')::numeric, 1) into rate from jsonb_array_elements(s -> 'currencies') c where c ->> 'code' = p_currency limit 1;
  base := p_total / coalesce(nullif(rate,0), 1);
  for t in select x from jsonb_array_elements(s -> 'approval_tiers') x order by coalesce(nullif(x ->> 'max','')::numeric, 1e18) loop
    best := t; exit when (t ->> 'max') is null or (t ->> 'max') = '' or base <= (t ->> 'max')::numeric;
  end loop;
  return best;
end $$;

-- =====================================================================
-- BUDGET HEADROOM (used by the optional hard budget cap)
-- =====================================================================
create or replace function rate_of(p_cur text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select nullif((c ->> 'rate')::numeric,0) from settings s, jsonb_array_elements(s.value -> 'currencies') c where s.id = 1 and c ->> 'code' = p_cur limit 1), 1) $$;
create or replace function budget_available(p_budget text, p_exclude text) returns numeric language sql stable security definer set search_path = public as $$
  select b.amount - coalesce((select sum(coalesce((r.payment ->> 'amount')::numeric, r.total) / rate_of(r.currency)) from requisitions r
    where r.budget_id = b.id and r.id <> coalesce(p_exclude,'') and r.status in ('pending','review','approved','paid')), 0)
  from budgets b where b.id = p_budget $$;

-- =====================================================================
-- REQUISITIONS & EXPENSES
-- =====================================================================
create or replace function guard_req_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin
  if u.id is null or u.role = 'supplier' then raise exception 'You cannot create requisitions'; end if;
  new.number := case when new.kind = 'expense' then 'EX-' || lpad(nextval('seq_exp')::text,5,'0') else 'R-' || lpad(nextval('seq_req')::text,5,'0') end;
  new.created_by := u.id; new.created_at := now(); new.status := 'draft'; new.approvals := '[]'; new.approver_ids := '[]';
  new.submitted_at := null; new.decided_at := null; new.paid_at := null; new.payment := null; new.reviewed_by := null; new.reviewed_at := null;
  return new;
end $$;
drop trigger if exists trg_req_insert on requisitions; create trigger trg_req_insert before insert on requisitions for each row execute function guard_req_insert();

create or replace function guard_req_update() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me(); t jsonb; stg jsonb; st_ jsonb; sids jsonb;
begin
  if new.id <> old.id or new.number <> old.number or new.created_by <> old.created_by or new.created_at <> old.created_at or new.kind <> old.kind then raise exception 'Record identity cannot be changed'; end if;
  if jsonb_array_length(new.attachments) < jsonb_array_length(old.attachments) then raise exception 'Documents cannot be removed once uploaded'; end if;
  if via_engine() then return new; end if;
  if (new.approvals, new.decided_at, new.reviewed_by, new.reviewed_at) is distinct from (old.approvals, old.decided_at, old.reviewed_by, old.reviewed_at) then raise exception 'Approvals and reviews can only be recorded with the Approve / Reject / Review actions'; end if;
  if old.status <> 'draft' and (new.title,new.description,new.lines,new.total,new.currency,new.category_id,new.due_date,new.department,new.budget_id,new.payee,new.expense_date,new.branch_id,
                                new.delivery_address_id,new.delivery_address,new.distribution_address_id,new.distribution_address,new.pay_from_id,new.dup_note)
       is distinct from (old.title,old.description,old.lines,old.total,old.currency,old.category_id,old.due_date,old.department,old.budget_id,old.payee,old.expense_date,old.branch_id,
                                old.delivery_address_id,old.delivery_address,old.distribution_address_id,old.distribution_address,old.pay_from_id,old.dup_note) then
    raise exception 'Only drafts can be edited'; end if;
  if old.status <> 'draft' and new.purchaser_id is distinct from old.purchaser_id and u.role not in ('procurement','admin') then
    raise exception 'Only Procurement can assign the purchaser'; end if;
  if new.purchaser_id is not null and new.purchaser_id is distinct from old.purchaser_id
     and not exists (select 1 from app_users p where p.id = new.purchaser_id and p.active and p.role in ('procurement','admin')) then
    raise exception 'The purchaser must be an active Procurement user'; end if;
  if old.status <> 'draft' and new.supplier_id is distinct from old.supplier_id and not (old.status = 'approved' and u.role in ('procurement','admin')) then
    raise exception 'The supplier can only be changed by Procurement after approval'; end if;
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'pending' and u.id = old.created_by then
      if new.due_date is not null and new.due_date < current_date then raise exception 'The due date has already passed - choose today or a later date'; end if;
      t := pick_tier(new.currency, new.total);
      if t is null or jsonb_array_length(coalesce(t -> 'approver_ids','[]')) = 0 then raise exception 'No approvers are set up for this amount'; end if;
      if jsonb_array_length(coalesce(t -> 'next_steps','[]')) > 0 then
        -- approval in steps: step 1 is the tier's own approvers, then each next step; the requester is left out of every step
        stg := '[]';
        for st_ in select x from jsonb_array_elements(jsonb_build_array(jsonb_build_object('label', coalesce(t ->> 'step_label','Approval'), 'approver_ids', t -> 'approver_ids', 'required', t -> 'required')) || (t -> 'next_steps')) x loop
          sids := coalesce(st_ -> 'approver_ids','[]') - old.created_by;
          if jsonb_array_length(sids) > 0 then
            stg := stg || jsonb_build_array(jsonb_build_object('label', coalesce(st_ ->> 'label','Approval'), 'ids', sids,
                     'required', least(greatest(coalesce((st_ ->> 'required')::int,1),1), jsonb_array_length(sids))));
          end if;
        end loop;
        if jsonb_array_length(stg) = 0 then raise exception 'Nobody other than the requester can approve this - add another approver to the tier'; end if;
        new.stages := stg;
        select coalesce(jsonb_agg(distinct v), '[]') into new.approver_ids from jsonb_array_elements(stg) s(x), jsonb_array_elements_text(s.x -> 'ids') v;
        select sum((s.x ->> 'required')::int) into new.approvals_required from jsonb_array_elements(stg) s(x);
      else
        new.stages := '[]';
        new.approver_ids := (t -> 'approver_ids') - old.created_by;   -- nobody approves their own request
        if jsonb_array_length(new.approver_ids) = 0 then raise exception 'Nobody other than the requester can approve this - add another approver to the tier'; end if;
        new.approvals_required := least(greatest((t ->> 'required')::int, 1), jsonb_array_length(new.approver_ids));
      end if;
      if new.kind = 'purchase' and new.purchaser_id is null then
        new.purchaser_id := (select p.id from app_users p, settings s where s.id = 1 and p.id = s.value ->> 'default_purchaser_id' and p.active and p.role in ('procurement','admin'));
      end if;
      if coalesce((select value ->> 'budget_control' from settings where id = 1),'warn') = 'block' and new.budget_id is not null
         and budget_available(new.budget_id, new.id) < new.total / rate_of(new.currency) then
        raise exception 'Budget control: this requisition would exceed its budget line'; end if;
      new.tier_label := t ->> 'label'; new.submitted_at := now(); new.approvals := '[]';
    elsif old.status = 'pending' and new.status = 'withdrawn' and u.id = old.created_by then null;
    elsif old.status = 'approved' and new.status = 'paid' and u.role in ('finance','admin') then
      if coalesce(new.payment ->> 'reference','') = '' then raise exception 'A payment reference is required'; end if;
      new.paid_at := now();
    else raise exception 'Changing status from % to % is not allowed', old.status, new.status; end if;
  else
    if (new.approver_ids, new.approvals_required, new.tier_label, new.stages) is distinct from (old.approver_ids, old.approvals_required, old.tier_label, old.stages) then raise exception 'The approval route cannot be changed'; end if;
    if new.payment is distinct from old.payment then raise exception 'Payment details are set only when marking as paid'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_req_update on requisitions; create trigger trg_req_update before update on requisitions for each row execute function guard_req_update();

-- =====================================================================
-- PURCHASE ORDERS
-- =====================================================================
create or replace function guard_po_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin
  if u.role not in ('procurement','admin') then raise exception 'Only Procurement can raise purchase orders'; end if;
  if new.req_id is not null and not exists (select 1 from requisitions where id = new.req_id and status = 'approved') then raise exception 'The requisition is not approved'; end if;
  new.number := 'PO-' || lpad(nextval('seq_po')::text,5,'0');
  new.created_by := u.id; new.created_at := now(); new.status := 'draft'; new.approvals := '[]'; new.approver_ids := '[]'; new.decided_at := null; new.reviewed_by := null; new.reviewed_at := null;
  return new;
end $$;
drop trigger if exists trg_po_insert on purchase_orders; create trigger trg_po_insert before insert on purchase_orders for each row execute function guard_po_insert();

create or replace function guard_po_update() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me(); s jsonb; pa jsonb; is_requester boolean;
begin
  if new.id <> old.id or new.number <> old.number or new.created_at <> old.created_at then raise exception 'Record identity cannot be changed'; end if;
  if via_engine() then return new; end if;
  if (new.approvals, new.decided_at, new.reviewed_by, new.reviewed_at) is distinct from (old.approvals, old.decided_at, old.reviewed_by, old.reviewed_at) then raise exception 'Approvals and reviews can only be recorded with the Approve / Reject / Review actions'; end if;
  if old.status <> 'draft' and (new.lines, new.total, new.supplier_id, new.currency, new.terms, new.delivery_address) is distinct from (old.lines, old.total, old.supplier_id, old.currency, old.terms, old.delivery_address) then raise exception 'Only draft purchase orders can be edited'; end if;
  is_requester := exists (select 1 from requisitions r where r.id = old.req_id and r.created_by = u.id);
  if new.status is distinct from old.status then
    select value into s from settings where id = 1; pa := coalesce(s -> 'po_approval', '{}');
    if old.status = 'draft' and u.role in ('procurement','admin') and new.status in ('pending_approval','review','issued') then
      if coalesce((pa ->> 'enabled')::boolean,false) and jsonb_array_length(coalesce(pa -> 'approver_ids','[]')) > 0 then
        new.status := 'pending_approval'; new.approver_ids := (pa -> 'approver_ids') - old.created_by;
        if jsonb_array_length(new.approver_ids) = 0 then raise exception 'Another PO approver is needed - nobody approves their own purchase order'; end if;
        new.approvals_required := least(greatest(coalesce((pa ->> 'required')::int,1),1), jsonb_array_length(new.approver_ids));
      elsif coalesce((s ->> 'review_enabled')::boolean,false) then new.status := 'review';
      else new.status := 'issued'; end if;
      new.submitted_at := now();
    elsif new.status = 'cancelled' and old.status in ('draft','pending_approval','review','issued') and u.role in ('procurement','admin') then null;
    elsif old.status in ('issued','partially_received') and new.status in ('partially_received','received') and (u.role in ('procurement','admin') or is_requester) then null;
    elsif old.status in ('issued','partially_received','received') and new.status = 'closed' and u.role in ('finance','admin') then null;
    else raise exception 'Changing a purchase order from % to % is not allowed', old.status, new.status; end if;
  elsif (new.approver_ids, new.approvals_required) is distinct from (old.approver_ids, old.approvals_required) then raise exception 'The approval route cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists trg_po_update on purchase_orders; create trigger trg_po_update before update on purchase_orders for each row execute function guard_po_update();

-- =====================================================================
-- CONTRACTS
-- =====================================================================
create or replace function guard_ct_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin
  if u.role not in ('procurement','admin') then raise exception 'Only Procurement can record contracts'; end if;
  new.number := 'CT-' || lpad(nextval('seq_ct')::text,5,'0');
  new.created_by := u.id; new.created_at := now(); new.status := 'draft'; new.approvals := '[]'; new.approver_ids := '[]'; new.decided_at := null;
  return new;
end $$;
drop trigger if exists trg_ct_insert on contracts; create trigger trg_ct_insert before insert on contracts for each row execute function guard_ct_insert();

create or replace function guard_ct_update() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me(); ca jsonb;
begin
  if new.id <> old.id or new.number <> old.number or new.created_by <> old.created_by then raise exception 'Record identity cannot be changed'; end if;
  if jsonb_array_length(new.attachments) < jsonb_array_length(old.attachments) then raise exception 'Documents cannot be removed once uploaded'; end if;
  if via_engine() then return new; end if;
  if u.role not in ('procurement','admin') then raise exception 'Only Procurement can change contracts'; end if;
  if new.approvals is distinct from old.approvals or new.decided_at is distinct from old.decided_at then raise exception 'Approvals can only be recorded with the Approve / Reject action'; end if;
  if old.status not in ('draft') and (new.title, new.supplier_id, new.type, new.start_date, new.currency) is distinct from (old.title, old.supplier_id, old.type, old.start_date, old.currency) then
    raise exception 'Only the end date, value, notes and documents of an approved contract can be amended'; end if;
  if new.status is distinct from old.status then
    select value -> 'contract_approval' into ca from settings where id = 1; ca := coalesce(ca,'{}');
    if old.status = 'draft' and new.status in ('pending','active') then
      if coalesce((ca ->> 'enabled')::boolean,false) and jsonb_array_length(coalesce(ca -> 'approver_ids','[]')) > 0 then
        new.status := 'pending'; new.approver_ids := (ca -> 'approver_ids') - old.created_by;
        if jsonb_array_length(new.approver_ids) = 0 then raise exception 'Another contract approver is needed - nobody approves their own contract'; end if;
        new.approvals_required := least(greatest(coalesce((ca ->> 'required')::int,1),1), jsonb_array_length(new.approver_ids));
      else new.status := 'active'; end if;
      new.submitted_at := now();
    elsif old.status = 'active' and new.status = 'terminated' then null;
    else raise exception 'Changing a contract from % to % is not allowed', old.status, new.status; end if;
  elsif (new.approver_ids, new.approvals_required) is distinct from (old.approver_ids, old.approvals_required) then raise exception 'The approval route cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists trg_ct_update on contracts; create trigger trg_ct_update before update on contracts for each row execute function guard_ct_update();

-- =====================================================================
-- THE APPROVE / REJECT ACTION (requisitions, expenses, POs, contracts)
-- =====================================================================
create or replace function decide_record(p_table text, p_id text, p_decision text, p_comment text default '') returns void
language plpgsql security definer set search_path = public as $$
declare u app_users := me(); s jsonb; rec jsonb; ids jsonb; appr jsonb; n int; needed int; yes int; no int; res text; st text; typ text; lbl text; f record; a text; rv boolean; actor text; aname text;
        stg jsonb; cur int := 0; nst int := 0; i int; k int;
begin
  if p_table not in ('requisitions','purchase_orders','contracts') then raise exception 'Not supported'; end if;
  if u.id is null then raise exception 'You are not a registered user'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_comment),'') = '' then raise exception 'Give a reason to reject'; end if;
  select value into s from settings where id = 1; rv := coalesce((s ->> 'review_enabled')::boolean,false);
  execute format('select to_jsonb(t) from %I t where id = $1 for update', p_table) into rec using p_id;
  if rec is null then raise exception 'Record not found'; end if;
  if rec ->> 'status' not in ('pending','pending_approval') then raise exception 'This is no longer waiting for approval'; end if;
  ids := rec -> 'approver_ids'; needed := least((rec ->> 'approvals_required')::int, jsonb_array_length(ids));
  -- approval in steps: only the step now waiting can decide (approvals carry the step number they belong to)
  stg := coalesce(rec -> 'stages', '[]'); nst := jsonb_array_length(stg);
  if nst > 0 then
    cur := null;
    for i in 0 .. nst - 1 loop
      select count(*) into k from jsonb_array_elements(rec -> 'approvals') x
        where coalesce((x ->> 'stage')::int, 0) = i and x ->> 'decision' = 'approved' and (stg -> i -> 'ids') ? (x ->> 'approver_id');
      if k < (stg -> i ->> 'required')::int then cur := i; exit; end if;
    end loop;
    if cur is null then raise exception 'This is no longer waiting for approval'; end if;
    ids := stg -> cur -> 'ids'; needed := least((stg -> cur ->> 'required')::int, jsonb_array_length(ids));
  end if;
  if rec ->> 'created_by' = u.id then raise exception 'You cannot approve or reject your own request'; end if;
  actor := u.id; aname := u.name;
  if not (ids ? u.id) or exists (select 1 from jsonb_array_elements(rec -> 'approvals') x where x ->> 'approver_id' = u.id and coalesce((x ->> 'stage')::int, 0) = cur) then
    -- acting for an approver who has delegated to me and has not decided yet
    select p.id, p.name into actor, aname from app_users p
      where ids ? p.id and p.active and p.delegate_to = u.id and (p.delegate_until is null or p.delegate_until >= current_date) and p.id <> rec ->> 'created_by'
        and not exists (select 1 from jsonb_array_elements(rec -> 'approvals') x where x ->> 'approver_id' = p.id and coalesce((x ->> 'stage')::int, 0) = cur) limit 1;
    if actor is null then raise exception 'You are not an approver on this step, or you have already decided'; end if;
  end if;
  appr := (rec -> 'approvals') || jsonb_build_array(jsonb_build_object('approver_id',actor,'approver_name',aname,'decision',p_decision,'comment',coalesce(p_comment,''),'at',now(),'stage',cur)
            || case when actor <> u.id then jsonb_build_object('by_id',u.id,'by_name',u.name) else '{}'::jsonb end);
  n := jsonb_array_length(ids);
  select count(*) filter (where x ->> 'decision' = 'approved'), count(*) filter (where x ->> 'decision' = 'rejected') into yes, no
    from jsonb_array_elements(appr) x where ids ? (x ->> 'approver_id') and coalesce((x ->> 'stage')::int, 0) = cur;
  res := case when coalesce(s ->> 'reject_rule','veto') = 'veto' and no > 0 then 'rejected' when yes >= needed then 'approved' when no > n - needed then 'rejected' else 'pending' end;
  if res = 'approved' and nst > 0 and cur < nst - 1 then res := 'next'; end if;   -- this step is done; the next one is asked now
  st := case when res = 'rejected' then 'rejected'
             when res = 'approved' then case when p_table = 'contracts' then 'active' when rv then 'review' when p_table = 'requisitions' then 'approved' else 'issued' end
             else rec ->> 'status' end;
  perform set_config('app.via_engine','1',true);
  execute format('update %I set approvals = $1, status = $2, decided_at = case when $3 then now() else decided_at end where id = $4', p_table) using appr, st, res not in ('pending','next'), p_id;
  perform set_config('app.via_engine','',true);

  typ := case p_table when 'requisitions' then case when rec ->> 'kind' = 'expense' then 'expense' else 'requisition' end when 'purchase_orders' then 'po' else 'contract' end;
  lbl := (rec ->> 'number') || coalesce(' – ' || (rec ->> 'title'), '');
  perform audit(typ, p_id, rec ->> 'number', case when p_decision = 'approved' then 'Approved' else 'Rejected' end || case when actor <> u.id then ' on behalf of ' || aname else '' end, case when coalesce(p_comment,'') <> '' then '“' || p_comment || '”' else '' end);
  perform note(rec ->> 'created_by', typ, p_id, u.name || ' ' || p_decision || ' ' || lbl);
  if res = 'next' then
    perform audit(typ, p_id, rec ->> 'number', 'Step ' || (cur + 1) || ' approved', 'Sent to step ' || (cur + 2) || ' – ' || coalesce(stg -> (cur + 1) ->> 'label', ''));
    for a in select jsonb_array_elements_text(stg -> (cur + 1) -> 'ids') loop
      perform note(a, typ, p_id, lbl || ' (' || (rec ->> 'currency') || ' ' || to_char((rec ->> 'total')::numeric, 'FM999,999,999,990.00') || ') needs your approval – step ' || (cur + 2) || ' of ' || nst);
      perform note(p.delegate_to, typ, p_id, lbl || ' needs your approval on behalf of ' || p.name || ' – step ' || (cur + 2) || ' of ' || nst)
        from app_users p where p.id = a and p.delegate_to is not null and (p.delegate_until is null or p.delegate_until >= current_date);
    end loop;
  elsif res = 'rejected' then
    perform audit(typ, p_id, rec ->> 'number', 'Rejected (final)', 'Rejected by ' || u.name);
    for a in select jsonb_array_elements_text(rec -> 'approver_ids') loop if a <> u.id then perform note(a, typ, p_id, (rec ->> 'number') || ' was rejected — no further action needed'); end if; end loop;
  elsif res = 'approved' then
    if st = 'review' then
      perform audit(typ, p_id, rec ->> 'number', 'Fully approved', 'Sent to Finance for review before release');
      perform note_role('finance', typ, p_id, (rec ->> 'number') || ' is approved and needs your review before release');
    else
      perform audit(typ, p_id, rec ->> 'number', 'Fully approved', '');
      perform release_notes(p_table, p_id);
    end if;
  end if;
end $$;

-- who hears about a record once it is released (after approval, and review if on)
create or replace function release_notes(p_table text, p_id text) returns void language plpgsql security definer set search_path = public as $$
declare r requisitions; p purchase_orders; c contracts; f record;
begin
  if p_table = 'requisitions' then
    select * into r from requisitions where id = p_id;
    perform audit(case when r.kind='expense' then 'expense' else 'requisition' end, r.id, r.number, 'Released', case when r.kind = 'purchase' then 'Released to Procurement to source and raise a purchase order' else 'Released to Finance for payment' end);
    perform note(r.created_by, 'requisition', r.id, r.number || ' is approved');
    perform note_role(case when r.kind = 'purchase' then 'procurement' else 'finance' end, 'requisition', r.id, r.number || case when r.kind = 'purchase' then ' is approved — ready for sourcing / PO' else ' is approved and ready for payment' end);
  elsif p_table = 'purchase_orders' then
    select * into p from purchase_orders where id = p_id;
    perform audit('po', p.id, p.number, 'Purchase order issued', '');
    perform note(p.created_by, 'po', p.id, 'Purchase order ' || p.number || ' issued');
    perform note(u.id, 'po', p.id, 'Purchase order ' || p.number || ' has been issued to you') from app_users u where u.role = 'supplier' and u.supplier_id = p.supplier_id and u.active;
  elsif p_table = 'contracts' then
    select * into c from contracts where id = p_id;
    perform note(c.created_by, 'contract', c.id, c.number || ' – ' || c.title || ' is approved and active');
  end if;
end $$;

-- =====================================================================
-- THE FINANCE REVIEW ACTION (after approval, before release)
-- =====================================================================
create or replace function review_record(p_table text, p_id text, p_ok boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare u app_users := me(); rec jsonb; typ text; st text;
begin
  if p_table not in ('requisitions','purchase_orders') then raise exception 'Not supported'; end if;
  if u.role not in ('finance','admin') then raise exception 'Only Finance can review'; end if;
  if not p_ok and coalesce(trim(p_note),'') = '' then raise exception 'Say what needs fixing'; end if;
  execute format('select to_jsonb(t) from %I t where id = $1 for update', p_table) into rec using p_id;
  if rec is null or rec ->> 'status' <> 'review' then raise exception 'This is not waiting for review'; end if;
  st := case when not p_ok then 'rejected' when p_table = 'requisitions' then 'approved' else 'issued' end;
  perform set_config('app.via_engine','1',true);
  execute format('update %I set status = $1, reviewed_by = $2, reviewed_by_name = $3, reviewed_at = now(), review_note = $4 where id = $5', p_table) using st, u.id, u.name, coalesce(p_note,''), p_id;
  perform set_config('app.via_engine','',true);
  typ := case p_table when 'requisitions' then case when rec ->> 'kind' = 'expense' then 'expense' else 'requisition' end else 'po' end;
  perform audit(typ, p_id, rec ->> 'number', case when p_ok then 'Reviewed and released' else 'Returned by review' end, coalesce(p_note,''));
  if p_ok then perform release_notes(p_table, p_id);
  else perform note(rec ->> 'created_by', typ, p_id, (rec ->> 'number') || ' was returned by ' || u.name || ' at review: ' || p_note); end if;
end $$;
grant execute on function decide_record(text,text,text,text) to authenticated;
grant execute on function review_record(text,text,boolean,text) to authenticated;

-- =====================================================================
-- REQUESTS (stores / service requests) and SCHEDULES
-- =====================================================================
create or replace function guard_rq_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin
  if u.id is null or u.role = 'supplier' then raise exception 'You cannot create requests'; end if;
  if new.status not in ('draft','pending') then new.status := 'draft'; end if;
  if new.parent_id is null then new.created_by := u.id;
  else
    select created_by into new.created_by from requests where id = new.parent_id and status = 'scheduled';
    if new.created_by is null then raise exception 'That schedule does not exist'; end if;
    if u.role not in ('procurement','admin') and u.id <> new.created_by then raise exception 'Only the schedule owner or Procurement can run it'; end if;
    new.status := 'pending';
  end if;
  new.number := 'RQ-' || lpad(nextval('seq_rq')::text,5,'0'); new.created_at := now();
  return new;
end $$;
drop trigger if exists trg_rq_insert on requests; create trigger trg_rq_insert before insert on requests for each row execute function guard_rq_insert();

create or replace function guard_rq_update() returns trigger language plpgsql security definer set search_path = public as $$
declare u app_users := me();
begin
  if new.id <> old.id or new.number <> old.number or new.created_by <> old.created_by then raise exception 'Record identity cannot be changed'; end if;
  if via_engine() or u.role in ('procurement','admin') then return new; end if;
  if u.id = old.created_by then
    if new.status = old.status and old.status in ('draft','scheduled') then return new; end if;
    if (old.status, new.status) in (('draft','pending'),('draft','scheduled'),('pending','cancelled'),('scheduled','cancelled')) then return new; end if;
  end if;
  if u.id = old.assigned_to and old.status = 'open' and new.status in ('open','completed') and (new.items, new.title) is not distinct from (old.items, old.title) then return new; end if;
  raise exception 'You cannot make this change to the request';
end $$;
drop trigger if exists trg_rq_update on requests; create trigger trg_rq_update before update on requests for each row execute function guard_rq_update();

-- creates due requests from every active schedule; the app calls it when someone opens it
create or replace function run_schedules() returns int language plpgsql security definer set search_path = public as $$
declare t requests; made int := 0; nr requests; guard int;
begin
  perform set_config('app.via_engine','1',true);
  for t in select * from requests where status = 'scheduled' and next_run is not null and next_run <= current_date for update skip locked loop
    guard := 0;
    while t.next_run <= current_date and guard < 6 loop
      insert into requests (title, description, type, category_id, department, branch_id, items, needed_by, priority, status, parent_id, created_by)
      values (t.title || ' – ' || to_char(t.next_run,'DD Mon YYYY'), 'Created automatically from schedule ' || t.number || '.', t.type, t.category_id, t.department, t.branch_id, t.items, t.next_run, t.priority, 'pending', t.id, t.created_by)
      returning * into nr;
      perform audit('request', nr.id, nr.number, 'Created from schedule', t.number);
      perform note(t.created_by, 'request', nr.id, 'New request ' || nr.number || ' created from schedule ' || t.number);
      perform note_role('procurement', 'request', nr.id, 'New request ' || nr.number || ' – ' || nr.title);
      t.next_run := t.next_run + case t.recurrence when 'weekly' then 7 when 'quarterly' then 91 else 30 end;
      made := made + 1; guard := guard + 1;
    end loop;
    update requests set next_run = t.next_run where id = t.id;
  end loop;
  perform set_config('app.via_engine','',true);
  return made;
end $$;
grant execute on function run_schedules() to authenticated;

-- =====================================================================
-- APPROVAL REMINDERS & ESCALATION (Settings → reminders). Safe to run often: every person is reminded at most once per
-- reminder interval, and each approval step is escalated once. Pera runs it when someone opens the app; schedule it hourly
-- with Supabase → Database → Cron (select run_reminders();) so reminders go out even when nobody logs in.
-- =====================================================================
create or replace function run_reminders() returns int language plpgsql security definer set search_path = public as $$
declare s jsonb; cfg jsonb; rh numeric; eh numeric; esc_to jsonb; t text; rec jsonb; stg jsonb; cur int; i int; k int; started timestamptz; hrs numeric;
        a text; sent int := 0; typ text; lbl text; key text; names text;
begin
  select value into s from settings where id = 1;
  cfg := coalesce(s -> 'reminders', '{}');
  if coalesce((cfg ->> 'enabled')::boolean, true) = false then return 0; end if;
  rh := coalesce(nullif(cfg ->> 'reminder_hours','')::numeric, 24); eh := coalesce(nullif(cfg ->> 'escalate_hours','')::numeric, 72);
  for t, rec in
      select 'requisitions', to_jsonb(x) from requisitions x where x.status = 'pending'
      union all select 'purchase_orders', to_jsonb(x) from purchase_orders x where x.status = 'pending_approval'
      union all select 'contracts', to_jsonb(x) from contracts x where x.status = 'pending' loop
    stg := case when jsonb_array_length(coalesce(rec -> 'stages','[]')) > 0 then rec -> 'stages'
                else jsonb_build_array(jsonb_build_object('label', coalesce(rec ->> 'tier_label','Approval'), 'ids', coalesce(rec -> 'approver_ids','[]'),
                       'required', least(coalesce((rec ->> 'approvals_required')::int,1), jsonb_array_length(coalesce(rec -> 'approver_ids','[]'))))) end;
    continue when jsonb_array_length(stg -> 0 -> 'ids') = 0;
    cur := null;
    for i in 0 .. jsonb_array_length(stg) - 1 loop
      select count(*) into k from jsonb_array_elements(coalesce(rec -> 'approvals','[]')) x
        where coalesce((x ->> 'stage')::int, 0) = i and x ->> 'decision' = 'approved' and (stg -> i -> 'ids') ? (x ->> 'approver_id');
      if k < (stg -> i ->> 'required')::int then cur := i; exit; end if;
    end loop;
    continue when cur is null;
    started := coalesce((select max((x ->> 'at')::timestamptz) from jsonb_array_elements(coalesce(rec -> 'approvals','[]')) x
                          where cur > 0 and coalesce((x ->> 'stage')::int, 0) = cur - 1 and x ->> 'decision' = 'approved'),
                        (rec ->> 'submitted_at')::timestamptz, (rec ->> 'created_at')::timestamptz);
    hrs := extract(epoch from now() - started) / 3600;
    typ := case t when 'requisitions' then case when rec ->> 'kind' = 'expense' then 'expense' else 'requisition' end when 'purchase_orders' then 'po' else 'contract' end;
    lbl := (rec ->> 'number') || ' – ' || coalesce(rec ->> 'title', 'purchase order');
    if rh > 0 and hrs >= rh then
      for a in select jsonb_array_elements_text(stg -> cur -> 'ids') loop
        continue when exists (select 1 from jsonb_array_elements(coalesce(rec -> 'approvals','[]')) x where x ->> 'approver_id' = a and coalesce((x ->> 'stage')::int, 0) = cur);
        continue when exists (select 1 from notifications n where n.user_id = a and n.entity_id = rec ->> 'id' and n.message like 'Reminder:%'
                                and n.at >= started and n.at > now() - make_interval(secs => (rh * 3600)::double precision));
        perform note(a, typ, rec ->> 'id', 'Reminder: ' || lbl || ' has been waiting ' || round(hrs) || ' h for your approval');
        perform note(p.delegate_to, typ, rec ->> 'id', 'Reminder: ' || lbl || ' has been waiting ' || round(hrs) || ' h for approval by ' || p.name || ' (delegated to you)')
          from app_users p where p.id = a and p.delegate_to is not null and (p.delegate_until is null or p.delegate_until >= current_date);
        sent := sent + 1;
      end loop;
    end if;
    if eh > 0 and hrs >= eh then
      key := 'Escalated: ' || (rec ->> 'number') || ' step ' || (cur + 1);
      if not exists (select 1 from notifications n where n.entity_id = rec ->> 'id' and n.message like key || ' %') then
        esc_to := coalesce(cfg -> 'escalate_to', '[]');
        if jsonb_array_length(esc_to) = 0 then select coalesce(jsonb_agg(id), '[]') into esc_to from app_users where role = 'admin' and active; end if;
        select string_agg(name, ', ') into names from app_users where (stg -> cur -> 'ids') ? id;
        for a in select jsonb_array_elements_text(esc_to) union select rec ->> 'created_by' loop
          perform note(a, typ, rec ->> 'id', key || ' – ' || lbl || ' has waited ' || round(hrs) || ' h for ' || coalesce(names, 'its approvers'));
        end loop;
        perform set_config('app.system_actor', '1', true);
        insert into audit_log(entity_type, entity_id, entity_number, action, details, user_name)
          values (typ, rec ->> 'id', rec ->> 'number', 'Escalated', 'Step ' || (cur + 1) || ' (' || coalesce(stg -> cur ->> 'label','Approval') || ') waited ' || round(hrs) || ' h', 'Pera (automatic)');
        perform set_config('app.system_actor', '', true);
        sent := sent + 1;
      end if;
    end if;
  end loop;
  return sent;
end $$;
grant execute on function run_reminders() to authenticated;

-- =====================================================================
-- SUPPLIERS & BIDS
-- =====================================================================
create or replace function guard_supplier_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if my_role() = 'supplier' and (to_jsonb(new) - 'documents' - 'updated_at') is distinct from (to_jsonb(old) - 'documents' - 'updated_at') then raise exception 'Suppliers can only upload documents'; end if;
  if my_role() not in ('supplier','procurement','admin') and (to_jsonb(new) - 'reviews' - 'updated_at') is distinct from (to_jsonb(old) - 'reviews' - 'updated_at') then raise exception 'Only Procurement can change supplier details'; end if;
  if jsonb_array_length(new.reviews) < jsonb_array_length(old.reviews) then raise exception 'Reviews cannot be removed'; end if;
  if new.bank_details is distinct from old.bank_details then   -- payment-fraud control
    perform note_role('finance', 'supplier', new.id, 'Bank details for ' || new.name || ' were changed by ' || coalesce((me()).name,'someone') || ' - confirm them with the supplier before the next payment');
    perform audit('supplier', new.id, new.name, 'Bank details changed', 'Finance alerted');
  end if;
  return new;
end $$;
drop trigger if exists trg_sup_update on suppliers; create trigger trg_sup_update before update on suppliers for each row execute function guard_supplier_update();

create or replace function guard_bid() returns trigger language plpgsql security definer set search_path = public as $$
declare q rfqs;
begin
  select * into q from rfqs where id = new.rfq_id;
  if my_role() = 'supplier' then
    if new.supplier_id <> my_supplier() then raise exception 'You can only bid for your own company'; end if;
    if not (q.invited_ids ? new.supplier_id) then raise exception 'Your company was not invited to this RFQ'; end if;
    if q.status <> 'open' or q.closing_at <= now() then raise exception 'Bidding has closed'; end if;
    new.submitted_at := now();
    if tg_op = 'UPDATE' then new.technical_score := old.technical_score; else new.technical_score := 0; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bid on bids; create trigger trg_bid before insert or update on bids for each row execute function guard_bid();

-- an item can only be deleted if it has never been used
create or replace function guard_item_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from stock_moves where item_id = old.id)
     or exists (select 1 from requests r, jsonb_array_elements(r.items) i where i ->> 'item_id' = old.id)
     or exists (select 1 from requisitions r, jsonb_array_elements(r.lines) l where lower(l ->> 'description') = lower(old.name)) then
    raise exception 'This item has been used, so it cannot be deleted — deactivate it instead'; end if;
  return old;
end $$;
drop trigger if exists trg_item_delete on items; create trigger trg_item_delete before delete on items for each row execute function guard_item_delete();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['app_users','settings','categories','suppliers','items','budgets','contracts','requisitions','plan_lines','requests','rfqs','bids','purchase_orders','receipts','invoices','stock_moves','comments','audit_log','notifications'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

create policy users_read on app_users for select to authenticated using (is_member() or id = (me()).id);
create policy users_ins  on app_users for insert to authenticated with check (my_role() = 'admin' or (my_role() = 'procurement' and role = 'supplier'));
create policy users_upd  on app_users for update to authenticated using (my_role() = 'admin' or id = (me()).id);
create policy settings_read on settings for select to authenticated using ((me()).id is not null);
create policy settings_upd  on settings for update to authenticated using (my_role() = 'admin');

create policy cat_read on categories for select to authenticated using ((me()).id is not null);
create policy cat_ins  on categories for insert to authenticated with check (my_role() in ('procurement','finance','admin'));
create policy cat_upd  on categories for update to authenticated using (my_role() in ('procurement','finance','admin'));
create policy cat_del  on categories for delete to authenticated using (my_role() in ('procurement','finance','admin'));   -- foreign keys block deleting a used category
create policy itm_read on items for select to authenticated using ((me()).id is not null);
create policy itm_ins  on items for insert to authenticated with check (my_role() in ('procurement','finance','admin'));
create policy itm_upd  on items for update to authenticated using (my_role() in ('procurement','finance','admin'));
create policy itm_del  on items for delete to authenticated using (my_role() in ('procurement','finance','admin'));
create policy stk_read on stock_moves for select to authenticated using (is_member());
create policy stk_ins  on stock_moves for insert to authenticated with check (is_member());
create policy sup_read on suppliers for select to authenticated using (is_member() or id = my_supplier());
create policy sup_ins  on suppliers for insert to authenticated with check (my_role() in ('procurement','admin'));
create policy sup_upd  on suppliers for update to authenticated using (is_member() or id = my_supplier());
create policy sup_del  on suppliers for delete to authenticated using (my_role() in ('procurement','admin'));  -- foreign keys block deleting a used supplier
create policy bud_read on budgets for select to authenticated using (is_member());
create policy bud_ins  on budgets for insert to authenticated with check (my_role() in ('finance','admin'));
create policy bud_upd  on budgets for update to authenticated using (my_role() in ('finance','admin'));
create policy pl_read  on plan_lines for select to authenticated using (is_member());
create policy pl_ins   on plan_lines for insert to authenticated with check (my_role() in ('procurement','finance','admin'));
create policy pl_upd   on plan_lines for update to authenticated using (is_member());
create policy ct_read  on contracts for select to authenticated using (is_member());
create policy ct_ins   on contracts for insert to authenticated with check (my_role() in ('procurement','admin'));
create policy ct_upd   on contracts for update to authenticated using (my_role() in ('procurement','admin'));

create policy req_read on requisitions for select to authenticated using (is_staff() or created_by = (me()).id);
create policy req_ins  on requisitions for insert to authenticated with check (is_member());
create policy req_upd  on requisitions for update to authenticated using (created_by = (me()).id or my_role() in ('procurement','finance','admin'));

create policy rq_read on requests for select to authenticated using (is_staff() or created_by = (me()).id or assigned_to = (me()).id);
create policy rq_ins  on requests for insert to authenticated with check (is_member());
create policy rq_upd  on requests for update to authenticated using (created_by = (me()).id or assigned_to = (me()).id or my_role() in ('procurement','admin'));

create policy rfq_read on rfqs for select to authenticated using (is_staff() or (invited_ids ? my_supplier()));
create policy rfq_ins  on rfqs for insert to authenticated with check (my_role() in ('procurement','admin'));
create policy rfq_upd  on rfqs for update to authenticated using (my_role() in ('procurement','admin'));
create policy bid_read on bids for select to authenticated using (supplier_id = my_supplier()
  or (is_staff() and exists (select 1 from rfqs q where q.id = rfq_id and (not q.sealed or q.status <> 'open' or q.closing_at <= now()))));
create policy bid_ins on bids for insert to authenticated with check (my_role() in ('procurement','admin') or supplier_id = my_supplier());
create policy bid_upd on bids for update to authenticated using (my_role() in ('procurement','admin') or supplier_id = my_supplier());

create policy po_read on purchase_orders for select to authenticated using (is_staff()
  or (supplier_id = my_supplier() and status in ('issued','partially_received','received','closed'))
  or req_id in (select id from requisitions where created_by = (me()).id));
create policy po_ins  on purchase_orders for insert to authenticated with check (my_role() in ('procurement','admin'));
create policy po_upd  on purchase_orders for update to authenticated using (my_role() in ('procurement','finance','admin') or req_id in (select id from requisitions where created_by = (me()).id));
create policy grn_read on receipts for select to authenticated using (is_staff() or po_id in (select p.id from purchase_orders p join requisitions r on r.id = p.req_id where r.created_by = (me()).id));
create policy grn_ins  on receipts for insert to authenticated with check (my_role() in ('procurement','admin') or po_id in (select p.id from purchase_orders p join requisitions r on r.id = p.req_id where r.created_by = (me()).id));
create policy inv_read on invoices for select to authenticated using (is_staff() or supplier_id = my_supplier());
create policy inv_ins  on invoices for insert to authenticated with check (my_role() in ('finance','admin') or supplier_id = my_supplier());
create policy inv_upd  on invoices for update to authenticated using (my_role() in ('finance','admin'));

create policy cm_read on comments for select to authenticated using (is_staff() or user_id = (me()).id
  or entity_id in (select id from requisitions where created_by = (me()).id)
  or entity_id in (select id from requests where created_by = (me()).id or assigned_to = (me()).id)
  or entity_id in (select id from purchase_orders where supplier_id = my_supplier() or req_id in (select id from requisitions where created_by = (me()).id))
  or entity_id in (select id from rfqs where invited_ids ? my_supplier()));
create policy cm_ins  on comments for insert to authenticated with check ((me()).id is not null);
create policy audit_read on audit_log for select to authenticated using (is_staff() or entity_id in (select id from requisitions where created_by = (me()).id) or entity_id in (select id from requests where created_by = (me()).id));
create policy audit_ins  on audit_log for insert to authenticated with check ((me()).id is not null);
create policy note_read on notifications for select to authenticated using (user_id = (me()).id);
create policy note_ins  on notifications for insert to authenticated with check ((me()).id is not null);
create policy note_upd  on notifications for update to authenticated using (user_id = (me()).id);
-- No delete policies on transactions, comments or the audit trail: they can never be deleted.

-- =====================================================================
-- FILES (private bucket, no deletes) & LIVE UPDATES
-- =====================================================================
insert into storage.buckets (id, name, public) values ('pera-files','pera-files',false) on conflict (id) do nothing;
create policy pera_files_read on storage.objects for select to authenticated using (bucket_id = 'pera-files');
create policy pera_files_add  on storage.objects for insert to authenticated with check (bucket_id = 'pera-files');
alter publication supabase_realtime add table requisitions, requests, rfqs, bids, purchase_orders, receipts, invoices, contracts, comments, notifications, audit_log;

-- =====================================================================
-- STARTING DATA (edit freely)
-- =====================================================================
insert into categories (name, type) values ('IT equipment & software','item'),('Office supplies & stationery','item'),('Facilities & maintenance','item'),('Travel & accommodation','item'),
  ('Fleet & fuel','item'),('Marketing & advertising','item'),('Professional services','item'),('Capital projects','item'),('Petty cash & sundry','item'),('Security services','item'),
  ('Manufacturer','supplier'),('Distributor / wholesaler','supplier'),('Service provider','supplier'),('Contractor','supplier'),('Consultant','supplier');

insert into app_users (id, name, email, role, department, title, branch_id)
values ('admin-1','System Administrator','moyos@zimnat.co.zw','admin','Procurement','Administrator','br-hq') on conflict do nothing;

insert into settings (id, value) values (1, jsonb_build_object(
  'company','Your Company Ltd', 'base_currency','USD', 'fiscal_year', extract(year from now())::int,
  'currencies', '[{"code":"USD","rate":1}]'::jsonb,
  'departments', '["Executive","Finance","Operations","IT","Human Resources","Marketing","Sales","Procurement"]'::jsonb,
  'branches', '[{"id":"br-hq","name":"Head Office"}]'::jsonb,
  'approval_tiers', '[{"label":"Small","max":1000,"approver_ids":["admin-1"],"required":1},{"label":"Medium","max":10000,"approver_ids":["admin-1"],"required":1},{"label":"Large","max":null,"approver_ids":["admin-1"],"required":1}]'::jsonb,
  'po_approval', '{"enabled":true,"approver_ids":["admin-1"],"required":1}'::jsonb,
  'contract_approval', '{"enabled":true,"approver_ids":["admin-1"],"required":1}'::jsonb,
  'review_enabled', true, 'reject_rule','veto', 'quotes_threshold',5000, 'quotes_required',3, 'require_documents',true, 'approved_suppliers_only',true,
  'require_grn',true, 'match_tolerance_pct',2, 'expiry_warning_days',60, 'delivery_address','',
  'po_terms','Payment within 30 days of a valid tax invoice quoting this PO number.',
  'support', '{"email":"","phone":"","hours":"Monday to Friday, 08:00–17:00"}'::jsonb,
  'budget_control','warn', 'brand', '{}'::jsonb, 'sso', '{"auto_provision":false,"domains":[]}'::jsonb
)) on conflict (id) do nothing;


-- =====================================================================
-- TAMPER-EVIDENT AUDIT TRAIL (Pera)
-- Every entry stores the SHA-256 of the previous entry, so altering or
-- deleting any past entry breaks the chain. audit_verify() checks it.
-- =====================================================================
alter table audit_log add column if not exists seq bigserial;
alter table audit_log add column if not exists prev_hash text;
alter table audit_log add column if not exists hash text;
create or replace function audit_payload(p_prev text, p_seq bigint, p_at timestamptz, p_user text, p_type text, p_id text, p_number text, p_action text, p_details text) returns text
language sql immutable as $$
  select p_prev || '|' || p_seq || '|' || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || coalesce(p_user,'') || '|' || coalesce(p_type,'') || '|' ||
         coalesce(p_id,'') || '|' || coalesce(p_number,'') || '|' || coalesce(p_action,'') || '|' || coalesce(p_details,'') $$;
create or replace function audit_chain() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(7212026);                       -- one link at a time
  select hash into prev from audit_log order by seq desc limit 1;
  new.prev_hash := coalesce(prev, 'GENESIS');
  new.hash := encode(digest(audit_payload(new.prev_hash, new.seq, new.at, new.user_id, new.entity_type, new.entity_id, new.entity_number, new.action, new.details), 'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists trg_zchain_audit on audit_log; create trigger trg_zchain_audit before insert on audit_log for each row execute function audit_chain();
create or replace function audit_immutable() returns trigger language plpgsql as $$ begin raise exception 'The audit trail cannot be changed or deleted'; end $$;
drop trigger if exists trg_audit_immutable on audit_log; create trigger trg_audit_immutable before update or delete on audit_log for each row execute function audit_immutable();
create or replace function audit_verify() returns table(ok boolean, entries bigint, broken_at bigint) language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; prev text := null; n bigint := 0;
begin
  if not is_staff() then raise exception 'Only staff can verify the audit trail'; end if;
  for r in select * from audit_log where hash is not null order by seq loop
    n := n + 1;
    if (prev is not null and r.prev_hash is distinct from prev)
       or r.hash is distinct from encode(digest(audit_payload(r.prev_hash, r.seq, r.at, r.user_id, r.entity_type, r.entity_id, r.entity_number, r.action, r.details), 'sha256'), 'hex') then
      ok := false; entries := n; broken_at := r.seq; return next; return; end if;
    prev := r.hash;
  end loop;
  ok := true; entries := n; broken_at := null; return next;
end $$;
grant execute on function audit_verify() to authenticated;

-- =====================================================================
-- MICROSOFT SIGN-IN: add staff automatically on first sign-in (optional)
-- Settings -> Branding & sign-in -> "add new staff automatically" + domains.
-- New people join as Requisitioners; administrators set roles and branches.
-- =====================================================================
create or replace function provision_me() returns boolean language plpgsql security definer set search_path = public as $$
declare em text := lower(auth.jwt() ->> 'email'); st jsonb; dom text; nm text;
begin
  if em is null or (me()).id is not null then return false; end if;
  if exists (select 1 from app_users where lower(email) = em) then return false; end if;    -- deactivated people stay out
  select value into st from settings where id = 1;
  if not coalesce((st -> 'sso' ->> 'auto_provision')::boolean, false) then return false; end if;
  dom := split_part(em, '@', 2);
  if not exists (select 1 from jsonb_array_elements_text(coalesce(st -> 'sso' -> 'domains', '[]')) d where lower(d) = dom) then return false; end if;
  nm := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name', split_part(em, '@', 1));
  insert into app_users(name, email, role) values (nm, em, 'requisitioner');
  perform audit('user', null, nm, 'User added by Microsoft sign-in', em);
  return true;
end $$;
grant execute on function provision_me() to authenticated;
