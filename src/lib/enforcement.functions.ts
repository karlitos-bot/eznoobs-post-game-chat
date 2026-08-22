import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sessionSchema = z.string().min(32).max(200);
const restrictionTypeSchema = z.enum(["chat_mute", "cooldown", "suspension"]);

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

export type EnforcementCandidate = {
  reportId: string;
  lobbyCode: string | null;
  reason: string;
  messageBody: string | null;
  messageNickname: string | null;
  messageTeam: string | null;
  reviewStatus: "confirmed" | "serious";
  reviewedAt: string | null;
  priorEnforcements: number;
  activeRestriction: "chat_mute" | "cooldown" | "suspension" | null;
  activeUntil: string | null;
};

export type ActiveRestriction = {
  id: string;
  restrictionType: "chat_mute" | "cooldown" | "suspension";
  sourceReportId: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export const getEnforcementCandidates = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionToken: sessionSchema, limit: z.number().int().min(1).max(100).default(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "get_enforcement_candidates", {
      p_session_token: data.sessionToken,
      p_limit: data.limit,
    });
    if (error) throw new Error("Could not load enforcement candidates.");

    const rows = (result ?? []) as Array<{
      out_report_id: string;
      out_lobby_code: string | null;
      out_reason: string;
      out_message_body: string | null;
      out_message_nickname: string | null;
      out_message_team: string | null;
      out_review_status: "confirmed" | "serious";
      out_reviewed_at: string | null;
      out_prior_enforcements: number;
      out_active_restriction: "chat_mute" | "cooldown" | "suspension" | null;
      out_active_until: string | null;
    }>;

    return rows.map(
      (row): EnforcementCandidate => ({
        reportId: row.out_report_id,
        lobbyCode: row.out_lobby_code,
        reason: row.out_reason,
        messageBody: row.out_message_body,
        messageNickname: row.out_message_nickname,
        messageTeam: row.out_message_team,
        reviewStatus: row.out_review_status,
        reviewedAt: row.out_reviewed_at,
        priorEnforcements: row.out_prior_enforcements,
        activeRestriction: row.out_active_restriction,
        activeUntil: row.out_active_until,
      }),
    );
  });

export const applyGuestRestriction = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        sessionToken: sessionSchema,
        reportId: z.string().uuid(),
        restrictionType: restrictionTypeSchema,
        durationMinutes: z.number().int().min(5).max(43200),
        reason: z.string().trim().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "apply_guest_restriction", {
      p_session_token: data.sessionToken,
      p_report_id: data.reportId,
      p_restriction_type: data.restrictionType,
      p_duration_minutes: data.durationMinutes,
      p_reason: data.reason || null,
    });
    if (error) throw new Error("Could not apply that restriction.");

    const row = (result as
      | {
          out_ok: boolean;
          out_reason: string | null;
          out_restriction_id: string | null;
          out_expires_at: string | null;
        }[]
      | null)?.[0];

    if (!row?.out_ok || !row.out_restriction_id || !row.out_expires_at) {
      return { ok: false as const, reason: row?.out_reason ?? "Could not apply that restriction." };
    }
    return {
      ok: true as const,
      restrictionId: row.out_restriction_id,
      expiresAt: row.out_expires_at,
    };
  });

export const getActiveRestrictions = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionToken: sessionSchema, limit: z.number().int().min(1).max(100).default(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "get_active_guest_restrictions", {
      p_session_token: data.sessionToken,
      p_limit: data.limit,
    });
    if (error) throw new Error("Could not load active restrictions.");

    const rows = (result ?? []) as Array<{
      out_id: string;
      out_restriction_type: ActiveRestriction["restrictionType"];
      out_source_report_id: string | null;
      out_reason: string | null;
      out_created_at: string;
      out_updated_at: string;
      out_expires_at: string;
    }>;

    return rows.map(
      (row): ActiveRestriction => ({
        id: row.out_id,
        restrictionType: row.out_restriction_type,
        sourceReportId: row.out_source_report_id,
        reason: row.out_reason,
        createdAt: row.out_created_at,
        updatedAt: row.out_updated_at,
        expiresAt: row.out_expires_at,
      }),
    );
  });

export const liftGuestRestriction = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        sessionToken: sessionSchema,
        restrictionId: z.string().uuid(),
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await callRpc(supabaseAdmin, "lift_guest_restriction", {
      p_session_token: data.sessionToken,
      p_restriction_id: data.restrictionId,
      p_note: data.note || null,
    });
    if (error) throw new Error("Could not lift that restriction.");

    const row = (result as { out_ok: boolean; out_reason: string | null }[] | null)?.[0];
    if (!row?.out_ok) {
      return { ok: false as const, reason: row?.out_reason ?? "Could not lift that restriction." };
    }
    return { ok: true as const };
  });
