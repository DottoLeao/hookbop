
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "answers": {
                  Row: {
                    "before_line_end": boolean | null,"blank_id": string,"correct": boolean,"kind": string,"play_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "before_line_end"?: boolean | null,"blank_id": string,"correct": boolean,"kind": string,"play_id": string
                  }
                  Update: {
                    "before_line_end"?: boolean | null,"blank_id"?: string,"correct"?: boolean,"kind"?: string,"play_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "answers_play_id_fkey"
      columns: ["play_id"]
isOneToOne: false
      referencedRelation: "plays"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
                  Row: {
                    "key": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"value": string
                  }
                  Update: {
                    "key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"help_requests": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: number,"kind"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invites": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"created_by": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_used_by_fkey"
      columns: ["used_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"line_help": {
                  Row: {
                    "content": string,"created_at": string,"kind": string,"line_index": number,"lyrics_ref": string,"target": string,"youtube_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"kind": string,"line_index": number,"lyrics_ref": string,"target"?: string,"youtube_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"kind"?: string,"line_index"?: number,"lyrics_ref"?: string,"target"?: string,"youtube_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plays": {
                  Row: {
                    "created_at": string,"difficulty": string | null,"double_xp_used": boolean,"first_try_correct": number | null,"id": string,"max_combo": number | null,"mode": string | null,"pct": number | null,"time_to_ready_ms": number | null,"total_blanks": number | null,"user_id": string,"xp": number | null,"youtube_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"difficulty"?: string | null,"double_xp_used"?: boolean,"first_try_correct"?: number | null,"id"?: string,"max_combo"?: number | null,"mode"?: string | null,"pct"?: number | null,"time_to_ready_ms"?: number | null,"total_blanks"?: number | null,"user_id": string,"xp"?: number | null,"youtube_id": string
                  }
                  Update: {
                    "created_at"?: string,"difficulty"?: string | null,"double_xp_used"?: boolean,"first_try_correct"?: number | null,"id"?: string,"max_combo"?: number | null,"mode"?: string | null,"pct"?: number | null,"time_to_ready_ms"?: number | null,"total_blanks"?: number | null,"user_id"?: string,"xp"?: number | null,"youtube_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plays_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plays_youtube_id_fkey"
      columns: ["youtube_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["youtube_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"is_owner": boolean,"removed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"is_owner"?: boolean,"removed_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"is_owner"?: boolean,"removed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"video_offset_votes": {
                  Row: {
                    "created_at": string,"offset_ms": number,"user_id": string,"youtube_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"offset_ms": number,"user_id": string,"youtube_id": string
                  }
                  Update: {
                    "created_at"?: string,"offset_ms"?: number,"user_id"?: string,"youtube_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "video_offset_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "video_offset_votes_youtube_id_fkey"
      columns: ["youtube_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["youtube_id"]
    }
                  ]
                },"videos": {
                  Row: {
                    "channel": string | null,"duration_s": number | null,"lyrics_duration_s": number | null,"lyrics_lrc": string | null,"lyrics_ref": string | null,"lyrics_source": string | null,"offset_ms": number,"status": string | null,"title": string | null,"updated_at": string,"youtube_id": string,"yt_fetched_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: string | null,"duration_s"?: number | null,"lyrics_duration_s"?: number | null,"lyrics_lrc"?: string | null,"lyrics_ref"?: string | null,"lyrics_source"?: string | null,"offset_ms"?: number,"status"?: string | null,"title"?: string | null,"updated_at"?: string,"youtube_id": string,"yt_fetched_at"?: string | null
                  }
                  Update: {
                    "channel"?: string | null,"duration_s"?: number | null,"lyrics_duration_s"?: number | null,"lyrics_lrc"?: string | null,"lyrics_ref"?: string | null,"lyrics_source"?: string | null,"offset_ms"?: number,"status"?: string | null,"title"?: string | null,"updated_at"?: string,"youtube_id"?: string,"yt_fetched_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_double_xp":
{ Args: { "p_play_id": string }; Returns: number
                           },
"ensure_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"redeem_invite":
{ Args: { "p_code": string,"p_display_name": string }; Returns: string
                           },
"release_help_request":
{ Args: { "p_id": number }; Returns: undefined
                           },
"remove_member":
{ Args: { "p_user": string }; Returns: undefined
                           },
"reserve_help_request":
{ Args: { "p_kind": string,"p_limit": number,"p_user_id": string }; Returns: number
                           },
"set_offset_vote":
{ Args: { "p_offset_ms": number,"p_youtube_id": string }; Returns: number
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
