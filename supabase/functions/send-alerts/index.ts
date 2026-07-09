// Barrido de alertas de demora. Lo dispara pg_cron (diario 8am CDMX).
// Amarillo (>=5 días hábiles): correo al admin + CC supervisores.
// Rojo (>=15 días hábiles): correo al admin + CC supervisores + gerente.
// Cadencia: primer correo al cruzar el umbral, luego cada 2 días hábiles por banda.
// Sin BREVO_API_KEY corre en dry-run (calcula pero no envía ni marca).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-alert-secret",
};

interface NoteRow { note: string; priority: string; group: string; step: string; bd: number }
interface Digest { admin_id: string; admin_email: string; admin_name: string; band: "yellow" | "red"; notes: NoteRow[] }

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function buildEmail(d: Digest, appUrl: string): { subject: string; html: string } {
  const red = d.band === "red";
  const accent = red ? "#c53030" : "#d97706";
  const label = red ? "estado CRÍTICO (rojo)" : "demora (amarillo)";
  const subject = red
    ? `🔴 Notas SAP en estado crítico — atención urgente (${d.notes.length})`
    : `⚠️ Notas SAP con demora — seguimiento pendiente (${d.notes.length})`;

  const rows = d.notes.map((n) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;">${esc(n.note)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${esc(n.priority)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${esc(n.group)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${esc(n.step)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:${accent};">${n.bd} días háb.</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">
    <div style="background:${accent};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">SAP Notes Control Center · DXC</div>
      <div style="font-size:19px;font-weight:800;margin-top:2px;">Notas en ${label}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
      <p style="margin:0 0 14px;">Hola <b>${esc(d.admin_name)}</b>, estas notas llevan tiempo sin seguimiento documentado y necesitan atención:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px 10px;">Nota</th><th style="padding:8px 10px;">Prioridad</th>
            <th style="padding:8px 10px;">Grupo</th><th style="padding:8px 10px;">Paso actual</th>
            <th style="padding:8px 10px;text-align:center;">Sin seguimiento</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:18px;">
        <a href="${esc(appUrl)}" style="background:${accent};color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;display:inline-block;">Abrir el sistema</a>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
        ${red
          ? "Estas notas están en rojo (15+ días hábiles). Recibirás este aviso cada 2 días hábiles hasta que avancen."
          : "Estas notas están en amarillo/naranja (5+ días hábiles). Recibirás este aviso cada 2 días hábiles hasta que avancen."}
        Aviso automático — no es necesario responder.
      </p>
    </div>
  </div>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronSecret = Deno.env.get("ALERT_CRON_SECRET");
  if (cronSecret && req.headers.get("x-alert-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: cfg } = await db.from("alert_config").select("*").eq("id", 1).single();
  if (!cfg) {
    return new Response(JSON.stringify({ error: "sin alert_config" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Modo prueba: {"test_to":"correo"} envía un ejemplo (sin CC) para verificar entrega.
  let reqBody: { test_to?: string } = {};
  try { reqBody = await req.json(); } catch { /* sin body */ }
  if (reqBody.test_to) {
    if (!brevoKey) return new Response(JSON.stringify({ error: "no hay BREVO_API_KEY" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const sample: Digest = {
      admin_id: "test", admin_email: reqBody.test_to, admin_name: "Prueba",
      band: "yellow",
      notes: [
        { note: "0001234", priority: "P1", group: "S4-HANA", step: "VoBo y KIT para Calidad (KOF)", bd: 6 },
        { note: "0005678", priority: "P2", group: "CPROC", step: "Solicitud de SAROX (TQS → KOF)", bd: 5 },
      ],
    };
    const { subject, html } = buildEmail(sample, cfg.app_url);
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        sender: { email: cfg.from_email, name: cfg.from_name },
        to: [{ email: reqBody.test_to }],
        subject: `[PRUEBA] ${subject}`,
        htmlContent: html,
      }),
    });
    const txt = await resp.text();
    return new Response(JSON.stringify({ ok: resp.ok, test_to: reqBody.test_to, status: resp.status, brevo: txt.slice(0, 200) }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (cfg.enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "alertas deshabilitadas" }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { data: digests, error } = await db.rpc("get_pending_alerts");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const dryRun = !brevoKey;
  const results: Record<string, unknown>[] = [];

  for (const d of (digests ?? []) as Digest[]) {
    const cc = (d.band === "red" ? cfg.red_cc : cfg.yellow_cc) as string[];
    const { subject, html } = buildEmail(d, cfg.app_url);
    const plan = {
      to: d.admin_email,
      cc: cc.filter((e) => e && e !== d.admin_email),
      band: d.band,
      notes: d.notes.length,
    };

    if (dryRun) { results.push({ ...plan, sent: false, dryRun: true }); continue; }

    try {
      const payload: Record<string, unknown> = {
        sender: { email: cfg.from_email, name: cfg.from_name },
        to: [{ email: d.admin_email, name: d.admin_name }],
        subject,
        htmlContent: html,
      };
      if (plan.cc.length > 0) payload.cc = plan.cc.map((e) => ({ email: e }));
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey!, "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = await resp.text();
        results.push({ ...plan, sent: false, error: `Brevo ${resp.status}: ${body.slice(0, 200)}` });
        continue;
      }
      await db.rpc("mark_alert_sent", { p_admin_id: d.admin_id, p_band: d.band });
      results.push({ ...plan, sent: true });
    } catch (e) {
      results.push({ ...plan, sent: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!dryRun) await db.rpc("cleanup_alert_logs");

  return new Response(
    JSON.stringify({ ok: true, dryRun, digests: results.length, results }, null, 2),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
