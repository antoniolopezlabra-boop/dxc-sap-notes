// Consola de gestión de usuarios — solo superusuario.
// Acciones: list_users, create_user, reset_password, block, unblock,
// set_role, delete, transfer_group
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── autenticar al llamador y validar rol superuser ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "No autenticado" }, 401);
  const callerId = userData.user.id;

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();
  if (callerProfile?.role !== "superuser") {
    return json({ error: "Se requiere rol de súper usuario" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  const action = body.action as string;

  try {
    switch (action) {
      case "list_users": {
        const { data: profiles, error } = await admin
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw error;
        const { data: groups } = await admin
          .from("system_groups")
          .select("id, admin_id, name");
        const { data: authList } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const lastSignIn: Record<string, string | null> = {};
        for (const u of authList?.users ?? []) {
          lastSignIn[u.id] = u.last_sign_in_at ?? null;
        }
        const users = (profiles ?? []).map((p) => ({
          ...p,
          groups: (groups ?? []).filter((g) => g.admin_id === p.id),
          last_sign_in_at: lastSignIn[p.id] ?? null,
        }));
        return json({ users });
      }

      case "create_user": {
        const { email, password, full_name, role } = body as {
          email: string;
          password: string;
          full_name?: string;
          role?: string;
        };
        if (!email || !password) {
          return json({ error: "email y password son requeridos" }, 400);
        }
        const validRole = ["admin", "supervisor", "superuser"].includes(
            role ?? "",
          )
          ? role
          : "admin";
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name ?? "" },
        });
        if (error) throw error;
        const { error: profErr } = await admin.from("profiles").insert({
          id: created.user.id,
          email,
          full_name: full_name ?? null,
          role: validRole,
          status: "active",
          onboarded: validRole !== "admin",
        });
        if (profErr) {
          await admin.auth.admin.deleteUser(created.user.id);
          throw profErr;
        }
        return json({ ok: true, id: created.user.id });
      }

      case "reset_password": {
        const { user_id, password } = body as {
          user_id: string;
          password: string;
        };
        if (!user_id || !password) {
          return json({ error: "user_id y password requeridos" }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(user_id, {
          password,
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "block": {
        const { user_id } = body as { user_id: string };
        if (user_id === callerId) {
          return json({ error: "No puedes bloquearte a ti mismo" }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: "87600h",
        });
        if (error) throw error;
        await admin.from("profiles").update({ status: "blocked" }).eq(
          "id",
          user_id,
        );
        return json({ ok: true });
      }

      case "unblock": {
        const { user_id } = body as { user_id: string };
        const { error } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
        if (error) throw error;
        await admin.from("profiles").update({ status: "active" }).eq(
          "id",
          user_id,
        );
        return json({ ok: true });
      }

      case "set_role": {
        const { user_id, role } = body as { user_id: string; role: string };
        if (user_id === callerId) {
          return json({ error: "No puedes cambiar tu propio rol" }, 400);
        }
        if (!["admin", "supervisor", "superuser"].includes(role)) {
          return json({ error: "Rol inválido" }, 400);
        }
        const { error } = await admin.from("profiles").update({ role }).eq(
          "id",
          user_id,
        );
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete": {
        const { user_id } = body as { user_id: string };
        if (user_id === callerId) {
          return json({ error: "No puedes eliminar tu propia cuenta" }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "transfer_group": {
        const { group_id, to_admin_id } = body as {
          group_id: string;
          to_admin_id: string;
        };
        const { data: target } = await admin
          .from("profiles")
          .select("id, role, status")
          .eq("id", to_admin_id)
          .single();
        if (!target || target.role !== "admin" || target.status !== "active") {
          return json(
            { error: "El destino debe ser un administrador activo" },
            400,
          );
        }
        const { error: gErr } = await admin
          .from("system_groups")
          .update({ admin_id: to_admin_id })
          .eq("id", group_id);
        if (gErr) throw gErr;
        const { data: tracks } = await admin
          .from("note_tracks")
          .select("id")
          .eq("group_id", group_id);
        const trackIds = (tracks ?? []).map((t) => t.id);
        if (trackIds.length) {
          await admin
            .from("note_tracks")
            .update({ admin_id: to_admin_id })
            .in("id", trackIds);
          await admin
            .from("track_steps")
            .update({ admin_id: to_admin_id })
            .in("track_id", trackIds);
        }
        return json({ ok: true, moved_tracks: trackIds.length });
      }

      default:
        return json({ error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
