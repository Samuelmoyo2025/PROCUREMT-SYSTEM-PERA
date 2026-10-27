// Pera — email notifications
// Emails every new in-app notification: new requisitions to approvers, decisions to the requisitioner,
// approvals to Procurement/Finance, RFQ invitations and POs to supplier portal users, payments, etc.
//
// Deploy:   supabase functions deploy notify
// Secrets:  supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Pera <procurement@yourcompany.com>" APP_URL=https://your-heartpath.vercel.app
// Trigger:  Supabase → Database → Webhooks → Create: table notifications, event INSERT, type Supabase Edge Function, function notify

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("MAIL_FROM") ?? "Pera <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Same grouping as noteCat() in the app (src/6c-account.js). Security alerts are always emailed.
function noteCat(n: { message?: string; entity_type?: string }): string {
  const m = n.message ?? "";
  if (/Bank details|delegated their approvals|supplier portal/i.test(m)) return "security";
  if (/needs your (approval|review)|^Reminder:|^Escalated:/i.test(m)) return "approvals";
  if (/mentioned you|commented on/i.test(m)) return "messages";
  if (n.entity_type === "invoice" || /has been paid|ready for payment|ready to pay/i.test(m)) return "payments";
  if (["po", "receipt", "rfq", "request", "item", "supplier"].includes(n.entity_type ?? "")) return "purchasing";
  return "mine";
}

Deno.serve(async (req) => {
  const n = (await req.json()).record;
  if (!n || n.emailed) return new Response("skip");
  const { data: user } = await sb.from("app_users").select("name,email,active,prefs").eq("id", n.user_id).single();
  if (!user?.email || !user.active) return new Response("no recipient");
  const cat = noteCat(n);
  if (cat !== "security" && user.prefs?.email?.[cat] === false) return new Response("email turned off for " + cat);
  const { data: s } = await sb.from("settings").select("value").eq("id", 1).single();
  const company = s?.value?.company ?? "";

  // Links open Pera on the record. "Review & approve" opens the one-screen approval page; the person still
  // signs in, so a forwarded email can't approve anything on its own.
  const linkable = /^(requisition|expense|po|contract|rfq|supplier|request)$/.test(n.entity_type ?? "") && /^[\w-]+$/.test(n.entity_id ?? "");
  const approvable = cat === "approvals" && /^(requisition|expense|po|contract)$/.test(n.entity_type ?? "") && !/^Escalated:/.test(n.message);
  const base = APP_URL.replace(/#.*$/, "");
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;background:${primary ? "#5FD6FF" : "#ffffff"};color:#081D4D;border:1px solid #081D4D;padding:10px 18px;border-radius:20px;text-decoration:none;font-weight:bold">${label}</a>`;
  const buttons = !base ? "" : approvable && linkable
    ? button(`${base}#approve/${n.entity_type}/${n.entity_id}`, "Review &amp; approve", true) + button(`${base}#open/${n.entity_type}/${n.entity_id}`, "Open full record", false)
    : button(linkable ? `${base}#open/${n.entity_type}/${n.entity_id}` : base, "Open in Pera", true);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191F">
    <div style="background:#081D4D;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0"><b style="color:#5FD6FF">Pera</b> · ${esc(company)}</div>
    <div style="border:1px solid #D5DBDB;border-top:0;padding:18px;border-radius:0 0 8px 8px">
      <p>Dear ${esc(user.name)},</p><p style="font-size:15px">${esc(n.message)}</p>
      ${buttons ? `<p>${buttons}</p>` : ""}
      <p style="color:#7D8998;font-size:12px">You can choose which emails you get under My profile → Email &amp; alerts.</p></div></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [user.email], subject: String(n.message).slice(0, 150), html }),
  });
  if (res.ok) await sb.from("notifications").update({ emailed: true }).eq("id", n.id);
  return new Response(res.ok ? "sent" : await res.text(), { status: res.ok ? 200 : 500 });
});
