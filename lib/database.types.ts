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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          campaign: string | null
          content: string | null
          event_name: string
          id: string
          medium: string | null
          night: string | null
          occurred_at: string
          properties: Json
          qr_code_id: string | null
          referrer: string | null
          session_id: string
          source: string | null
          user_id: string | null
          venue_id: string | null
          venue_night_id: string | null
        }
        Insert: {
          campaign?: string | null
          content?: string | null
          event_name: string
          id?: string
          medium?: string | null
          night?: string | null
          occurred_at?: string
          properties?: Json
          qr_code_id?: string | null
          referrer?: string | null
          session_id: string
          source?: string | null
          user_id?: string | null
          venue_id?: string | null
          venue_night_id?: string | null
        }
        Update: {
          campaign?: string | null
          content?: string | null
          event_name?: string
          id?: string
          medium?: string | null
          night?: string | null
          occurred_at?: string
          properties?: Json
          qr_code_id?: string | null
          referrer?: string | null
          session_id?: string
          source?: string | null
          user_id?: string | null
          venue_id?: string | null
          venue_night_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          note: string | null
          reason: string
          venue_id: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          venue_id?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          liked_id: string
          liker_id: string
          venue_id: string
          venue_night_id: string
        }
        Insert: {
          created_at?: string
          // Filled by the likes_set_expires_at BEFORE INSERT trigger.
          expires_at?: string
          id?: string
          liked_id: string
          liker_id: string
          venue_id: string
          // Filled by the likes_set_expires_at BEFORE INSERT trigger.
          venue_night_id?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          liked_id?: string
          liker_id?: string
          venue_id?: string
          venue_night_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          profile_a: string
          profile_b: string
          venue_id: string
          venue_night_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          profile_a: string
          profile_b: string
          venue_id: string
          venue_night_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          profile_a?: string
          profile_b?: string
          venue_id?: string
          venue_night_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          match_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          match_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          match_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      presence: {
        Row: {
          checked_in_at: string
          id: string
          is_visible: boolean
          last_seen_at: string
          left_at: string | null
          profile_id: string
          venue_id: string
          venue_night_id: string
        }
        Insert: {
          checked_in_at?: string
          id?: string
          is_visible?: boolean
          last_seen_at?: string
          left_at?: string | null
          profile_id: string
          venue_id: string
          venue_night_id: string
        }
        Update: {
          checked_in_at?: string
          id?: string
          is_visible?: boolean
          last_seen_at?: string
          left_at?: string | null
          profile_id?: string
          venue_id?: string
          venue_night_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          adult_confirmed_at: string | null
          created_at: string
          email: string | null
          email_marketing_consent_at: string | null
          email_marketing_consent_version: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          adult_confirmed_at?: string | null
          created_at?: string
          email?: string | null
          email_marketing_consent_at?: string | null
          email_marketing_consent_version?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          adult_confirmed_at?: string | null
          created_at?: string
          email?: string | null
          email_marketing_consent_at?: string | null
          email_marketing_consent_version?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          first_name: string
          gender: string
          id: string
          interested_in: string[]
          photo_url: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          first_name: string
          gender: string
          id: string
          interested_in: string[]
          photo_url: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          first_name?: string
          gender?: string
          id?: string
          interested_in?: string[]
          photo_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          note: string | null
          reason: string
          reported_id: string
          reporter_id: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          reported_id: string
          reporter_id: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          reported_id?: string
          reporter_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_chat_start_events: {
        Row: {
          id: string
          match_id: string
          night: string
          started_at: string
          venue_id: string
          venue_night_id: string | null
        }
        Insert: {
          id?: string
          match_id: string
          night: string
          started_at?: string
          venue_id: string
          venue_night_id?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          night?: string
          started_at?: string
          venue_id?: string
          venue_night_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_chat_start_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_chat_start_events_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_conversation_events: {
        Row: {
          engaged_at: string | null
          first_message_at: string
          first_sender_id: string | null
          id: string
          match_id: string
          message_count: number
          night: string
          participant_count: number
          reciprocal_at: string | null
          replied_at: string | null
          updated_at: string
          venue_id: string
          venue_night_id: string | null
        }
        Insert: {
          engaged_at?: string | null
          first_message_at: string
          first_sender_id?: string | null
          id?: string
          match_id: string
          message_count?: number
          night: string
          participant_count?: number
          reciprocal_at?: string | null
          replied_at?: string | null
          updated_at?: string
          venue_id: string
          venue_night_id?: string | null
        }
        Update: {
          engaged_at?: string | null
          first_message_at?: string
          first_sender_id?: string | null
          id?: string
          match_id?: string
          message_count?: number
          night?: string
          participant_count?: number
          reciprocal_at?: string | null
          replied_at?: string | null
          updated_at?: string
          venue_id?: string
          venue_night_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_conversation_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_conversation_events_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_ejections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          night: string
          note: string | null
          profile_id: string
          reason: string
          venue_id: string
          venue_night_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          night: string
          note?: string | null
          profile_id: string
          reason: string
          venue_id: string
          venue_night_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          night?: string
          note?: string | null
          profile_id?: string
          reason?: string
          venue_id?: string
          venue_night_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_ejections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_ejections_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_ejections_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_match_events: {
        Row: {
          id: string
          match_id: string
          matched_at: string
          night: string
          venue_id: string
          venue_night_id: string | null
        }
        Insert: {
          id?: string
          match_id: string
          matched_at?: string
          night: string
          venue_id: string
          venue_night_id?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          matched_at?: string
          night?: string
          venue_id?: string
          venue_night_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_match_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_match_events_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_night_transitions: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_status: string
          id: number
          reason: string | null
          to_status: string
          venue_night_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_status: string
          id?: never
          reason?: string | null
          to_status: string
          venue_night_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_status?: string
          id?: never
          reason?: string | null
          to_status?: string
          venue_night_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_night_transitions_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_nights: {
        Row: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          created_by?: string | null
          guaranteed_launch_at: string
          id?: string
          launch_reason?: string | null
          launch_threshold?: number
          launched_at?: string | null
          opened_at?: string | null
          status?: string
          terminal_at?: string | null
          terminal_reason?: string | null
          updated_at?: string
          venue_id: string
          waiting_opens_at: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          created_by?: string | null
          guaranteed_launch_at?: string
          id?: string
          launch_reason?: string | null
          launch_threshold?: number
          launched_at?: string | null
          opened_at?: string | null
          status?: string
          terminal_at?: string | null
          terminal_reason?: string | null
          updated_at?: string
          venue_id?: string
          waiting_opens_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_nights_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_scan_events: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          night: string
          user_id: string
          venue_id: string
          venue_night_id: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          night: string
          user_id: string
          venue_id: string
          venue_night_id?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          night?: string
          user_id?: string
          venue_id?: string
          venue_night_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_scan_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_scan_events_venue_night_id_fkey"
            columns: ["venue_night_id"]
            isOneToOne: false
            referencedRelation: "venue_nights"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_live: boolean
          is_test_venue: boolean
          name: string
          profile_preview_enabled: boolean
          rollover_disabled: boolean
          slug: string
          timezone: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_live?: boolean
          is_test_venue?: boolean
          name: string
          profile_preview_enabled?: boolean
          rollover_disabled?: boolean
          slug: string
          timezone?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_live?: boolean
          is_test_venue?: boolean
          name?: string
          profile_preview_enabled?: boolean
          rollover_disabled?: boolean
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_founder_analytics: {
        Args: never
        Returns: {
          chat_openers: number
          chat_opens: number
          checkins: number
          conversations_started: number
          discovery_openers: number
          engaged_conversations: number
          first_message_senders: number
          interested_in_men_checkins: number
          interested_in_nonbinary_checkins: number
          interested_in_women_checkins: number
          landing_views: number
          men_checkins: number
          multi_gender_interest_checkins: number
          night: string
          nonbinary_checkins: number
          peak_activity_hour: number
          peak_scan_hour: number
          profile_completions: number
          profile_viewers: number
          profile_views: number
          profiles_created: number
          reciprocal_conversations: number
          replied_conversations: number
          returning_other_venue_users: number
          returning_same_venue_users: number
          returning_users: number
          same_gender_interest_checkins: number
          scan_checkins: number
          scans: number
          sessions: number
          top_campaign: string
          top_medium: string
          top_qr_code_id: string
          top_source: string
          unique_scanners: number
          venue_city: string
          venue_experience_openers: number
          venue_id: string
          venue_name: string
          women_checkins: number
        }[]
      }
      admin_night_stats: {
        Args: never
        Returns: {
          chats_started: number
          checkins: number
          interested_in_men_checkins: number
          interested_in_nonbinary_checkins: number
          interested_in_women_checkins: number
          likes: number
          likes_from_men: number
          likes_from_nonbinary: number
          likes_from_women: number
          matches: number
          men_checkins: number
          multi_gender_interest_checkins: number
          night: string
          nonbinary_checkins: number
          profile_completions: number
          profile_dropoffs: number
          same_gender_interest_checkins: number
          scans: number
          venue_id: string
          venue_name: string
          women_checkins: number
        }[]
      }
      am_i_admin: { Args: never; Returns: boolean }
      cancel_venue_night: {
        Args: { p_venue_night_id: string }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in: {
        Args: { p_venue_id: string }
        Returns: {
          checked_in_at: string
          id: string
          is_visible: boolean
          last_seen_at: string
          left_at: string | null
          profile_id: string
          venue_id: string
          venue_night_id: string
        }
        SetofOptions: {
          from: "*"
          to: "presence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_ended_nights: { Args: never; Returns: number }
      close_venue_night: {
        Args: { p_venue_night_id: string }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      eject_from_venue: {
        Args: {
          p_note?: string
          p_profile_id: string
          p_reason: string
          p_venue_id: string
        }
        Returns: number
      }
      launch_venue_night: {
        Args: { p_venue_night_id: string }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_venue_night: {
        Args: { p_venue_night_id: string }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_room_profiles: {
        Args: { p_venue_id: string }
        Returns: {
          bio: string
          first_name: string
          gender: string
          id: string
          interested_in: string[]
          photo_url: string
          profile_created_at: string
        }[]
      }
      record_chat_started: { Args: { p_match_id: string }; Returns: undefined }
      record_venue_scan: { Args: { p_venue_id: string }; Returns: undefined }
      reopen_venue_night: {
        Args: { p_venue_night_id: string }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_to_venue: {
        Args: { p_profile_id: string; p_venue_id: string }
        Returns: undefined
      }
      run_venue_night_lifecycle: { Args: never; Returns: number }
      schedule_venue_night: {
        Args: {
          p_closes_at: string
          p_guaranteed_launch_at: string
          p_launch_threshold?: number
          p_venue_id: string
          p_waiting_opens_at: string
        }
        Returns: {
          closes_at: string
          created_at: string
          created_by: string | null
          guaranteed_launch_at: string
          id: string
          launch_reason: string | null
          launch_threshold: number
          launched_at: string | null
          opened_at: string | null
          status: string
          terminal_at: string | null
          terminal_reason: string | null
          updated_at: string
          venue_id: string
          waiting_opens_at: string
        }
        SetofOptions: {
          from: "*"
          to: "venue_nights"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_venue_live: {
        Args: { p_live: boolean; p_venue_id: string }
        Returns: {
          city: string | null
          created_at: string
          id: string
          is_live: boolean
          is_test_venue: boolean
          name: string
          profile_preview_enabled: boolean
          rollover_disabled: boolean
          slug: string
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "venues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_venue_profile_preview: {
        Args: { p_enabled: boolean; p_venue_id: string }
        Returns: {
          city: string | null
          created_at: string
          id: string
          is_live: boolean
          is_test_venue: boolean
          name: string
          profile_preview_enabled: boolean
          rollover_disabled: boolean
          slug: string
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "venues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_analytics_event: {
        Args: {
          p_campaign?: string
          p_content?: string
          p_event_name: string
          p_medium?: string
          p_properties?: Json
          p_qr_code_id?: string
          p_referrer?: string
          p_session_id: string
          p_source?: string
          p_venue_id?: string
        }
        Returns: undefined
      }
      venue_night_state: {
        Args: { p_venue_id: string }
        Returns: {
          closes_at: string
          guaranteed_launch_at: string
          launch_threshold: number
          participant_count: number
          status: string
          venue_night_id: string
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
