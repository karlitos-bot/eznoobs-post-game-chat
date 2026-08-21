import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sessionSchema = z.string().min(32).max(200);
const reviewStatusSchema = z.enum(["pending", "dismissed", "confirmed", "serious"]);
const queueStatusSchema = z.enum(["pending", "dismissed", "confirmed", "serious", "all"]);

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

export type ModerationReport = {
  id: string;
  lobbyCode: string | null;
  reporterGuestId: string;
  reportedGuestId: string;
  reason: string;
  messageBody: string | null;
  messageNickname: string | null;
  messageTeam: string | null;
  createdAt: string;
  expiresAt: string;
  reviewStatus: "pending" | "dismissed" | "confirmed" | "serious";
  reviewedAt: string | null;
  reviewNote: string | null;
};

export const moderatorLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        moderatorId: z.string().uuid(),
        secret: z.string().min(24).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "moderator_login", {
      p_moderator_id: data.moderatorId,
      p_secret: data.secret,
    });
    if (error) throw new Error("Could not open moderator session.");

    const row = (result as
      | { out_ok: boolean; out_token: string | null; out_expires_at: string | null }[]
      | null)?.[0];

    if (!row?.out_ok || !row.out_token || !row.out_expires_at) {
      return { ok: false as const, reason: "Invalid moderator credential or too many attempts." };
    }

    return {
      ok: true as const,
      sessionToken: row.out_token,
      expiresAt: row.out_expires_at,
    };
  });

export const getModerationQueue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionToken: sessionSchema,
        status: queueStatusSchema.default("pending"),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "get_moderation_queue", {
      p_session_token: data.sessionToken,
      p_status: data.status,
      p_limit: data.limit,
    });
    if (error) throw new Error("Could not load moderation queue.");

    const rows = (result ?? []) as Array<{
      out_id: string;
      out_lobby_code: string | null;
      out_reporter_guest_id: string;
      out_reported_guest_id: string;
      out_reason: string;
      out_message_body: string | null;
      out_message_nickname: string | null;
      out_message_team: string | null;
      out_created_at: string;
      out_expires_at: string;
      out_review_status: ModerationReport["reviewStatus"];
      out_reviewed_at: string | null;
      out_review_note: string | null;
    }>;

    return rows.map(
      (row): ModerationReport => ({
        id: row.out_id,
        lobbyCode: row.out_lobby_code,
        reporterGuestId: row.out_reporter_guest_id,
        reportedGuestId: row.out_reported_guest_id,
        reason: row.out_reason,
        messageBody: row.out_message_body,
        messageNickname: row.out_message_nickname,
        messageTeam: row.out_message_team,
        createdAt: row.out_created_at,
        expiresAt: row.out_expires_at,
        reviewStatus: row.out_review_status,
        reviewedAt: row.out_reviewed_at,
        reviewNote: row.out_review_note,
      }),
    );
  });

export const reviewModerationReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionToken: sessionSchema,
        reportId: z.string().uuid(),
        status: reviewStatusSchema,
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "review_report", {
      p_session_token: data.sessionToken,
      p_report_id: data.reportId,
      p_review_status: data.status,
      p_note: data.note || null,
    });
    if (error) throw new Error("Could not update that report.");

    const row = (result as { out_ok: boolean; out_reason: string | null }[] | null)?.[0];
    if (!row?.out_ok) {
      return { ok: false as const, reason: row?.out_reason ?? "Could not update that report." };
    }
    return { ok: true as const };
  });

export const moderatorLogout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionToken: sessionSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await callRpc(supabaseAdmin, "moderator_logout", {
      p_session_token: data.sessionToken,
    });
    if (error) throw new Error("Could not close moderator session.");
    return { ok: true };
  });
