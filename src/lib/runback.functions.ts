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

export const createRunbackLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "create_runback_lobby", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
    });

    if (error) throw new Error("Could not create the Runback room.");
    const rows = result as
      | { out_ok: boolean; out_reason: string | null; out_code: string | null }[]
      | null;
    const row = rows?.[0];
    if (!row?.out_ok || !row.out_code) {
      return {
        ok: false as const,
        reason: row?.out_reason ?? "Could not create the Runback room.",
      };
    }

    return { ok: true as const, code: row.out_code };
  });

export const getRunbackLobby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: codeSchema, guestId: guestSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = splitGuestCredential(data.guestId);
    const { data: result, error } = await callRpc(supabaseAdmin, "get_runback_lobby", {
      p_code: data.code,
      p_guest_id: guest.publicId,
      p_guest_secret: guest.secret,
    });

    if (error) return null;
    const rows = result as { out_code: string | null }[] | null;
    return rows?.[0]?.out_code ?? null;
  });
