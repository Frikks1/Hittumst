export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      album_items: {
        Row: {
          album_id: string
          byte_size: number
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          id: string
          media_type: string
          owner_id: string
          position: number
          storage_path: string
        }
        Insert: {
          album_id: string
          byte_size: number
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          id?: string
          media_type: string
          owner_id: string
          position: number
          storage_path: string
        }
        Update: {
          album_id?: string
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          id?: string
          media_type?: string
          owner_id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_items_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_reactions: {
        Row: {
          created_at: string
          emoji: string
          item_id: string
          reactor_id: string
          share_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          item_id: string
          reactor_id: string
          share_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          item_id?: string
          reactor_id?: string
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_reactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "album_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_reactions_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "album_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      album_shares: {
        Row: {
          accepted_at: string | null
          access_mode: string
          album_id: string
          consumed_at: string | null
          conversation_id: string
          expires_at: string | null
          id: string
          last_viewed_version: number
          owner_id: string
          recipient_id: string
          revoked_at: string | null
          shared_at: string
          shared_version: number
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_mode: string
          album_id: string
          consumed_at?: string | null
          conversation_id: string
          expires_at?: string | null
          id?: string
          last_viewed_version?: number
          owner_id: string
          recipient_id: string
          revoked_at?: string | null
          shared_at?: string
          shared_version: number
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_mode?: string
          album_id?: string
          consumed_at?: string | null
          conversation_id?: string
          expires_at?: string | null
          id?: string
          last_viewed_version?: number
          owner_id?: string
          recipient_id?: string
          revoked_at?: string | null
          shared_at?: string
          shared_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_shares_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_shares_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_view_sessions: {
        Row: {
          client_request_id: string | null
          closed_at: string | null
          created_at: string
          expires_at: string
          id: string
          share_id: string
          viewer_id: string
        }
        Insert: {
          client_request_id?: string | null
          closed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          share_id: string
          viewer_id: string
        }
        Update: {
          client_request_id?: string | null
          closed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          share_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_view_sessions_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: true
            referencedRelation: "album_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_view_sessions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          content_version: number
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          content_version?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          content_version?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
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
        ]
      }
      content_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_anonymous: boolean
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ratings: {
        Row: {
          created_at: string
          id: string
          is_anonymous: boolean
          target_id: string
          target_type: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          target_id: string
          target_type: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          target_id?: string
          target_type?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          deleted_at: string | null
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          deleted_at?: string | null
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          deleted_at?: string | null
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          participant_high: string
          participant_low: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          participant_high: string
          participant_low: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          participant_high?: string
          participant_low?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_high_fkey"
            columns: ["participant_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_low_fkey"
            columns: ["participant_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          profile_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          profile_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          profile_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          hidden_at: string | null
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          hidden_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          hidden_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_voice_participants: {
        Row: {
          joined_at: string
          left_at: string | null
          profile_id: string
          session_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          profile_id: string
          session_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          profile_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_voice_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_voice_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "group_voice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_voice_sessions: {
        Row: {
          ended_at: string | null
          group_id: string
          id: string
          started_at: string
          started_by: string | null
        }
        Insert: {
          ended_at?: string | null
          group_id: string
          id?: string
          started_at?: string
          started_by?: string | null
        }
        Update: {
          ended_at?: string | null
          group_id?: string
          id?: string
          started_at?: string
          started_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_voice_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_voice_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_path: string | null
          bio: string
          created_at: string
          id: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_general_areas: {
        Row: {
          active: boolean
          code: string
          label_en: string
          label_is: string
          region: string
          safe_marker: unknown
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          label_en: string
          label_is: string
          region: string
          safe_marker: unknown
          sort_order: number
        }
        Update: {
          active?: boolean
          code?: string
          label_en?: string
          label_is?: string
          region?: string
          safe_marker?: unknown
          sort_order?: number
        }
        Relationships: []
      }
      meetup_participations: {
        Row: {
          attendance_completed_at: string | null
          attendance_outcome: string | null
          completion_notice_dismissed_at: string | null
          confirmation_requested_at: string | null
          confirmation_state: string
          confirmed_at: string | null
          created_at: string
          expired_at: string | null
          history_visibility: string
          id: string
          joined_at: string | null
          left_at: string | null
          meetup_id: string
          profile_id: string | null
          removed_at: string | null
          requested_at: string | null
          responded_at: string | null
          responded_by: string | null
          rsvp_visibility: string
          starts_soon_notified_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attendance_completed_at?: string | null
          attendance_outcome?: string | null
          completion_notice_dismissed_at?: string | null
          confirmation_requested_at?: string | null
          confirmation_state?: string
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          history_visibility?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          meetup_id: string
          profile_id?: string | null
          removed_at?: string | null
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          rsvp_visibility?: string
          starts_soon_notified_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          attendance_completed_at?: string | null
          attendance_outcome?: string | null
          completion_notice_dismissed_at?: string | null
          confirmation_requested_at?: string | null
          confirmation_state?: string
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          history_visibility?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          meetup_id?: string
          profile_id?: string | null
          removed_at?: string | null
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          rsvp_visibility?: string
          starts_soon_notified_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_participations_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_participations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_participations_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_room_memberships: {
        Row: {
          joined_at: string
          pause_reason: string | null
          profile_id: string
          role: string
          room_id: string
          status: string
          updated_at: string
        }
        Insert: {
          joined_at?: string
          pause_reason?: string | null
          profile_id: string
          role?: string
          room_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          joined_at?: string
          pause_reason?: string | null
          profile_id?: string
          role?: string
          room_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_room_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_room_memberships_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "meetup_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_room_messages: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          kind: string
          link_hostnames: string[]
          room_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          kind?: string
          link_hostnames?: string[]
          room_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          kind?: string
          link_hostnames?: string[]
          room_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetup_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "meetup_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_room_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_rooms: {
        Row: {
          created_at: string
          id: string
          locked_at: string | null
          meetup_id: string
          posting_closes_at: string
          reading_closes_at: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string | null
          meetup_id: string
          posting_closes_at: string
          reading_closes_at: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string | null
          meetup_id?: string
          posting_closes_at?: string
          reading_closes_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_rooms_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: true
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_series: {
        Row: {
          created_at: string
          ends_on: string | null
          frequency: string
          host_id: string
          id: string
          interval_value: number
          monthly_pattern: Json | null
          occurrence_count: number | null
          skipped_dates: string[]
          status: string
          timezone: string
          title: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          frequency: string
          host_id: string
          id?: string
          interval_value: number
          monthly_pattern?: Json | null
          occurrence_count?: number | null
          skipped_dates?: string[]
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          frequency?: string
          host_id?: string
          id?: string
          interval_value?: number
          monthly_pattern?: Json | null
          occurrence_count?: number | null
          skipped_dates?: string[]
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "meetup_series_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetups: {
        Row: {
          access_mode: string
          admission_mode: string
          cancelled_at: string | null
          capacity: number | null
          category: string
          created_at: string
          currency: string | null
          description: string
          effective_end: string | null
          ends_at: string | null
          event_profile: Json | null
          general_area: string
          host_id: string | null
          id: string
          intention: string
          is_explicit: boolean
          location_release_policy: string
          location_visibility: string
          moderation_reason: string | null
          occurrence_index: number | null
          price_minor: number | null
          prohibited_services_attested_at: string | null
          public_location_confirmed_at: string | null
          published_at: string | null
          recurrence_rule: Json | null
          rsvp_visibility: string
          series_id: string | null
          starts_at: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          venue_mode: string
        }
        Insert: {
          access_mode: string
          admission_mode?: string
          cancelled_at?: string | null
          capacity?: number | null
          category: string
          created_at?: string
          currency?: string | null
          description?: string
          effective_end?: string | null
          ends_at?: string | null
          event_profile?: Json | null
          general_area: string
          host_id?: string | null
          id?: string
          intention?: string
          is_explicit?: boolean
          location_release_policy?: string
          location_visibility: string
          moderation_reason?: string | null
          occurrence_index?: number | null
          price_minor?: number | null
          prohibited_services_attested_at?: string | null
          public_location_confirmed_at?: string | null
          published_at?: string | null
          recurrence_rule?: Json | null
          rsvp_visibility?: string
          series_id?: string | null
          starts_at: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          venue_mode?: string
        }
        Update: {
          access_mode?: string
          admission_mode?: string
          cancelled_at?: string | null
          capacity?: number | null
          category?: string
          created_at?: string
          currency?: string | null
          description?: string
          effective_end?: string | null
          ends_at?: string | null
          event_profile?: Json | null
          general_area?: string
          host_id?: string | null
          id?: string
          intention?: string
          is_explicit?: boolean
          location_release_policy?: string
          location_visibility?: string
          moderation_reason?: string | null
          occurrence_index?: number | null
          price_minor?: number | null
          prohibited_services_attested_at?: string | null
          public_location_confirmed_at?: string | null
          published_at?: string | null
          recurrence_rule?: Json | null
          rsvp_visibility?: string
          series_id?: string | null
          starts_at?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          venue_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetups_general_area_fkey"
            columns: ["general_area"]
            isOneToOne: false
            referencedRelation: "meetup_general_areas"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "meetups_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meetup_series"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          album_item_id: string | null
          album_share_id: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          image_path: string | null
          media_status: string | null
          message_kind: string
          sender_id: string | null
        }
        Insert: {
          album_item_id?: string | null
          album_share_id?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          media_status?: string | null
          message_kind?: string
          sender_id?: string | null
        }
        Update: {
          album_item_id?: string | null
          album_share_id?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          media_status?: string | null
          message_kind?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_album_item_id_fkey"
            columns: ["album_item_id"]
            isOneToOne: false
            referencedRelation: "album_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_album_share_id_fkey"
            columns: ["album_share_id"]
            isOneToOne: false
            referencedRelation: "album_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
      notifications: {
        Row: {
          conversation_id: string | null
          created_at: string
          direct_message_id: string | null
          group_id: string | null
          group_message_id: string | null
          id: string
          kind: string
          meetup_id: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          direct_message_id?: string | null
          group_id?: string | null
          group_message_id?: string | null
          id?: string
          kind: string
          meetup_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          direct_message_id?: string | null
          group_id?: string | null
          group_message_id?: string | null
          id?: string
          kind?: string
          meetup_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_direct_message_id_fkey"
            columns: ["direct_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_group_message_id_fkey"
            columns: ["group_message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          approval_status: string
          created_at: string
          id: string
          moderation_source: string
          position: number
          profile_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          id?: string
          moderation_source?: string
          position: number
          profile_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          id?: string
          moderation_source?: string
          position?: number
          profile_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_tag_catalog: {
        Row: {
          active: boolean
          catalog_version: string
          category: string
          label: string
          sort_order: number
          tag_id: string
        }
        Insert: {
          active?: boolean
          catalog_version?: string
          category: string
          label: string
          sort_order: number
          tag_id: string
        }
        Update: {
          active?: boolean
          catalog_version?: string
          category?: string
          label?: string
          sort_order?: number
          tag_id?: string
        }
        Relationships: []
      }
      profile_videos: {
        Row: {
          approval_status: string
          byte_size: number
          created_at: string
          duration_ms: number
          id: string
          moderation_source: string
          position: number
          profile_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          approval_status?: string
          byte_size: number
          created_at?: string
          duration_ms: number
          id?: string
          moderation_source?: string
          position: number
          profile_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          approval_status?: string
          byte_size?: number
          created_at?: string
          duration_ms?: number
          id?: string
          moderation_source?: string
          position?: number
          profile_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_videos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adult_content_opted_in_at: string | null
          adult_profile_tags_enabled: boolean
          anonymous_ratings_enabled: boolean
          bio: string | null
          comment_wall_enabled: boolean
          conversation_prompt: string
          cover_photo_id: string | null
          created_at: string
          custom_tags: string[]
          date_of_birth: string | null
          deletion_requested_at: string | null
          display_name: string | null
          friends_of_friends_discovery: boolean
          gender: string | null
          guidelines_accepted_at: string | null
          guidelines_accepted_version: string | null
          id: string
          identity_tags: string[]
          interests: string[]
          is_location_sharing_enabled: boolean
          is_online_status_visible: boolean
          is_profile_visible: boolean
          language: string
          last_active_at: string | null
          looking_for: string[]
          meetup_hosting_restricted_at: string | null
          meetup_rsvp_visibility_default: string
          moderation_status: string
          onboarding_completed_at: string | null
          privacy_accepted_at: string | null
          privacy_accepted_version: string | null
          profile_tags: string[]
          pronouns: string | null
          region: string | null
          socials: Json
          special_category_consent_at: string | null
          starred_profile_audience: string
          suspended_until: string | null
          terms_accepted_at: string | null
          terms_accepted_version: string | null
          updated_at: string
          videos: string[]
        }
        Insert: {
          adult_content_opted_in_at?: string | null
          adult_profile_tags_enabled?: boolean
          anonymous_ratings_enabled?: boolean
          bio?: string | null
          comment_wall_enabled?: boolean
          conversation_prompt?: string
          cover_photo_id?: string | null
          created_at?: string
          custom_tags?: string[]
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          display_name?: string | null
          friends_of_friends_discovery?: boolean
          gender?: string | null
          guidelines_accepted_at?: string | null
          guidelines_accepted_version?: string | null
          id: string
          identity_tags?: string[]
          interests?: string[]
          is_location_sharing_enabled?: boolean
          is_online_status_visible?: boolean
          is_profile_visible?: boolean
          language?: string
          last_active_at?: string | null
          looking_for?: string[]
          meetup_hosting_restricted_at?: string | null
          meetup_rsvp_visibility_default?: string
          moderation_status?: string
          onboarding_completed_at?: string | null
          privacy_accepted_at?: string | null
          privacy_accepted_version?: string | null
          profile_tags?: string[]
          pronouns?: string | null
          region?: string | null
          socials?: Json
          special_category_consent_at?: string | null
          starred_profile_audience?: string
          suspended_until?: string | null
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
          videos?: string[]
        }
        Update: {
          adult_content_opted_in_at?: string | null
          adult_profile_tags_enabled?: boolean
          anonymous_ratings_enabled?: boolean
          bio?: string | null
          comment_wall_enabled?: boolean
          conversation_prompt?: string
          cover_photo_id?: string | null
          created_at?: string
          custom_tags?: string[]
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          display_name?: string | null
          friends_of_friends_discovery?: boolean
          gender?: string | null
          guidelines_accepted_at?: string | null
          guidelines_accepted_version?: string | null
          id?: string
          identity_tags?: string[]
          interests?: string[]
          is_location_sharing_enabled?: boolean
          is_online_status_visible?: boolean
          is_profile_visible?: boolean
          language?: string
          last_active_at?: string | null
          looking_for?: string[]
          meetup_hosting_restricted_at?: string | null
          meetup_rsvp_visibility_default?: string
          moderation_status?: string
          onboarding_completed_at?: string | null
          privacy_accepted_at?: string | null
          privacy_accepted_version?: string | null
          profile_tags?: string[]
          pronouns?: string | null
          region?: string | null
          socials?: Json
          special_category_consent_at?: string | null
          starred_profile_audience?: string
          suspended_until?: string | null
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "profile_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          album_item_id: string | null
          album_share_id: string | null
          assigned_admin: string | null
          category: string
          conversation_id: string | null
          created_at: string
          details: string | null
          id: string
          meetup_id: string | null
          meetup_revision_id: number | null
          message_id: string | null
          priority: string
          reported_id: string | null
          reporter_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          room_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          album_item_id?: string | null
          album_share_id?: string | null
          assigned_admin?: string | null
          category: string
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          meetup_id?: string | null
          meetup_revision_id?: number | null
          message_id?: string | null
          priority?: string
          reported_id?: string | null
          reporter_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          album_item_id?: string | null
          album_share_id?: string | null
          assigned_admin?: string | null
          category?: string
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          meetup_id?: string | null
          meetup_revision_id?: number | null
          message_id?: string | null
          priority?: string
          reported_id?: string | null
          reporter_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_album_item_id_fkey"
            columns: ["album_item_id"]
            isOneToOne: false
            referencedRelation: "album_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_album_share_id_fkey"
            columns: ["album_share_id"]
            isOneToOne: false
            referencedRelation: "album_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_room_message_id_fkey"
            columns: ["room_message_id"]
            isOneToOne: false
            referencedRelation: "meetup_room_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      starred_items: {
        Row: {
          created_at: string
          id: string
          label: string
          owner_id: string
          profile_audience: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          owner_id: string
          profile_audience?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          owner_id?: string
          profile_audience?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "starred_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_member: {
        Args: { group_id: string; profile_id: string; role?: string }
        Returns: undefined
      }
      admin_get_meetup_location_evidence: {
        Args: { p_reason: string; p_report_id: string }
        Returns: Json
      }
      admin_get_report: { Args: { p_report_id: string }; Returns: Json }
      admin_list_audit_log: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      admin_list_pending_photos: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      admin_list_reports: {
        Args: { p_cursor?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      admin_media_appeals: { Args: never; Returns: Json }
      admin_media_evidence: { Args: { upload_id: string }; Returns: Json }
      admin_moderate_meetup: {
        Args: {
          p_action: string
          p_meetup_id: string
          p_reason: string
          p_report_id?: string
        }
        Returns: undefined
      }
      admin_moderate_meetup_room: {
        Args: {
          p_action: string
          p_profile_id?: string
          p_reason: string
          p_report_id: string
        }
        Returns: undefined
      }
      admin_moderate_photo: {
        Args: { p_decision: string; p_photo_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_moderate_report: {
        Args: {
          p_report_id: string
          p_resolution_notes: string
          p_status: string
        }
        Returns: undefined
      }
      admin_review_media: {
        Args: { approved: boolean; reason: string; upload_id: string }
        Returns: undefined
      }
      admin_set_meetup_legal_hold: {
        Args: { p_enabled: boolean; p_meetup_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_report_priority: {
        Args: { p_priority: string; p_reason: string; p_report_id: string }
        Returns: undefined
      }
      admin_take_action: {
        Args: {
          p_action: string
          p_expires_at?: string
          p_profile_id: string
          p_reason: string
          p_report_id?: string
        }
        Returns: undefined
      }
      appeal_media_upload: { Args: { upload_id: string }; Returns: undefined }
      apple_authorization_start: {
        Args: { account_id: string; apple_subject: string; state_hash: string }
        Returns: undefined
      }
      apple_authorization_start_bound: {
        Args: {
          account_id: string
          apple_subject: string
          return_mode: string
          session_id: string
          state_hash: string
        }
        Returns: undefined
      }
      apple_authorization_start_web: {
        Args: { account_id: string; apple_subject: string; state_hash: string }
        Returns: undefined
      }
      apple_authorization_take: { Args: { state_hash: string }; Returns: Json }
      apple_custody_context: { Args: never; Returns: Json }
      apple_session_active: { Args: never; Returns: boolean }
      apple_token_get: { Args: { account_id: string }; Returns: Json }
      apple_token_store: {
        Args: {
          account_id: string
          apple_subject: string
          client_id: string
          sealed_token: string
        }
        Returns: undefined
      }
      apple_token_store_authorized: {
        Args: {
          account_id: string
          apple_subject: string
          client_id: string
          sealed_token: string
          session_id: string
        }
        Returns: undefined
      }
      billing_provider_guard: {
        Args: {
          p_account: string
          p_aliases?: Json
          p_claim: string
          p_erasing?: boolean
          p_job: string
        }
        Returns: Json
      }
      billing_service: {
        Args: { p_action: string; p_input?: Json }
        Returns: Json
      }
      billing_sync_access: { Args: { p_enqueue?: boolean }; Returns: Json }
      can_create_meetup: { Args: never; Returns: boolean }
      cancel_media_upload: { Args: { upload_id: string }; Returns: boolean }
      cancel_meetup: { Args: { meetup_id: string }; Returns: undefined }
      cancel_meetup_request: { Args: { meetup_id: string }; Returns: undefined }
      cancel_meetup_series_occurrences: {
        Args: { meetup_id: string; scope: string }
        Returns: number
      }
      check_account_access: { Args: never; Returns: undefined }
      claim_account_deletions: {
        Args: { batch_size?: number; claim_token: string }
        Returns: Json
      }
      claim_diagnosis_cleanup: { Args: { claim: string }; Returns: Json }
      claim_media_cleanup: { Args: { claim_id: string }; Returns: Json }
      claim_media_upload: { Args: { claim_id: string }; Returns: Json }
      claim_notification_outbox: {
        Args: { batch_size?: number; claim_token?: string }
        Returns: Json
      }
      close_album_view_session: {
        Args: { session_id: string }
        Returns: undefined
      }
      community_apply: {
        Args: {
          p_answers: string[]
          p_introduction: string
          p_meetup_id: string
          p_rules_accepted: boolean
        }
        Returns: Json
      }
      community_checkin_receipts: {
        Args: { p_meetup_id: string }
        Returns: Json
      }
      community_decide_application: {
        Args: { p_approve: boolean; p_meetup_id: string; p_profile_id: string }
        Returns: Json
      }
      community_get_state: { Args: { p_meetup_id: string }; Returns: Json }
      community_list_announcements: {
        Args: { p_meetup_id: string }
        Returns: Json
      }
      community_list_applications: {
        Args: { p_meetup_id: string }
        Returns: Json
      }
      community_list_following: { Args: never; Returns: Json }
      community_publish_announcement: {
        Args: { p_audience: string; p_body: string; p_meetup_id: string }
        Returns: Json
      }
      community_set_cover: {
        Args: { p_media_id: string; p_meetup_id: string }
        Returns: undefined
      }
      community_set_follow: {
        Args: {
          p_following: boolean
          p_notifications?: boolean
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      community_set_questions: {
        Args: { p_meetup_id: string; p_questions: string[] }
        Returns: undefined
      }
      community_waitlist_action: {
        Args: { p_action: string; p_meetup_id: string }
        Returns: Json
      }
      complete_meetup_attendance: {
        Args: {
          history_visibility?: string
          meetup_id: string
          outcome: string
        }
        Returns: undefined
      }
      complete_onboarding: {
        Args: {
          bio?: string
          date_of_birth: string
          display_name: string
          guidelines_version?: string
          identity_tags?: string[]
          locale?: string
          looking_for?: string[]
          privacy_version?: string
          pronouns?: string
          region?: string
          sensitive_data_consent?: boolean
          terms_version?: string
        }
        Returns: undefined
      }
      complete_onboarding_profile: { Args: { input: Json }; Returns: undefined }
      confirm_meetup_attendance: {
        Args: { meetup_id: string }
        Returns: undefined
      }
      consume_meetup_place_search_quota: { Args: never; Returns: boolean }
      create_group: {
        Args: { avatar_path?: string; bio?: string; name: string }
        Returns: string
      }
      create_meetup_attendance_code: {
        Args: { p_meetup_id: string }
        Returns: Json
      }
      create_meetup_draft: { Args: { input: Json }; Returns: string }
      delete_album: { Args: { album_id: string }; Returns: undefined }
      delete_album_item: { Args: { item_id: string }; Returns: Json }
      delete_meetup_draft: { Args: { meetup_id: string }; Returns: undefined }
      delete_meetup_recommendation: {
        Args: { p_meetup_id: string }
        Returns: undefined
      }
      delete_my_account: { Args: never; Returns: undefined }
      diagnosis_action: {
        Args: { action: string; input?: Json }
        Returns: Json
      }
      disable_push_token: {
        Args: { reason: string; token_id: string }
        Returns: undefined
      }
      discover_hittingar: { Args: { filters?: Json }; Returns: Json }
      discover_meetups: { Args: { filters?: Json }; Returns: Json }
      discover_nearby: {
        Args: { cursor?: Json; filters?: Json }
        Returns: {
          age: number
          bio: string
          display_name: string
          distance_band: string
          identity_tags: string[]
          is_online: boolean
          looking_for: string[]
          photo_paths: string[]
          profile_id: string
          profile_tags: string[]
          pronouns: string
          region: string
          result_cursor: Json
        }[]
      }
      discovery_release_status: { Args: never; Returns: boolean }
      export_account: { Args: never; Returns: Json }
      export_my_account: { Args: never; Returns: Json }
      fail_media_upload: {
        Args: { claim_id: string; job_id: string; permanent?: boolean }
        Returns: boolean
      }
      finance_billing_save: {
        Args: { fingerprint: string; revision: number; state: Json }
        Returns: boolean
      }
      finance_billing_snapshot: { Args: never; Returns: Json }
      finance_event_context: { Args: { meetup_id: string }; Returns: Json }
      finance_event_save: {
        Args: {
          command_action: string
          meetup_id: string
          member_id: string
          revision: number
          session_id: string
          state: Json
        }
        Returns: boolean
      }
      finance_load: { Args: never; Returns: Json }
      finance_publish_context: {
        Args: { meetup_id: string; member_id: string }
        Returns: Json
      }
      finance_publish_meetup: {
        Args: {
          meetup_id: string
          member_id: string
          occurrence_starts?: Json
          recurrence?: Json
          request_id: string
          revision: number
          session_id: string
          state: Json
        }
        Returns: boolean
      }
      finance_save: {
        Args: { revision: number; state: Json }
        Returns: boolean
      }
      finance_settlement_save: {
        Args: { meetup_id: string; revision: number; state: Json }
        Returns: boolean
      }
      finish_account_deletion: {
        Args: { claim_token: string; job_id: string; succeeded: boolean }
        Returns: undefined
      }
      finish_diagnosis_cleanup: {
        Args: { claim: string; path: string }
        Returns: boolean
      }
      finish_media_cleanup: {
        Args: { claim_id: string; job_id: string; succeeded: boolean }
        Returns: boolean
      }
      finish_media_upload: {
        Args: {
          byte_size: number
          claim_id: string
          duration_ms: number
          job_id: string
          object_path: string
          rejection_reason: string
          thumbnail_path: string
        }
        Returns: boolean
      }
      get_account_media: { Args: { object_id: string }; Returns: Json }
      get_financial_access: { Args: never; Returns: boolean }
      get_host_community_summary: { Args: { p_host_id: string }; Returns: Json }
      get_launch_capabilities: { Args: never; Returns: Json }
      get_meetup: { Args: { meetup_id: string }; Returns: Json }
      get_meetup_community_feedback: {
        Args: { p_meetup_id: string }
        Returns: Json
      }
      get_meetup_draft_recurrence: {
        Args: { meetup_id: string }
        Returns: Json
      }
      get_meetup_online_access: { Args: { meetup_id: string }; Returns: Json }
      get_meetup_room_summary: { Args: { meetup_id: string }; Returns: Json }
      get_my_entitlement: { Args: never; Returns: Json }
      get_premium_profile: { Args: { profile_id: string }; Returns: Json }
      get_public_profile: { Args: { profile_id: string }; Returns: Json }
      list_profile_activity: { Args: { kind: string; cursor?: Json; page_size?: number }; Returns: Json }
      record_profile_view: { Args: { profile_id: string }; Returns: undefined }
      send_profile_tap: { Args: { profile_id: string }; Returns: undefined }
      get_recovery_media_manifest: {
        Args: { after_key?: string; batch_size?: number }
        Returns: Json
      }
      get_staff_access: { Args: never; Returns: Json }
      get_worker_health: { Args: never; Returns: Json }
      group_action: {
        Args: { action: string; group_id: string; input?: Json }
        Returns: undefined
      }
      group_voice_access: {
        Args: {
          p_action: string
          p_admission_id?: string
          p_group_id: string
          p_target_id?: string
        }
        Returns: Json
      }
      join_meetup: { Args: { meetup_id: string }; Returns: Json }
      leave_meetup: { Args: { meetup_id: string }; Returns: undefined }
      list_blocked_profiles: { Args: never; Returns: Json }
      list_content_rating_counts: {
        Args: { target_id: string; target_type: string }
        Returns: Json
      }
      list_content_reactions: {
        Args: { target_id: string; target_type: string }
        Returns: Json
      }
      list_conversations_page: {
        Args: { cursor?: Json; page_size?: number; search_query?: string }
        Returns: Json
      }
      list_friends: { Args: never; Returns: Json }
      list_group_members: { Args: { group_id: string }; Returns: Json }
      list_group_messages: {
        Args: { before?: string; group_id: string; page_size?: number }
        Returns: Json
      }
      list_group_messages_page: {
        Args: { cursor?: Json; group_id: string; page_size?: number }
        Returns: Json
      }
      list_groups: { Args: never; Returns: Json }
      list_media_uploads: { Args: { album_id: string }; Returns: Json }
      list_meetup_participants: { Args: { meetup_id: string }; Returns: Json }
      list_meetup_requests: { Args: { meetup_id: string }; Returns: Json }
      list_meetup_room_message_page: {
        Args: { cursor?: Json; page_size?: number; room_id: string }
        Returns: Json
      }
      list_meetup_room_messages: {
        Args: { before_at?: string; page_size?: number; room_id: string }
        Returns: Json
      }
      list_messages_page: {
        Args: { conversation_id: string; cursor?: Json; page_size?: number }
        Returns: Json
      }
      list_my_community_attendance: { Args: never; Returns: Json }
      list_my_media_uploads: {
        Args: { target_id?: string; target_type?: string }
        Returns: Json
      }
      list_my_meetups: { Args: never; Returns: Json }
      list_notifications: { Args: { limit_count?: number }; Returns: Json }
      list_pending_push_receipts: {
        Args: { limit_count?: number }
        Returns: Json
      }
      list_profile_meetup_history: {
        Args: { cursor?: string; page_size?: number; profile_id: string }
        Returns: Json
      }
      list_profile_upcoming_meetups: {
        Args: { cursor?: string; page_size?: number; profile_id: string }
        Returns: Json
      }
      list_public_meetup_roster: {
        Args: { cursor?: string; meetup_id: string; page_size?: number }
        Returns: Json
      }
      list_starred_items: { Args: { owner_id?: string }; Returns: Json }
      mark_notification_read: {
        Args: { notification_id: string }
        Returns: undefined
      }
      meetup_profile_action: {
        Args: { action: string; input?: Json; meetup_id: string }
        Returns: Json
      }
      open_album_share: { Args: { share_id: string }; Returns: Json }
      open_album_share_once: {
        Args: { request_id: string; share_id: string }
        Returns: Json
      }
      prepare_account_deletion: { Args: never; Returns: boolean }
      prepare_media_restore: { Args: { restore_id: string }; Returns: number }
      process_hittumst_lifecycle: { Args: never; Returns: Json }
      publish_meetup: { Args: { meetup_id: string }; Returns: Json }
      publish_meetup_series: {
        Args: {
          occurrence_starts: Json
          recurrence: Json
          source_meetup_id: string
        }
        Returns: Json
      }
      purge_expired_meetups: { Args: { batch_size?: number }; Returns: number }
      rate_content: {
        Args: { target_id: string; target_type: string; value: number }
        Returns: undefined
      }
      record_meetup_attendance: {
        Args: { p_code: string; p_meetup_id: string }
        Returns: undefined
      }
      record_push_receipts: { Args: { receipts: Json }; Returns: undefined }
      record_push_tickets: {
        Args: { claim_token: string; outbox_id: number; tickets: Json }
        Returns: undefined
      }
      record_worker_heartbeat: {
        Args: { batches?: number; worker_name: string; worker_state: string }
        Returns: undefined
      }
      recovery_media_is_current: {
        Args: { bucket: string; object_path: string }
        Returns: boolean
      }
      refresh_album_share: {
        Args: { session_id?: string; share_id: string }
        Returns: Json
      }
      register_push_token: {
        Args: { expo_push_token: string; locale?: string; platform: string }
        Returns: string
      }
      reinstate_meetup_participant: {
        Args: { meetup_id: string; profile_id: string; status: string }
        Returns: Json
      }
      remove_meetup_participant: {
        Args: { meetup_id: string; profile_id: string }
        Returns: undefined
      }
      report_meetup: {
        Args: { category: string; details?: string; meetup_id: string }
        Returns: string
      }
      report_meetup_room_message: {
        Args: { category: string; details?: string; message_id: string }
        Returns: string
      }
      request_meetup_access: { Args: { meetup_id: string }; Returns: Json }
      request_meetup_attendance_review: {
        Args: { p_meetup_id: string; p_reason: string }
        Returns: undefined
      }
      reserve_album_upload: {
        Args: { album_id: string; media_type: string }
        Returns: Json
      }
      reserve_media_upload: {
        Args: {
          media_type: string
          metadata?: Json
          target_id: string
          target_type: string
        }
        Returns: Json
      }
      resolve_meetup_room_conflict: {
        Args: { action: string; conflict_id: string }
        Returns: undefined
      }
      resolve_notification: { Args: { notification_id: string }; Returns: Json }
      respond_to_album_share: {
        Args: { accept: boolean; share_id: string }
        Returns: Json
      }
      respond_to_meetup_request: {
        Args: { approve: boolean; meetup_id: string; profile_id: string }
        Returns: Json
      }
      review_diagnosis: {
        Args: { action: string; input?: Json }
        Returns: Json
      }
      revoke_album_share: { Args: { share_id: string }; Returns: undefined }
      save_meetup_recommendation: {
        Args: { p_body?: string; p_meetup_id: string; p_recommended: boolean }
        Returns: undefined
      }
      send_album_reply: {
        Args: { body: string; item_id: string; share_id: string }
        Returns: string
      }
      send_group_message: {
        Args: { body: string; group_id: string }
        Returns: string
      }
      send_group_message_once: {
        Args: { body: string; client_message_id: string; group_id: string }
        Returns: string
      }
      send_group_message_receipt: {
        Args: { body: string; client_message_id: string; group_id: string }
        Returns: Json
      }
      send_meetup_room_message: {
        Args: { body: string; room_id: string }
        Returns: string
      }
      send_meetup_room_message_once: {
        Args: { body: string; message_id: string; room_id: string }
        Returns: Json
      }
      set_adult_content_preference: {
        Args: { enabled: boolean }
        Returns: undefined
      }
      set_friendship: {
        Args: { action: string; profile_id: string }
        Returns: Json
      }
      set_meetup_expansion: {
        Args: { input: Json; meetup_id: string }
        Returns: undefined
      }
      set_meetup_feature_enabled: {
        Args: { enabled: boolean }
        Returns: undefined
      }
      set_meetup_history_visibility: {
        Args: { meetup_id: string; visibility: string }
        Returns: undefined
      }
      set_meetup_rsvp_visibility: {
        Args: { meetup_id: string; visibility: string }
        Returns: undefined
      }
      set_premium_profile: {
        Args: { badge: boolean; effect: boolean }
        Returns: Json
      }
      set_sandbox_tier: { Args: { tier: string }; Returns: Json }
      share_albums: {
        Args: { access_mode: string; album_ids: string[]; recipient_id: string }
        Returns: Json
      }
      share_albums_with_profiles: {
        Args: {
          access_mode: string
          album_ids: string[]
          recipient_ids: string[]
        }
        Returns: Json
      }
      staff_list_meetup_attendance_reviews: { Args: never; Returns: Json }
      staff_resolve_meetup_attendance_review: {
        Args: { p_approved: boolean; p_reason: string; p_request_id: string }
        Returns: undefined
      }
      start_conversation: {
        Args: { other_profile_id: string }
        Returns: string
      }
      start_group_voice: { Args: { group_id: string }; Returns: string }
      toggle_album_reaction: {
        Args: { item_id: string; share_id: string }
        Returns: boolean
      }
      toggle_content_reaction: {
        Args: { emoji: string; target_id: string; target_type: string }
        Returns: boolean
      }
      toggle_starred_item: {
        Args: {
          label: string
          profile_audience?: string
          target_id: string
          target_type: string
        }
        Returns: boolean
      }
      touch_presence: { Args: never; Returns: undefined }
      unregister_push_token: {
        Args: { expo_push_token: string }
        Returns: undefined
      }
      update_location: {
        Args: {
          accuracy: number
          captured_at: string
          latitude: number
          longitude: number
        }
        Returns: Json
      }
      update_meetup: { Args: { input: Json; meetup_id: string }; Returns: Json }
      voice_service: {
        Args: { p_action: string; p_event?: Json; p_id?: string }
        Returns: Json
      }
      withdraw_sensitive_consent: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
