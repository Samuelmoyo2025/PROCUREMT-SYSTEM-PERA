# Pera

*Procure-to-pay with approvals — a product of **HeartPath Solutions**. Build. Automate. Transform.*

Procure-to-pay with approvals, for any organisation. Every payment starts as a requisition or an
expense claim with supporting documents, and goes to the right executives for approval. Finance
reviews it, Procurement sources and orders it, the requester confirms delivery, and Finance pays
against a matched invoice. Every step is written to an audit trail that can't be edited or deleted.

## What's in the box

| File | What it is |
|---|---|
| `index.html` | The complete app. Runs in demo mode (a sample company) until you add Supabase keys. |
| `supabase/schema.sql` | Database tables, workflow rules, security policies, file bucket and starting data. |
| `supabase/functions/notify/index.ts` | Emails every in-app notification. |
| `brand/` | `pera-mark.svg` (the Pera product icon) and the HeartPath Solutions company logo: the icon on its own and the full logo (dark, light and transparent), as SVG and PNG. |
| `src/` + `build.sh` | The source, split into parts. Edit these, then run `./build.sh` to rebuild `index.html`. |

## What's new in Pera (compared with HeartPath)

| Area | What changed |
|---|---|
| **Look** | Colours after Coupa:<br>• navy `#081D4D` for the menu and text<br>• Coupa blue `#1565C0` for links<br>• sky `#5FD6FF` for main buttons, with navy text<br>• cyan `#12C6F3` for highlights<br>• Poppins headings, and a navy-to-blue sign-in page. |
| **Per-client branding** | Settings → *Branding & sign-in*: upload the client's logo and pick their brand colour. The whole app re-colours, and text contrast is chosen automatically. For the sign-in page before anyone logs in, set `CONFIG.BRAND` in `src/1-head.html`. |
| **Microsoft sign-in** | "Sign in with Microsoft" (Entra ID / Office 365) through Supabase Auth. Optionally, staff from approved email domains are added automatically on their first sign-in, as Requisitioners. `CONFIG.PASSWORD_LOGIN = false` gives Microsoft-only sign-in. |
| **No self-approval** | Whoever raises a requisition, expense, purchase order or contract is removed from its approval route. They can't approve it, in the app or directly in the database. |
| **Delegation** | User menu → *Out of office*: hand your approvals to a colleague until a date. Their decisions are recorded as "approved on behalf of …". |
| **Hard budget cap** | Settings → *When a requisition would exceed its budget line*: choose to warn, or block the submission. The database enforces the block. |
| **File fingerprints** | Every upload gets a SHA-256 fingerprint. The fingerprint is re-checked each time the file is opened, and any change is flagged and logged. |
| **Tamper-evident audit trail** | Each audit entry carries the SHA-256 of the entry before it. Entries can't be edited or deleted, even by the database owner. *Audit trail → Verify integrity* checks the whole chain. |
| **Payment-fraud alert** | Changing a supplier's bank details notifies Finance and is written to the audit trail. |
| **Robustness** | Pera no longer freezes on locked-down browsers whose local storage never responds. The page now declares UTF-8, so text displays correctly on any web server. |
| **Notifications centre** | User menu or bell → *See all notifications*:<br>• grouped by day, with All / Unread / Viewed tabs, search and a type filter;<br>• chips count what is unread by type (Approvals, Purchasing, Payments…);<br>• mark each one read or unread, remove one (×), remove viewed, or remove all.<br>Removing only hides a notification from your list; nothing is deleted. |
| **My profile** | User menu → *My profile*:<br>• profile picture, job title and phone number;<br>• colour theme (light, dark or match the computer) and which dashboard view opens first;<br>• **Email & alerts**: choose which kinds of notification are also emailed, plus desktop pop-ups and a reminder before supplier documents expire. Security alerts are always emailed;<br>• **Password & security**: change password (10+ characters, any symbols allowed) and sign out on all devices. |
| **Manage company** (administrators) | User menu → *Manage company*:<br>• **Users**: Active / Pending (never signed in) / Inactive tabs, search and filters, last sign-in, and a warning for logins unused for 90+ days. One person can cover several departments. Deactivate, reactivate and export to CSV;<br>• **Departments**: codes, date added, people and record counts, Active / Inactive tabs, export to CSV. A department that is used on records keeps its name for the audit trail; its code can still change. |
| **Approval steps and pools** | Settings → *Approval rules*: each tier can have several steps, for example "any 1 of the executives", then "the CFO".<br>• Step 2 is asked only after step 1 approves, and only that step's approvers are notified.<br>• A step that needs fewer approvals than it has people is a pool. The requisition shows "Any 1 of 3", who approved, and who was not needed.<br>• Nobody can be in two steps of the same tier, so nobody approves the same request twice. Single-step tiers work exactly as before. |
| **Purchaser assigned** | Settings → *Default purchaser* is assigned to purchase requisitions when they are submitted. Procurement can reassign it with ✎ on the requisition, and the new purchaser is notified. Requisitions have a Purchaser column and filter. Only Procurement can change it; the database enforces this. |
| **Addresses** | *Manage company → Addresses*: delivery addresses (where goods go) and distribution addresses (where invoices go), each with a default. Requisitions pick both. Purchase orders start from the requisition's delivery address, or you can pick another saved address. |
| **Paying accounts** | *Manage company → Paying accounts*: the company's own FCA, current and petty-cash accounts. A requisition says which account pays, Finance confirms it when recording the payment, and the payment file includes the account name, number and GL code. No more bank accounts set up as "items". |
| **Duplicate check** | When a requisition is submitted, Pera looks for others from the last 45 days with the same amount and the same or a similar supplier, payee or name (for example "HUJEEN INVESTMENTS" and "HUJEEN IVESTMENTS"). The requester must confirm it is not a duplicate and say why. Approvers see the warning, the matches and the requester's note. |
| **Due-date check** | A requisition can't be submitted with a due date that has already passed. The database enforces this too. |
| **Bank details in notes** | If the justification contains bank details, Pera warns:<br>• **red** when they don't match the supplier's verified record;<br>• **amber** when there is no supplier record to check them against.<br>The warning appears in the form, on the requisition and in the payment form. The payment file uses only verified supplier bank details, never the notes. |
| **Requisition PDF** | The **PDF** button on a requisition prints it, or saves it as a PDF, with a company header, details, lines, approvals by step and the audit trail. The file is named after the requisition, and printing is recorded in the audit trail. |
| **Reminders and escalation** | Settings → *Approval rules → Approval reminders & escalation*:<br>• approvers are reminded every N hours while a step waits for them (default 24);<br>• after M hours at one step (default 72), it is escalated: the chosen people (or all administrators) and the requester are told, and the audit trail records it as "Pera (automatic)".<br>Every pending approval shows how long it has waited (grey, then amber after the reminder time, red after escalation). Reminders never repeat within the interval, and each step is escalated only once. |
| **Approve without digging** | • **One-screen approval**: amount, warnings, justification, lines, documents and budget on one page, with Approve and Reject. Afterwards, *Next waiting* goes straight to the next one.<br>• **From a notification**: approval notifications have Review, Reject and Approve buttons.<br>• **Several at once**: tick records in My approvals → *Approve selected*. Possible duplicates and unverified bank details are flagged "Check first" and left out unless ticked.<br>• **From email**: approval emails have a *Review & approve* button that opens the one-screen approval. The person still signs in, so a forwarded email can't approve anything. |
| **Modules** | Settings → *Modules*: switch expense claims, requests, contracts, RFQs, procurement plan, budgets, inventory, Smart scan and the supplier portal on or off per client. Switching one off hides it everywhere (menus, forms, buttons, pages) and deletes nothing. Requisitions, approvals, orders, deliveries, invoices, payments, suppliers, items, reports and the audit trail are always on. |
| **Setup wizard** | A brand-new installation opens a 4-step wizard for the client administrator:<br>1. your account;<br>2. company, currencies, departments with codes, branches and head-office address;<br>3. people, their roles, who approves, and modules;<br>4. a summary, then **Activate**.<br>In demo mode, try it from the user menu → *Set up a new company*. |
| **Create account** | The sign-in page has *Create your account* (for people the administrator has added, using the same work email) and *Need the verification email sent again?*. |
| **Sign-in page** | Show/hide password, *Forgot your password?* (the reply never reveals whether an email has an account), a confirmation after signing out, and the reset link opens straight on *Set a new password*. |

## Selling Pera: setting up a new client

Each client gets **their own Supabase project**, so their data is completely separate from other clients'.

1. **Create the client's Supabase project.** Choose the region closest to them.
2. **Run the schema.** In `supabase/schema.sql`, replace both `CHANGE-ME@yourcompany.com` with the client administrator's email. Then run the file in the SQL Editor.
3. **Make the client's copy of the app.** In `src/1-head.html`:
   - set `SUPABASE_URL` and `SUPABASE_ANON_KEY`;
   - set `BRAND.client` (the client's name), and `BRAND.logo` (a logo URL or data URL) and `BRAND.color` if they want their own colours;
   - set `MICROSOFT_SSO: true` if they use Office 365.
   Then run `./build.sh`.
4. **Host it.** Use Vercel, Netlify, Azure Static Web Apps or the client's own web server, on its own address, for example `pera.client.co.zw`.
5. **Set up email.** Deploy the `notify` function with the client's sender address. See "Go live" below.
6. **Hand over.** The client administrator signs in and works through Settings:
   - company and currencies;
   - departments and branches;
   - approval tiers, and the PO and contract approvers;
   - the Finance review step and budget control;
   - branding, Microsoft sign-in and users.

## Microsoft sign-in (Entra ID / Office 365)

1. **Register the app in Microsoft Entra.** Go to Azure portal → *Microsoft Entra ID* → *App registrations* → *New registration*.
   - Name: `Pera`.
   - Supported account types: *Accounts in this organizational directory only*.
   - Redirect URI (Web): `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Create a client secret.** Under *Certificates & secrets*, create a new client secret and copy its **Value**.
3. **Copy the IDs.** On the app's *Overview* page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. **Add the email claim.** Under *Token configuration*, add the optional claim `email` to the ID token, so Pera can match people by email.
5. **Turn on the Azure provider in Supabase.** In Supabase → *Authentication* → *Sign In / Providers* → **Azure**, turn it on and enter:
   - Client ID: the Application (client) ID;
   - Secret: the secret Value;
   - Azure Tenant URL: `https://login.microsoftonline.com/<Directory (tenant) ID>`.
   The tenant URL means only that organisation's accounts can sign in.
6. **Allow Pera's address.** In Supabase → *Authentication* → *URL Configuration*, set the **Site URL** to the address where Pera is hosted, and add it to **Redirect URLs**.
7. **Switch it on in Pera.** In `src/1-head.html`, set `MICROSOFT_SSO: true`. Optionally set `PASSWORD_LOGIN: false`. Then rebuild.
8. **Choose how staff join.** Either:
   - add people under Settings → Users, with the same email as their Microsoft account; or
   - tick *add new staff automatically* and list the company's email domains, for example `zimnat.co.zw`.

   New people join as Requisitioners, and the administrator sets their roles. People who have been deactivated are never re-added automatically.

## Upgrading a live Pera database to this version

1. **Run the new `supabase/schema.sql` again** (with the same edits as last time). It adds these columns:
   - `app_users`: `phone`, `avatar`, `prefs`, `departments` and `last_login_at`;
   - `notifications`: `dismissed`;
   - `requisitions`: `stages`, `purchaser_id`, `delivery_address_id`, `delivery_address`, `distribution_address_id`, `distribution_address`, `pay_from_id` and `dup_note`.

   It also replaces `guard_req_update` and `decide_record`, which add approval steps, purchaser rules and the past-due-date check. Requisitions already in approval keep their single-step route.

   It also lets people edit their own job title, phone, picture and preferences. Name, email, role, departments, branch and active status stay administrator-only. The policy notes in the next section apply.
   It also adds `run_reminders()`, which sends approval reminders and escalations.
2. **Redeploy the email function** with `supabase functions deploy notify`. This respects each person's email choices and adds the *Review & approve* button. `APP_URL` must be Pera's address for the buttons to work.
3. **Schedule reminders.** In Supabase → *Database* → *Cron*, run `select run_reminders();` every hour. Pera also runs it whenever someone opens the app.
4. **Let invited people create their login.** In Supabase → *Authentication* → *Sign In / Providers*, keep *Allow new users to sign up* on. Signing up doesn't give anyone access by itself: only emails that an administrator added (or allowed Microsoft domains) get into Pera.
5. **Allow password-reset links.** In Supabase → *Authentication* → *URL Configuration*, make sure Pera's address is in **Redirect URLs**.

Existing departments keep working. Their codes and dates added are blank until an administrator fills them in under *Manage company → Departments*.

## Upgrading a database that runs the old HeartPath schema

Run the new `supabase/schema.sql` on that database. Everything is written as `create or replace` / `add column if not exists`, with three exceptions:

- **Row-level-security policies:** comment out the `create policy` lines (they already exist).
- **Storage policies:** the same applies.
- **File bucket:** the bucket is now `pera-files`. Either keep `STORAGE_BUCKET: 'heartpath-files'` in the config, or move the files across.

## Tests that were run on this version

- **Database:** the schema ran on real PostgreSQL 16 (PGlite) with Supabase stand-ins. These rules were tested and all passed:
  - nobody approves their own request, PO or contract;
  - delegation, including the "on behalf of" record;
  - the hard budget cap;
  - the bank-change alert;
  - Microsoft auto-provisioning, by domain only;
  - audit entries can't be edited or deleted, even by the owner;
  - tampering is detected by `audit_verify()`.
- **App:** an in-browser test (demo mode) checked:
  - self-exclusion and the self-approval block;
  - a delegate approving on behalf of others;
  - SHA-256 on upload;
  - client brand colours;
  - all 21 pages rendering;
  - the new Settings, Audit and Out-of-office controls.

## Screens

The menu follows the sample system:

**Dashboard**
- Four tabs: Analytics, Approvals, Messages, Notifications.
- A company-level or branch-level view, and a Purchasing, Finance, Approver or My view.
- Tiles for open POs, pending approvals, overdue items and spend this month.
- Overdue and upcoming items, grouped by date.
- Spend breakdown by category, for this month, quarter or year.
- Requisitions over time, stacked by category.
- The latest purchases and spend per supplier (top 5, 10 or 20).
- Budget use, alerts and the recent activity feed.

**Transactions**
- **Requisitions**:
  - Tabs: All, Pending, Pending review, Open, Fulfilled, Drafts, Closed, Overdue.
  - Filters: search, date range, transaction total, "View my department requisitions", and More filters (status, category, requisitioner, supplier, budget, currency, branch).
  - Columns include Date sent. The Actions column has Duplicate and Edit draft.
  - Two types: Purchase (goes through a PO) and Direct payment (fees, petty cash, claims).
- **Expenses**: claims for money staff have already spent, with receipts, the expense date and who to reimburse. Numbered EX-.
  - Tabs: All, Pending, Pending review, Approved, Drafts, Rejected, Paid.
  - Filters include "View my department expenses".
- **Requests**: ask for items from stores, repairs, IT support or facilities work.
  - Procurement accepts and assigns each request, then either issues it from stock or converts it into a requisition.
  - Requests can repeat weekly, monthly or quarterly.
  - Tabs: All, Pending, Open, Scheduled, Drafts, Completed. Filters include "View my branch requests".
- **Contracts**: created as drafts, approved by the contract approvers, then active.
  - Tabs: All, Pending, Open, Drafts, Closed, Expiring soon.
  - You can renew, amend or terminate a contract. Each one has a detail page with its approvals, documents, call-offs and comments.
- **Purchase orders**: raised from an approved requisition or an RFQ award.
  - Draft → Pending approval → Pending review → Open (issued). A PO can't be more than the approved amount.
  - Tabs: All, Pending approval, Pending review, Open, Drafts, Closed, Approved – to order.
  - POs are printable. Filters include "View my branch purchase orders".
- **Deliveries**: confirm what arrived against each PO. Partial deliveries are allowed, and you rate the supplier each time.
  - Tabs: All, New, Partially received, Fully received, Closed. Filters include "View my own deliveries".
- **RFQs & tenders**: sealed bids, weighted scoring (price, delivery and technical quality), and an award with a written justification.
- **Invoices**: a 3-way match against the PO and what was received. Duplicate supplier invoice numbers are blocked.
- **Payments**: a queue of items ready to pay, a batch payment file (CSV) export, and payment recording with proof of payment.
- **My approvals**: everything waiting for you, plus the Finance review queue.

**Catalogue**
- **Suppliers**:
  - Tabs: All, Active, Pending, Inactive, Needs attention.
  - Columns: Company name, Status, Main contact, Connection (portal), Phone, Country, Supplier category, Rating, Last edited.
  - Row actions: edit, delete (only if the supplier has never been used), deactivate or activate.
  - More actions: import from CSV, export to CSV, invite to the supplier portal.
  - Supplier approval, compliance documents with expiry warnings, ESG tags and performance reviews.
- **Items**:
  - Tabs: All, Active, Inactive, Favourite, Stock.
  - Columns: Item name, Item number, Status, Purchase price, Default UOM, Last edited.
  - Row actions: edit, delete (only if never used), adjust stock, favourite.
  - Stock quantities, reorder levels and stock movements.
- **Categories**:
  - Two tabs: Item categories and Supplier categories.
  - Parent categories, a branch column, and "Make company-wide" / "Unmake company-wide" for the rows you tick.
  - Delete only if the category has never been used.

**Plan & control**
- **Procurement plan**: what each department plans to buy, by quarter. You can raise a requisition straight from a plan line.
- **Budgets**: budget lines by code, department and branch, showing spent, committed and available.
- **Reports**:
  - Spend by month, department and category.
  - Approval time and request-to-pay time.
  - Share of spend under contract, competitively sourced, and with local or SME suppliers.
  - Supplier performance.
- **Audit trail**: append-only and exportable.
- **Settings**:
  - Company details, currencies and exchange rates.
  - Departments and branches.
  - Approval tiers by amount, PO approvers and contract approvers.
  - The Finance review step, the reject rule and sourcing rules.
  - Help center contacts, and users.

**Everywhere**
- **Create button**: create a requisition, expense, request, contract, purchase order or RFQ, or run a Smart scan.
- **Top bar**: approvals (✓), messages and notifications. The user menu shows your company and branch.
- **Comments on every record**: type @ and a first name to notify someone. All conversations are collected in Messages.
- **Every table**: 10, 25, 50 or 100 rows per page, with Edit columns to choose which columns show.
- **Smart scan**: upload a PDF or photo of a quote, invoice or receipt. Pera reads it in the browser and pre-fills a requisition, an expense or a supplier invoice.
  - It is rule-based and free: no data is sent to an outside AI service.
  - Typed PDFs read best. Photos use text recognition, which downloads about 10 MB the first time and may need correcting.
- **Help center**: searchable answers plus your support contacts.

### Roles

| Role | Can do |
|---|---|
| Requisitioner | Raise and track their own requisitions, expenses and requests; confirm deliveries |
| Approver (executive) | Approve or reject requisitions, expenses, POs and contracts; sees everything and the reports |
| Procurement officer | Requests, plan, suppliers, contracts, RFQs, purchase orders, stock and catalogue |
| Finance / accounts payable | The review step, budgets, invoices, payments, payment files |
| Administrator | Everything, plus users and settings |
| Supplier (portal) | Only their own RFQ invitations, quotes, POs, invoices, documents and messages |

## Try it (demo mode)

Open `index.html` in a browser. It loads a fictional company, Northgate Holdings, with three
branches. Open the menu under your name (top right) and use **Switch demo user** to act as each
person:

- the IT manager or the Bulawayo branch administrator raising requisitions, expenses and requests;
- the CEO, CFO and COO approving;
- the payables officer reviewing and paying;
- the procurement officer running RFQs, raising POs and issuing stock;
- a supplier using the portal.

Demo data stays in that browser only. To start over, use Settings → Reset demo data.

## Go live (Supabase + Vercel)

Each organisation gets its own Supabase project, so its data stays completely separate.

1. **Create a Supabase project** at supabase.com.
2. **Run the schema.** In `supabase/schema.sql`, change `CHANGE-ME@yourcompany.com` near the bottom
   to the first administrator's email. Then paste the whole file into Supabase → SQL Editor → Run.
3. **Create logins.** Go to Supabase → Authentication → Users → Add user, and add the administrator.
   Everyone else is added the same way, and also in Pera under Settings → Users, with the **same
   email**, role and branch. Procurement can invite supplier portal users from the Suppliers page.
4. **Configure.** Sign in as administrator and open Settings. Set:
   - the company, currencies, departments and branches;
   - the approval tiers and the PO and contract approvers;
   - the review step and the Help center contacts.
   
   Then add categories, budgets, items and suppliers. Suppliers can be imported from CSV.
5. **Connect the app.** In `src/1-head.html`, fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` from
   Supabase → Project Settings → API, then run `./build.sh`. You can also edit `index.html` directly.
6. **Email notifications.** Create a resend.com account and verify your domain. Then:
   ```
   supabase functions deploy notify
   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Pera <procurement@yourcompany.com>" APP_URL=https://your-heartpath.vercel.app
   ```
   Finally, go to Supabase → Database → Webhooks → Create: table `notifications`, event `INSERT`, Edge Function `notify`.
7. **Host it.** Deploy the folder to Vercel, or any web server. It's one static file.

Scheduled requests are created whenever someone opens Pera on or after the due date. To make
them appear even when nobody logs in, schedule `select run_schedules();` daily with Supabase → Database → Cron.

## What the database enforces (not just the screens)

The rules below were tested role by role against Postgres 16.

**Numbers, authors and times**
- Record numbers (R-, EX-, RQ-, PO-, CT-), authors and times are set by the server.
- Audit and comment authors are stamped by the server, so nobody can impersonate someone else.

**Approvals and review**
- The server chooses the approval route from Settings: tiers for requisitions and expenses, and the PO and contract approvers.
- Approvals go only through the Approve/Reject action. Each approver decides once, and a rejection needs a reason.
- Only Finance can release or return an item at review. Returning it needs a note.

**Editing and status**
- Only drafts can be edited. An approved contract can only have its end date, value, notes and documents amended.
- Status moves only along the allowed path:
  - only Procurement raises and cancels POs;
  - only the requester or Procurement records deliveries;
  - only Finance pays and closes.
- Requests can only be changed by their owner (while in draft), by Procurement, or by the assignee (to complete them).

**Stock**
- Stock can't go below zero, and every stock movement needs a reason.

**Suppliers and sealed bids**
- Sealed bids are hidden until the closing time.
- Suppliers see only their own RFQs, their issued POs, their invoices and related messages.

**Users**
- Users can change only their own favourites. Only an administrator can change roles.
- Procurement can create supplier portal logins, and nothing else.

**Deletes**
- Items, categories and suppliers can be deleted only if they have never been used.
- Transactions, documents, reviews, comments and the audit trail can never be deleted.

## Backups and retention

Supabase Pro includes daily backups. For long-term audit retention, also export monthly:
use the CSV exports in the app (requisitions, audit trail, spend, suppliers), or `pg_dump`. Files
are kept in the private `pera-files` storage bucket.
