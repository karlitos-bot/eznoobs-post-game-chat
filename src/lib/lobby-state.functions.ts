import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const codeSchema = z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
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

export const getLobbySnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = splitGuestCredential(data.guestId);

    const { data: lobby } = await supabaseAdmin
      .from("lobbies")
      .select("id, code, game, expires_at, last_activity_at")
      .eq("code", data.code)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!lobby) return null;

    const { data: participantCheck, error: participantError } = await callRpc(
      supabaseAdmin,
      "check_participant",
      {
        p_code: data.code,
        p_guest_id: guest.publicId,
        p_guest_secret: guest.secret,
      },
    );

    if (participantError) throw new Error(participantError.message);
    const participantRows = participantCheck as { out_joined: boolean }[] | null;
    if (!participantRows?.[0]?.out_joined) throw new Error("Join the lobby first.");

    const [messagesResult, playersResult, reactionsResult, votesResult] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("id, guest_id, nickname, team, body, created_at")
        .eq("lobby_id", lobby.id)
        .order("created_at", { ascending: true })
        .limit(200),
      supabaseAdmin
        .from("participants")
        .select("id, guest_id, nickname, team, last_seen_at")
        .eq("lobby_id", lobby.id),
      supabaseAdmin
        .from("reactions")
        .select("id, message_id, guest_id, emoji, created_at")
        .eq("lobby_id", lobby.id),
      supabaseAdmin
        .from("rematch_votes")
        .select("id, guest_id")
        .eq("lobby_id", lobby.id),
    ]);

    const error =
      messagesResult.error || playersResult.error || reactionsResult.error || votesResult.error;
    if (error) throw new Error(error.message);

    return {
      lobby,
      messages: messagesResult.data ?? [],
      players: playersResult.data ?? [],
      reactions: reactionsResult.data ?? [],
      rematchVotes: votesResult.data ?? [],
      syncedAt: new Date().toISOString(),
    };
  });
