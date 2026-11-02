// Stub escrito a mano con la forma de `supabase gen types typescript`.
// Regenerar con `pnpm db:types` cuando la base esté arriba y reemplazar este archivo.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LeadStatus =
  | "nuevo"
  | "calificado"
  | "descartado"
  | "contactado"
  | "respondio"
  | "interesado"
  | "no_interesado"
  | "baja";
type Channel = "whatsapp" | "email";

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  growvibe: {
    Tables: {
      profiles: Table<{ id: string; full_name: string | null; role: string }, "id">;
      campaigns: Table<
        {
          id: string;
          zone: string;
          service: string;
          zone_bounds: Json | null;
          niches: Json | null;
          queries: Json | null;
          channels: Channel[];
          status: string;
          created_by: string | null;
          created_at: string;
        },
        "zone" | "service"
      >;
      leads: Table<
        {
          id: string;
          campaign_id: string | null;
          place_id: string;
          name: string;
          niche: string | null;
          address: string | null;
          phone_e164: string | null;
          has_whatsapp: boolean | null;
          whatsapp_jid: string | null;
          email: string | null;
          website: string | null;
          rating: number | null;
          reviews_count: number | null;
          maps_url: string | null;
          score: number | null;
          score_reason: string | null;
          status: LeadStatus;
          assigned_to: string | null;
          created_at: string;
        },
        "place_id" | "name"
      >;
      messages: Table<
        {
          id: string;
          lead_id: string | null;
          channel: Channel;
          direction: string;
          subject: string | null;
          body: string;
          status: string;
          provider_id: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          classification: string | null;
          created_at: string;
        },
        "channel" | "direction" | "body"
      >;
      opt_outs: Table<
        { id: string; phone_e164: string | null; email: string | null; reason: string | null; created_at: string },
        never
      >;
      settings: Table<
        {
          id: number;
          whatsapp_daily_limit: number;
          email_daily_limit: number;
          send_window_start: string;
          send_window_end: string;
          send_days: number[];
          min_delay_seconds: number;
          max_delay_seconds: number;
          warmup_enabled: boolean;
          sender_signature: string | null;
          privacy_url: string | null;
        },
        never
      >;
      events: Table<
        { id: number; lead_id: string | null; type: string; data: Json | null; created_at: string },
        "type"
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_member: { Args: Record<string, never>; Returns: boolean };
      my_role: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: { lead_status: LeadStatus; channel: Channel };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["growvibe"]["Tables"]> = Database["growvibe"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["growvibe"]["Tables"]> =
  Database["growvibe"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["growvibe"]["Tables"]> =
  Database["growvibe"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["growvibe"]["Enums"]> = Database["growvibe"]["Enums"][T];
