export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      lobbies: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          game: string
          id: string
          last_activity_at: string
          last_extended_at: string | null
          max_players: number
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          game: string
          id?: string
          last_activity_at?: string
          last_extended_at?: string | null
          max_players?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          game?: string
          id?: string
          last_activity_at?: string
          last_extended_at?: string | null
          max_players?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          guest_id: string
          id: string
          lobby_id: string
          nickname: string
          team: string
        }
        Insert: {
          body: string
          created_at?: string
          guest_id: string
          id?: string
          lobby_id: string
          nickname: string
          team: string
        }
        Update: {
          body?: string
          created_at?: string
          guest_id?: string
          id?: string
          lobby_id?: string
          nickname?: string
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          guest_id: string
          id: string
          joined_at: string
          last_seen_at: string
          lobby_id: string
          nickname: string
          team: string
        }
        Insert: {
          guest_id: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          lobby_id: string
          nickname: string
          team: string
        }
        Update: {
          guest_id?: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          lobby_id?: string
          nickname?: string
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          emoji: string
          guest_id: string
          id: string
          lobby_id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          guest_id: string
          id?: string
          lobby_id: string
          message_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          guest_id?: string
          id?: string
          lobby_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      rematch_votes: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          lobby_id: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          lobby_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          lobby_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rematch_votes_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          lobby_code: string | null
          lobby_id: string | null
          message_body: string | null
          message_id: string | null
          message_nickname: string | null
          message_team: string | null
          reason: string
          reported_guest_id: string
          reporter_guest_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          lobby_code?: string | null
          lobby_id?: string | null
          message_body?: string | null
          message_id?: string | null
          message_nickname?: string | null
          message_team?: string | null
          reason: string
          reported_guest_id: string
          reporter_guest_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          lobby_code?: string | null
          lobby_id?: string | null
          message_body?: string | null
          message_id?: string | null
          message_nickname?: string | null
          message_team?: string | null
          reason?: string
          reported_guest_id?: string
          reporter_guest_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_guest_restriction: {
        Args: {
          p_duration_minutes: number
          p_reason?: string
          p_report_id: string
          p_restriction_type: string
          p_session_token: string
        }
        Returns: {
          out_expires_at: string
          out_ok: boolean
          out_reason: string
          out_restriction_id: string
        }[]
      }
      check_participant: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_joined: boolean
        }[]
      }
      create_lobby: {
        Args: {
          p_game: string
          p_guest_id: string
          p_guest_secret: string
          p_nickname: string
          p_team: string
        }
        Returns: {
          out_code: string
        }[]
      }
      create_runback_lobby: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_code: string
          out_ok: boolean
          out_reason: string
        }[]
      }
      generate_room_code: { Args: never; Returns: string }
      get_active_guest_restrictions: {
        Args: { p_limit?: number; p_session_token: string }
        Returns: {
          out_created_at: string
          out_expires_at: string
          out_id: string
          out_reason: string
          out_restriction_type: string
          out_source_report_id: string
          out_updated_at: string
        }[]
      }
      get_enforcement_candidates: {
        Args: { p_limit?: number; p_session_token: string }
        Returns: {
          out_active_restriction: string
          out_active_until: string
          out_lobby_code: string
          out_message_body: string
          out_message_nickname: string
          out_message_team: string
          out_prior_enforcements: number
          out_reason: string
          out_report_id: string
          out_review_status: string
          out_reviewed_at: string
        }[]
      }
      get_lobby_entry: {
        Args: { p_code: string; p_guest_id?: string; p_guest_secret?: string }
        Returns: {
          out_code: string
          out_created_at: string
          out_expires_at: string
          out_game: string
          out_id: string
          out_joined: boolean
          out_last_activity_at: string
        }[]
      }
      get_lobby_realtime_token: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_token: string
        }[]
      }
      get_lobby_snapshot: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_snapshot: Json
        }[]
      }
      get_moderation_queue: {
        Args: { p_limit?: number; p_session_token: string; p_status?: string }
        Returns: {
          out_created_at: string
          out_expires_at: string
          out_id: string
          out_lobby_code: string
          out_message_body: string
          out_message_nickname: string
          out_message_team: string
          out_reason: string
          out_reported_guest_id: string
          out_reporter_guest_id: string
          out_review_note: string
          out_review_status: string
          out_reviewed_at: string
        }[]
      }
      get_runback_lobby: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_code: string
        }[]
      }
      join_lobby: {
        Args: {
          p_code: string
          p_guest_id: string
          p_guest_secret: string
          p_nickname: string
          p_team: string
        }
        Returns: {
          out_code: string
          out_game: string
          out_ok: boolean
          out_reason: string
        }[]
      }
      leave_lobby: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_ok: boolean
        }[]
      }
      lift_guest_restriction: {
        Args: {
          p_note?: string
          p_restriction_id: string
          p_session_token: string
        }
        Returns: {
          out_ok: boolean
          out_reason: string
        }[]
      }
      moderator_login: {
        Args: { p_moderator_id: string; p_secret: string }
        Returns: {
          out_expires_at: string
          out_ok: boolean
          out_token: string
        }[]
      }
      moderator_logout: { Args: { p_session_token: string }; Returns: boolean }
      report_message: {
        Args: {
          p_code: string
          p_guest_id: string
          p_guest_secret: string
          p_message_id: string
          p_reason: string
        }
        Returns: {
          out_ok: boolean
          out_reason: string
        }[]
      }
      review_report: {
        Args: {
          p_note?: string
          p_report_id: string
          p_review_status: string
          p_session_token: string
        }
        Returns: {
          out_ok: boolean
          out_reason: string
        }[]
      }
      send_message: {
        Args: {
          p_body: string
          p_code: string
          p_guest_id: string
          p_guest_secret: string
        }
        Returns: {
          out_ok: boolean
          out_reason: string
        }[]
      }
      toggle_reaction: {
        Args: {
          p_code: string
          p_emoji: string
          p_guest_id: string
          p_guest_secret: string
          p_message_id: string
        }
        Returns: {
          out_active: boolean
          out_ok: boolean
          out_reason: string
        }[]
      }
      toggle_rematch_vote: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_active: boolean
          out_count: number
          out_ok: boolean
          out_reason: string
        }[]
      }
      touch_presence: {
        Args: { p_code: string; p_guest_id: string; p_guest_secret: string }
        Returns: {
          out_ok: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
