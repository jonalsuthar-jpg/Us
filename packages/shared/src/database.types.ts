/**
 * Database types for the Phase 1–2 schema (supabase/migrations/*foundation.sql).
 *
 * Hand-maintained in the shape `supabase gen types typescript` produces, so it
 * can be swapped for generated output (`npm run db:types`) at any time.
 * Phase 3 tables are omitted until those features are built.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CallMedia = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
export type MessageKind = 'text' | 'call';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MemoryKind = 'moment' | 'trip' | 'date';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      couples: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          paired_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invites: {
        Row: {
          code: string;
          created_by: string;
          created_at: string;
          expires_at: string;
          redeemed_by: string | null;
          redeemed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          couple_id: string;
          caller_id: string;
          callee_id: string;
          media: CallMedia;
          status: CallStatus;
          created_at: string;
          answered_at: string | null;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          couple_id: string;
          caller_id: string;
          callee_id: string;
          media?: CallMedia;
          status?: 'ringing';
        };
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          couple_id: string;
          sender_id: string;
          kind: MessageKind;
          body: string | null;
          call_id: string | null;
          status: MessageStatus;
          delivered_at: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          sender_id: string;
          kind?: 'text';
          body: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'messages_call_id_fkey';
            columns: ['call_id'];
            isOneToOne: true;
            referencedRelation: 'calls';
            referencedColumns: ['id'];
          },
        ];
      };
      // ------------------------------------------------------------ Phase 4
      calendar_events: {
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          title: string;
          starts_at: string;
          ends_at: string | null;
          all_day: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          starts_at: string;
          ends_at?: string | null;
          all_day?: boolean;
          notes?: string | null;
        };
        Update: {
          title?: string;
          starts_at?: string;
          ends_at?: string | null;
          all_day?: boolean;
          notes?: string | null;
        };
        Relationships: [];
      };
      decision_options: {
        Row: {
          id: string;
          couple_id: string;
          category: string;
          label: string;
          weight: number;
          times_picked: number;
          last_picked_at: string | null;
          created_at: string;
        };
        Insert: { id?: string; couple_id: string; category: string; label: string; weight?: number };
        Update: { category?: string; label?: string; weight?: number };
        Relationships: [];
      };
      labor_entries: {
        Row: {
          id: string;
          couple_id: string;
          done_by: string;
          task: string;
          effort: number;
          done_on: string;
          created_at: string;
        };
        Insert: { id?: string; couple_id: string; done_by: string; task: string; effort?: number; done_on?: string };
        Update: { done_by?: string; task?: string; effort?: number; done_on?: string };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          couple_id: string;
          paid_by: string;
          description: string;
          amount_cents: number;
          currency: string;
          split_a_pct: number;
          spent_on: string;
          is_settlement: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          paid_by: string;
          description: string;
          amount_cents: number;
          currency?: string;
          split_a_pct?: number;
          spent_on?: string;
          is_settlement?: boolean;
        };
        Update: {
          paid_by?: string;
          description?: string;
          amount_cents?: number;
          currency?: string;
          split_a_pct?: number;
          spent_on?: string;
        };
        Relationships: [];
      };
      // ------------------------------------------------------------ Phase 5
      memories: {
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          title: string;
          body: string | null;
          happened_on: string;
          photo_path: string | null;
          kind: MemoryKind;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          title: string;
          body?: string | null;
          happened_on: string;
          photo_path?: string | null;
          kind?: MemoryKind;
        };
        Update: { title?: string; body?: string | null; happened_on?: string; photo_path?: string | null; kind?: MemoryKind };
        Relationships: [];
      };
      memory_ratings: {
        Row: { memory_id: string; owner_id: string; rating: number | null; note: string | null };
        Insert: { memory_id: string; owner_id: string; rating?: number | null; note?: string | null };
        Update: { rating?: number | null; note?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_invite: { Args: Record<PropertyKey, never>; Returns: Database['public']['Tables']['invites']['Row'] };
      redeem_invite: { Args: { invite_code: string }; Returns: Database['public']['Tables']['couples']['Row'] };
      ack_messages: { Args: { p_status: MessageStatus; p_ids?: string[] | null }; Returns: number };
      set_call_status: {
        Args: { p_call_id: string; p_status: CallStatus };
        Returns: Database['public']['Tables']['calls']['Row'];
      };
      expire_stale_calls: { Args: Record<PropertyKey, never>; Returns: number };
      current_couple_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      current_partner_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      pick_decision: {
        Args: { p_category: string };
        Returns: Database['public']['Tables']['decision_options']['Row'];
      };
    };
    Enums: {
      call_media: CallMedia;
      call_status: CallStatus;
      message_kind: MessageKind;
      message_status: MessageStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type Tables = Database['public']['Tables'];
export type Profile = Tables['profiles']['Row'];
export type Couple = Tables['couples']['Row'];
export type Invite = Tables['invites']['Row'];
export type Call = Tables['calls']['Row'];
export type MessageRow = Tables['messages']['Row'];
export type CalendarEvent = Tables['calendar_events']['Row'];
export type DecisionOption = Tables['decision_options']['Row'];
export type LaborEntry = Tables['labor_entries']['Row'];
export type Expense = Tables['expenses']['Row'];
export type Memory = Tables['memories']['Row'];
export type MemoryRating = Tables['memory_ratings']['Row'];

/** A message as rendered in the thread: call log entries carry their call. */
export type Message = MessageRow & {
  call?: Call | null;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  /** Client-only: send failed; can be retried. */
  failed?: boolean;
};
