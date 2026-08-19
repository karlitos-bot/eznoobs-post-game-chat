import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const teamSchema = z.enum(["blue", "red", "spectator"]);
const reactionSchema = z.enum(["GG", "skull", "salt", "clown"]);
const codeSchema = z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
const nickSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[^\u0000-\u001F]+$/);
const guestSchema = z.string().min(8).max(64);

const createSchema = z.object({
  game: z.string().min(2).max(40),
  nickname: nickSchema,
  team: teamSchema,
  guestId: guestSchema,
});

const joinSchema = z.object({
  code: codeSchema,
  nickname: nickSchema,
  team: teamSchema,
  guestId: guestSchema,
});

export const createLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("create_lobby", {
      p_game: data.game,
      p_guest_id: data.guestId,
      p_nickname: data.nickname,
      p_team: data.team,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_code: string }[] | null;
    if (!rows || rows.length === 0) throw new Error("Could not create lobby.");
    return { code: rows[0]!.out_code };
  });

export const joinLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => joinSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("join_lobby", {
      p_code: data.code,
      p_guest_id: data.guestId,
      p_nickname: data.nickname,
      p_team: data.team,
    });
    if (error) throw new Error(error.message);
    const rows = result as
      | {
          out_ok: boolean;
          out_reason: string | null;
          out_code: string | null;
          out_game: string | null;
        }[]
      | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) {
      return { ok: false as const, reason: r?.out_reason ?? "Could not join lobby." };
    }
    return { ok: true as const, lobby: { code: r.out_code!, game: r.out_game! } };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: codeSchema,
        guestId: guestSchema,
        body: z.string().trim().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("send_message", {
      p_code: data.code,
      p_guest_id: data.guestId,
      p_body: data.body,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean; out_reason: string | null }[] | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) {
      throw new Error(r?.out_reason ?? "Message failed.");
    }
    return { ok: true };
  });

export const getLobby = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lobby } = await supabaseAdmin
      .from("lobbies")
      .select("id, code, game, created_at, expires_at, last_activity_at")
      .eq("code", data.code)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!lobby) return null;
    let joined = false;
    if (data.guestId) {
      const { data: p } = await supabaseAdmin
        .from("participants")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("guest_id", data.guestId)
        .maybeSingle();
      joined = Boolean(p);
    }
    return { ...lobby, joined };
  });

export const reportMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: codeSchema,
        guestId: guestSchema,
        messageId: z.string().uuid(),
        reason: z.string().trim().min(1).max(200).default("Reported by a player"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("report_message", {
      p_code: data.code,
      p_guest_id: data.guestId,
      p_message_id: data.messageId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean; out_reason: string | null }[] | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) throw new Error(r?.out_reason ?? "Could not report that message.");
    return { ok: true };
  });

export const touchPresence = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: codeSchema, guestId: guestSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("touch_presence", {
      p_code: data.code,
      p_guest_id: data.guestId,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean }[] | null;
    if (!rows?.[0]?.out_ok) throw new Error("Could not refresh presence.");
    return { ok: true };
  });

export const toggleReaction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: codeSchema,
        guestId: guestSchema,
        messageId: z.string().uuid(),
        emoji: reactionSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("toggle_reaction", {
      p_code: data.code,
      p_guest_id: data.guestId,
      p_message_id: data.messageId,
      p_emoji: data.emoji,
    });
    if (error) throw new Error(error.message);
    const rows = result as
      | { out_ok: boolean; out_reason: string | null; out_active: boolean }[]
      | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) throw new Error(r?.out_reason ?? "Reaction failed.");
    return { ok: true, active: r.out_active };
  });

export const toggleRematchVote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: codeSchema, guestId: guestSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("toggle_rematch_vote", {
      p_code: data.code,
      p_guest_id: data.guestId,
    });
    if (error) throw new Error(error.message);
    const rows = result as
      | { out_ok: boolean; out_reason: string | null; out_active: boolean; out_count: number }[]
      | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) throw new Error(r?.out_reason ?? "Rematch vote failed.");
    return { ok: true, active: r.out_active, count: r.out_count };
  });

export const leaveLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: codeSchema, guestId: guestSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("leave_lobby", {
      p_code: data.code,
      p_guest_id: data.guestId,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean }[] | null;
    if (!rows?.[0]?.out_ok) throw new Error("Could not leave lobby.");
    return { ok: true };
  });
