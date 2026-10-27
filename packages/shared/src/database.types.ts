/**
 * Database types for the Phase 1–2 schema (supabase/migrations/*foundation.sql).
 *
 * Hand-maintained in the shape `supabase gen types typescript` produces, so it
 * can be swapped for generated output (`npm run db:types`) at any time.
 * Phase 3 tables without a UI yet (letters, fights, jokes) are omitted.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** audio / video calls, plus Listen together (sound only) and Watch together (a shared screen). */
export type CallMedia = 'audio' | 'video' | 'listen' | 'watch';
/** image / audio live in our chat folder; gif / sticker are GIPHY links (media_meta.url). */
export type MediaKind = 'image' | 'audio' | 'gif' | 'sticker';
/** Small, optional hints for rendering before the file loads. */
export interface MediaMeta {
  width?: number;
  height?: number;
  duration_ms?: number;
  /** GIFs and stickers: the GIPHY media URL. */
  url?: string;
  [key: string]: number | string | undefined;
}
export type ListName = 'groceries' | 'bucket' | 'watch' | 'read';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
export type MessageKind = 'text' | 'call';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type AccessStatusEnum = 'pending' | 'approved' | 'rejected' | 'suspended';
export type MemoryKind = 'moment' | 'trip' | 'date';
export type LoveLanguage = 'words' | 'acts' | 'gifts' | 'time' | 'touch';
export type SparkKind =
  | 'first_move'
  | 'message'
  | 'media'
  | 'tap'
  | 'snap'
  | 'status'
  | 'call_start'
  | 'call_pickup'
  | 'call_minutes'
  | 'question'
  | 'together';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          /** Shared "how I am right now" status, shown on Home (fades after 24h). */
          status_emoji: string | null;
          status_text: string | null;
          status_at: string | null;
          /** The device's IANA zone; partner A's sets the couple's "today" for the plant. */
          timezone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          status_emoji?: string | null;
          status_text?: string | null;
          status_at?: string | null;
          timezone?: string | null;
        };
        Relationships: [];
      };
      couples: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          paired_at: string;
          /** "Photo of us": a key in the private memories bucket, under the couple's folder. */
          photo_path: string | null;
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
          reply_to: string | null;
          /** "<couple_id>/<uuid>.<ext>" in the private chat bucket. */
          media_path: string | null;
          media_kind: MediaKind | null;
          media_meta: MediaMeta | null;
          /** One reaction per person: { [userId]: emoji }. Set via react_to_message(). */
          reactions: Record<string, string>;
          pinned_at: string | null;
          pinned_by: string | null;
          /** A reply to one of our snaps (kept after the snap itself is gone). */
          snap_id: string | null;
        };
        Insert: {
          id?: string;
          couple_id: string;
          sender_id: string;
          kind?: 'text';
          body?: string | null;
          created_at?: string;
          reply_to?: string | null;
          media_path?: string | null;
          media_kind?: MediaKind | null;
          media_meta?: MediaMeta | null;
          snap_id?: string | null;
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
          /** The snap this memory was kept from. */
          from_snap: string | null;
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
          from_snap?: string | null;
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
      // ------------------------------------------------------------ Phase 3
      daily_questions: {
        Row: { id: string; couple_id: string; prompt: string; for_date: string };
        /** Created by todays_question() only. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      daily_answers: {
        Row: { question_id: string; owner_id: string; answer: string; created_at: string };
        Insert: { question_id: string; owner_id: string; answer: string };
        /** Answers are sealed once sent. */
        Update: never;
        Relationships: [];
      };
      // --------------------------------------------------------- Together
      countdowns: {
        Row: { id: string; couple_id: string; created_by: string; title: string; emoji: string | null; on_date: string; yearly: boolean; created_at: string };
        Insert: { id?: string; couple_id: string; created_by: string; title: string; emoji?: string | null; on_date: string; yearly?: boolean };
        Update: { title?: string; emoji?: string | null; on_date?: string; yearly?: boolean };
        Relationships: [];
      };
      list_items: {
        Row: {
          id: string;
          couple_id: string;
          list: ListName;
          text: string;
          note: string | null;
          added_by: string;
          done_at: string | null;
          done_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; couple_id: string; list: ListName; text: string; note?: string | null; added_by: string };
        Update: { text?: string; note?: string | null; done_at?: string | null; done_by?: string | null };
        Relationships: [];
      };
      taps: {
        Row: { id: string; couple_id: string; from_id: string; created_at: string };
        Insert: { id?: string; couple_id: string; from_id: string };
        Update: never;
        Relationships: [];
      };
      snaps: {
        Row: {
          id: string;
          couple_id: string;
          author_id: string;
          /** "<couple_id>/<uuid>.<ext>" in the private snaps bucket. */
          photo_path: string;
          caption: string | null;
          created_at: string;
          /** Unreadable for both of us from then on; cleaned up hourly. */
          expires_at: string;
          seen_at: string | null;
          reaction: string | null;
          reacted_at: string | null;
        };
        Insert: { id?: string; couple_id: string; author_id: string; photo_path: string; caption?: string | null };
        Update: never;
        Relationships: [];
      };
      plant_days: {
        /** When each of us first did something for the other that day. Written by triggers only. */
        Row: { couple_id: string; day: string; a_at: string | null; b_at: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      spark_events: {
        /** Sparks one of us earned. I can read only my own. Written by triggers only. */
        Row: {
          id: number;
          couple_id: string;
          /** Null for the together bonus, which is ours. */
          user_id: string | null;
          day: string;
          kind: SparkKind;
          sparks: number;
          source: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      spark_seasons: {
        /** Our running total for a month (season is its first day). Written by triggers only. */
        Row: {
          couple_id: string;
          season: string;
          carry_in: number;
          sparks: number;
          today: string | null;
          today_sparks: number;
          notified_rank: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      location_shares: {
        Row: {
          owner_id: string;
          couple_id: string;
          lat: number | null;
          lng: number | null;
          accuracy_m: number | null;
          updated_at: string | null;
          sharing_until: string | null;
        };
        Insert: {
          owner_id: string;
          couple_id: string;
          lat?: number | null;
          lng?: number | null;
          accuracy_m?: number | null;
          sharing_until?: string | null;
        };
        Update: { lat?: number | null; lng?: number | null; accuracy_m?: number | null; sharing_until?: string | null };
        Relationships: [];
      };
      arrival_checks: {
        Row: {
          id: string;
          couple_id: string;
          requested_by: string;
          traveller_id: string;
          label: string;
          created_at: string;
          arrived_at: string | null;
          cancelled_at: string | null;
        };
        Insert: { id?: string; couple_id: string; requested_by: string; traveller_id: string; label?: string };
        Update: never;
        Relationships: [];
      };
      // ------------------------------------------------------------ Phase 6
      goals: {
        Row: {
          id: string;
          couple_id: string;
          /** null = a shared goal ("ours"). */
          owner_id: string | null;
          title: string;
          progress: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; couple_id: string; owner_id: string | null; title: string; progress?: number };
        Update: { title?: string; progress?: number };
        Relationships: [];
      };
      mood_checkins: {
        Row: { id: string; owner_id: string; score: number; note: string | null; nudge_partner: boolean; created_at: string };
        Insert: { id?: string; owner_id: string; score: number; note?: string | null; nudge_partner?: boolean };
        Update: { note?: string | null };
        Relationships: [];
      };
      insecurity_checkins: {
        Row: { id: string; owner_id: string; body: string; shared_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; body: string };
        Update: { body?: string; shared_at?: string | null };
        Relationships: [];
      };
      love_language_results: {
        Row: { owner_id: string; scores: Json; primary_language: LoveLanguage; shared: boolean; taken_at: string };
        Insert: { owner_id: string; scores: Json; primary_language: LoveLanguage; shared?: boolean; taken_at?: string };
        Update: { scores?: Json; primary_language?: LoveLanguage; shared?: boolean; taken_at?: string };
        Relationships: [];
      };
      features: {
        Row: { key: string; label: string; module: string; sort: number; enabled: boolean; disabled_message: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      plans: {
        Row: { id: string; name: string; features: string[]; is_default: boolean; price_note: string | null; sort: number; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_access: {
        Row: {
          user_id: string;
          status: AccessStatusEnum;
          is_admin: boolean;
          protected: boolean;
          plan_id: string | null;
          features: string[];
          reason: string | null;
          note: string | null;
          requested_at: string;
          decided_at: string | null;
          decided_by: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stickers: {
        Row: { id: string; couple_id: string; created_by: string; path: string; width: number; height: number; created_at: string };
        Insert: { id?: string; couple_id: string; created_by: string; path: string; width?: number; height?: number };
        Update: never;
        Relationships: [];
      };
      // ------------------------------------------------------- Draw together
      drawings: {
        Row: {
          id: string;
          couple_id: string;
          created_by: string;
          kind: 'canvas' | 'doodle' | 'guess' | 'daily';
          title: string | null;
          note: string | null;
          strokes_path: string;
          png_path: string;
          width: number;
          height: number;
          stroke_count: number;
          artists: string[];
          for_user: string | null;
          seen_at: string | null;
          memory_id: string | null;
          day: string | null;
          prompt: string | null;
          game_id: string | null;
          round: number | null;
          meta: Json;
          answered_at: string | null;
          solved: boolean | null;
          answer_ms: number | null;
          points: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          created_by: string;
          kind?: 'canvas' | 'doodle' | 'guess' | 'daily';
          title?: string | null;
          note?: string | null;
          strokes_path: string;
          png_path: string;
          width?: number;
          height?: number;
          stroke_count?: number;
          artists?: string[];
          for_user?: string | null;
          day?: string | null;
          prompt?: string | null;
          game_id?: string | null;
          round?: number | null;
          meta?: Json;
        };
        Update: { title?: string | null; memory_id?: string | null };
        Relationships: [];
      };
      draw_words: {
        Row: { id: string; couple_id: string; word: string; added_by: string; created_at: string };
        Insert: { id?: string; couple_id: string; word: string; added_by: string };
        Update: never;
        Relationships: [];
      };
      draw_secrets: {
        Row: { drawing_id: string; couple_id: string; word: string };
        Insert: { drawing_id: string; couple_id: string; word: string };
        Update: never;
        Relationships: [];
      };
      draw_games: {
        Row: {
          id: string;
          couple_id: string;
          started_by: string;
          mode: 'live' | 'turns';
          packs: string[];
          rounds: number;
          draw_ms: number;
          hints: number;
          choices: number;
          played: number;
          score: number;
          solved: number;
          best_word: string | null;
          best_ms: number | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; couple_id: string; started_by: string; mode?: 'live' | 'turns'; packs?: string[]; rounds?: number; draw_ms?: number; hints?: number; choices?: number };
        Update: never;
        Relationships: [];
      };
      announcements: {
        Row: { id: string; body: string; tone: 'note' | 'warning'; starts_at: string; ends_at: string | null; created_by: string | null; created_at: string };
        Insert: never;
        Update: never;
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
      partner_nudges: { Args: { p_hours?: number }; Returns: { nudged_at: string }[] };
      set_couple_photo: { Args: { p_path: string | null }; Returns: Database['public']['Tables']['couples']['Row'] };
      pick_decision: {
        Args: { p_category: string };
        Returns: Database['public']['Tables']['decision_options']['Row'];
      };
      todays_question: {
        Args: { p_date?: string | null };
        Returns: Database['public']['Tables']['daily_questions']['Row'];
      };
      daily_history: {
        Args: { p_limit?: number };
        Returns: {
          question_id: string;
          prompt: string;
          for_date: string;
          my_answer: string | null;
          my_answered_at: string | null;
          partner_answered: boolean;
          /** Only once both of us have answered. */
          partner_answer: string | null;
        }[];
      };
      unpair: { Args: Record<PropertyKey, never>; Returns: undefined };
      mark_arrived: { Args: { p_id: string }; Returns: Database['public']['Tables']['arrival_checks']['Row'] };
      cancel_arrival: { Args: { p_id: string }; Returns: Database['public']['Tables']['arrival_checks']['Row'] };
      react_to_message: { Args: { p_id: string; p_emoji: string | null }; Returns: Database['public']['Tables']['messages']['Row'] };
      pin_message: { Args: { p_id: string; p_pinned: boolean }; Returns: Database['public']['Tables']['messages']['Row'] };
      mark_snap_seen: { Args: { p_id: string }; Returns: Database['public']['Tables']['snaps']['Row'] };
      react_to_snap: { Args: { p_id: string; p_emoji: string | null }; Returns: Database['public']['Tables']['snaps']['Row'] };
      my_access: { Args: Record<PropertyKey, never>; Returns: Json };
      has_feature: { Args: { p_feature: string }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      admin_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_list_people: { Args: { p_status?: AccessStatusEnum | null; p_search?: string | null }; Returns: Json[] };
      admin_decide: {
        Args: { p_user: string; p_status: AccessStatusEnum; p_plan?: string | null; p_features?: string[] | null; p_reason?: string | null };
        Returns: Database['public']['Tables']['user_access']['Row'];
      };
      admin_set_couple_features: { Args: { p_couple: string; p_plan?: string | null; p_features?: string[] | null }; Returns: undefined };
      admin_set_note: { Args: { p_user: string; p_note: string }; Returns: undefined };
      admin_set_admin: { Args: { p_user: string; p_admin: boolean }; Returns: undefined };
      admin_set_feature: { Args: { p_key: string; p_enabled: boolean; p_message?: string | null }; Returns: Database['public']['Tables']['features']['Row'] };
      admin_save_plan: {
        Args: { p_id: string; p_name: string; p_features: string[]; p_default?: boolean; p_price_note?: string | null };
        Returns: Database['public']['Tables']['plans']['Row'];
      };
      admin_delete_plan: { Args: { p_id: string }; Returns: undefined };
      admin_post_announcement: {
        Args: { p_body: string; p_tone?: string; p_ends_at?: string | null };
        Returns: Database['public']['Tables']['announcements']['Row'];
      };
      admin_end_announcement: { Args: { p_id: string }; Returns: undefined };
      admin_audit_log: { Args: { p_limit?: number }; Returns: Json[] };
      mark_doodle_seen: { Args: { p_id: string }; Returns: Database['public']['Tables']['drawings']['Row'] };
      drew_daily: { Args: { p_day: string }; Returns: boolean };
      daily_doodle_status: { Args: { p_day: string }; Returns: { mine: boolean; partner: boolean }[] };
      finish_draw_game: {
        Args: { p_id: string; p_played: number; p_score: number; p_solved: number; p_best_word: string | null; p_best_ms: number | null };
        Returns: Database['public']['Tables']['draw_games']['Row'];
      };
      answer_guess: {
        Args: { p_drawing: string; p_solved: boolean; p_ms: number; p_points: number };
        Returns: Database['public']['Tables']['draw_games']['Row'];
      };
    };
    Enums: {
      call_media: CallMedia;
      call_status: CallStatus;
      message_kind: MessageKind;
      message_status: MessageStatus;
      access_status: AccessStatusEnum;
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
export type Goal = Tables['goals']['Row'];
export type MoodCheckin = Tables['mood_checkins']['Row'];
export type Worry = Tables['insecurity_checkins']['Row'];
export type LoveLanguageResult = Tables['love_language_results']['Row'];
export type DailyQuestion = Tables['daily_questions']['Row'];
export type Countdown = Tables['countdowns']['Row'];
export type ListItem = Tables['list_items']['Row'];
export type Tap = Tables['taps']['Row'];
export type SnapRow = Tables['snaps']['Row'];
export type PlantDay = Tables['plant_days']['Row'];
export type SparkEvent = Tables['spark_events']['Row'];
export type SparkSeason = Tables['spark_seasons']['Row'];
export type LocationShare = Tables['location_shares']['Row'];
export type ArrivalCheck = Tables['arrival_checks']['Row'];
export type Drawing = Tables['drawings']['Row'];
export type Sticker = Tables['stickers']['Row'];
export type DrawWord = Tables['draw_words']['Row'];
export type DrawGame = Tables['draw_games']['Row'];
export type DailyEntry = Database['public']['Functions']['daily_history']['Returns'][number];

/** A message as rendered in the thread: call log entries carry their call. */
export type Message = MessageRow & {
  call?: Call | null;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  /** Client-only: send failed; can be retried. */
  failed?: boolean;
  /** Client-only: a local preview (object URL / file URI) while media uploads. */
  localUri?: string;
  /** Client-only: the file still to upload, kept so a failed send can retry. */
  upload?: { body: Blob | ArrayBuffer | Uint8Array; contentType: string };
};
