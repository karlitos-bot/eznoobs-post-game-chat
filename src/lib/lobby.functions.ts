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
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const guestSchema = z.string().regex(new RegExp(`^${uuid}\\.${uuid}$`, "i"));

function splitGuestCredential(credential: string) {
  const [publicId, secret] = credential.split(".");
  if (!publicId || !secret) throw new Error("Invalid guest credential.");
  return { publicId, secret };
}

async function callRpc(
  supabaseAdmin: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return (supabaseAdmin as { rpc: (n: string, a: Record<string, unknown>) => Promise<any> }).rpc(
    name,
    args,
  );
}

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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "create_lobby", {
      p_game: data.game,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "join_lobby", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "send_message", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
      p_body: data.body,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean; out_reason: string | null }[] | null;
    const r = rows?.[0];
    if (!r || !r.out_ok) throw new Error(r?.out_reason ?? "Message failed.");
    return { ok: true };
  });

export const getLobby = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = data.guestId ? splitGuestCredential(data.guestId) : null;
    const { data: result, error } = await callRpc(supabaseAdmin, "get_lobby_entry", {
      p_code: data.code,
      p_guest_id: guest?.publicId ?? null,
      p_guest_secret: guest?.secret ?? null,
    });
    if (error) throw new Error(error.message);

    const rows = result as
      | {
          out_id: string;
          out_code: string;
          out_game: string;
          out_created_at: string;
          out_expires_at: string;
          out_last_activity_at: string;
          out_joined: boolean;
        }[]
      | null;
    const r = rows?.[0];
    if (!r) return null;

    return {
      id: r.out_id,
      code: r.out_code,
      game: r.out_game,
      created_at: r.out_created_at,
      expires_at: r.out_expires_at,
      last_activity_at: r.out_last_activity_at,
      joined: Boolean(r.out_joined),
    };
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "report_message", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "touch_presence", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "toggle_reaction", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "toggle_rematch_vote", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
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
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "leave_lobby", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
    });
    if (error) throw new Error(error.message);
    const rows = result as { out_ok: boolean }[] | null;
    if (!rows?.[0]?.out_ok) throw new Error("Could not leave lobby.");
    return { ok: true };
  });
