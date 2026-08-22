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

export const getLobbyRealtimeToken = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = splitGuestCredential(data.guestId);

    const { data: result, error } = await supabaseAdmin.rpc("get_lobby_realtime_token", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
    });

    if (error) throw new Error("Could not secure realtime connection.");
    const rows = result as { out_token: string | null }[] | null;
    const token = rows?.[0]?.out_token;
    return token && /^[0-9a-f-]{36}$/i.test(token) ? token : null;
  });
