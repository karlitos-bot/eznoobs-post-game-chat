import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const teamSchema = z.enum(["blue", "red", "spectator"]);
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
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code = Array.from(
        { length: 5 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
      const { data: lobby, error } = await supabaseAdmin
        .from("lobbies")
        .insert({ code, game: data.game })
        .select("id, code")
        .single();
      if (!error && lobby) {
        await supabaseAdmin.from("participants").insert({
          lobby_id: lobby.id,
          guest_id: data.guestId,
          nickname: data.nickname,
          team: data.team,
        });
        return { code: lobby.code };
      }
      if (error && error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Could not allocate a lobby code, try again.");
  });

export const joinLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => joinSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lobby } = await supabaseAdmin
      .from("lobbies")
      .select("id, code, game, expires_at")
      .eq("code", data.code)
      .maybeSingle();
    if (!lobby) return { ok: false as const, reason: "This lobby does not exist." };
    if (new Date(lobby.expires_at).getTime() < Date.now())
      return { ok: false as const, reason: "This lobby has expired." };

    const { error } = await supabaseAdmin.from("participants").upsert(
      {
        lobby_id: lobby.id,
        guest_id: data.guestId,
        nickname: data.nickname,
        team: data.team,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "lobby_id,guest_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("lobbies")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", lobby.id);
    return { ok: true as const, lobby: { code: lobby.code, game: lobby.game } };
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
    const { data: lobby } = await supabaseAdmin
      .from("lobbies")
      .select("id, expires_at")
      .eq("code", data.code)
      .maybeSingle();
    if (!lobby) throw new Error("Lobby not found.");
    if (new Date(lobby.expires_at).getTime() < Date.now()) throw new Error("Lobby expired.");

    const { data: participant } = await supabaseAdmin
      .from("participants")
      .select("nickname, team")
      .eq("lobby_id", lobby.id)
      .eq("guest_id", data.guestId)
      .maybeSingle();
    if (!participant) throw new Error("Join the lobby before chatting.");

    // basic anti-spam: max 8 messages per 10 seconds per guest
    const since = new Date(Date.now() - 10_000).toISOString();
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lobby_id", lobby.id)
      .eq("guest_id", data.guestId)
      .gte("created_at", since);
    if ((count ?? 0) >= 8) throw new Error("Slow down — too many messages.");

    const { error } = await supabaseAdmin.from("messages").insert({
      lobby_id: lobby.id,
      guest_id: data.guestId,
      nickname: participant.nickname,
      team: participant.team,
      body: data.body,
    });
    if (error) throw new Error(error.message);

    const now = new Date();
    await supabaseAdmin
      .from("lobbies")
      .update({
        last_activity_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", lobby.id);
    await supabaseAdmin
      .from("participants")
      .update({ last_seen_at: now.toISOString() })
      .eq("lobby_id", lobby.id)
      .eq("guest_id", data.guestId);
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
