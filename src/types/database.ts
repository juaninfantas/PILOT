/** Tipos mínimos PostgREST — alinear con migraciones SQL */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PropertyKind =
  | "APARTMENT"
  | "HOUSE"
  | "QUINTA"
  | "LOT"
  | "GARAGE"
  | "COMMERCIAL"
  | "LAND"
  | "FIELD"
  | "OTHER";

/** Estado comercial en UI (DB en inglés) */
export type ListingStatus = "ARCHIVED" | "AVAILABLE" | "OTHER" | "RESERVED" | "URGENT";

export type PriceKind = "LISTING_PUBLIC" | "LISTING_RESERVED" | "OFFER_OPPORTUNITY";
export type OpportunityCreationMode = "MANUAL" | "SCORING";
export type OppPropertyLinkStatus = "PROPOSED" | "POSSIBLE" | "INTERESTED" | "DISCARDED";
export type OfferInOpportunityStatus = "PROPOSED" | "ACCEPTED" | "DISCARDED";
export type OpportunityStatus = "OPEN" | "WON" | "LOST" | "ONHOLD";
export type ActivityType = "CALL" | "VISIT" | "NOTE" | "REMINDER";
export type AppraisalSource = "OWN" | "EXTERNAL";
export type FunnelSystemType = "NORMAL" | "WON" | "LOST" | "ONHOLD";

export interface Database {
  public: {
    Tables: {
      User: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          image: string | null;
          platform_staff: boolean;
        };
        Insert: {
          id: string;
          name?: string | null;
          email?: string | null;
          image?: string | null;
          platform_staff?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["User"]["Insert"]>;
      };
      Organization: {
        Row: {
          id: string;
          slug: string;
          display_name: string;
          logo_url: string | null;
          legal_json: string | null;
          signup_invite_code: string;
          subscription_tier: string;
          subscription_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          display_name: string;
          logo_url?: string | null;
          legal_json?: string | null;
          signup_invite_code?: string;
          subscription_tier?: string;
          subscription_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      OrganizationMembership: {
        Row: {
          user_id: string;
          organization_id: string;
          created_at: string;
          is_active: boolean;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          created_at?: string;
          is_active?: boolean;
        };
      };
      OrganizationInvite: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          expires_at: string;
          created_at: string;
          created_by_user_id: string;
          used_at: string | null;
          used_by_user_id: string | null;
          revoked_at: string | null;
          target_access: string;
          target_person_id: string | null;
          reserved_email: string | null;
        };
        Insert: never;
      };
      UserNote: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          title: string;
          detail: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          title?: string;
          detail?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["UserNote"]["Insert"]>;
      };
      GeoCountryConfig: {
        Row: {
          country_code: string;
          dial_metadata: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          country_code: string;
          dial_metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["GeoCountryConfig"]["Insert"]>;
      };
      GeoLevelDef: {
        Row: {
          country_code: string;
          level_index: number;
          level_key: string;
          labels: Record<string, unknown>;
          optional_level: boolean;
        };
        Insert: {
          country_code: string;
          level_index: number;
          level_key: string;
          labels?: Record<string, unknown>;
          optional_level?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["GeoLevelDef"]["Insert"]>;
      };
      GeoUnit: {
        Row: {
          id: string;
          country_code: string;
          parent_id: string | null;
          level_index: number;
          code: string;
          name: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          country_code: string;
          parent_id?: string | null;
          level_index: number;
          code: string;
          name: string;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["GeoUnit"]["Insert"]>;
      };
      Property: {
        Row: {
          id: string;
          title: string;
          city_zone: string;
          address: string | null;
          postal_code: string | null;
          lat: number | null;
          lng: number | null;
          geo_unit_id: string | null;
          kind: PropertyKind;
          covered_m2: number | null;
          total_m2: number | null;
          rooms: number | null;
          bathrooms: number | null;
          parking: number | null;
          has_quincho: boolean;
          has_pool: boolean;
          floor_count: number | null;
          has_patio: boolean;
          has_terrace: boolean;
          has_laundry: boolean;
          has_balcony: boolean;
          has_garden: boolean;
          has_service_room: boolean;
          has_elevator: boolean;
          condition: string | null;
          description: string | null;
          is_exclusive: boolean;
          management: string | null;
          amenity_tags: string | null;
          created_at: string;
          updated_at: string;
          created_by_id: string | null;
          organization_id: string;
          listing_status: ListingStatus;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          title: string;
          city_zone: string;
          address?: string | null;
          postal_code?: string | null;
          lat?: number | null;
          lng?: number | null;
          geo_unit_id?: string | null;
          kind?: PropertyKind;
          listing_status?: ListingStatus;
          covered_m2?: number | null;
          total_m2?: number | null;
          rooms?: number | null;
          bathrooms?: number | null;
          parking?: number | null;
          has_quincho?: boolean;
          has_pool?: boolean;
          floor_count?: number | null;
          has_patio?: boolean;
          has_terrace?: boolean;
          has_laundry?: boolean;
          has_balcony?: boolean;
          has_garden?: boolean;
          has_service_room?: boolean;
          has_elevator?: boolean;
          condition?: string | null;
          description?: string | null;
          is_exclusive?: boolean;
          management?: string | null;
          amenity_tags?: string | null;
          created_by_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["Property"]["Insert"]>;
      };
      PropertyPrice: {
        Row: {
          id: string;
          property_id: string;
          amount: string;
          currency: string;
          kind: PriceKind;
          effective_at: string;
          note: string | null;
          created_by_id: string | null;
          source_offer_id: string | null;
        };
        Insert: {
          id?: string;
          property_id: string;
          amount: string | number;
          currency?: string;
          kind: PriceKind;
          effective_at?: string;
          note?: string | null;
          created_by_id?: string | null;
          source_offer_id?: string | null;
        };
      };
      PropertyAppraisal: {
        Row: {
          id: string;
          property_id: string;
          amount: string;
          currency: string;
          appraised_at: string;
          source: AppraisalSource;
          appraiser_id: string | null;
          appraiser_name: string | null;
          reference_note: string | null;
        };
        Insert: {
          id?: string;
          property_id: string;
          amount: string | number;
          currency?: string;
          appraised_at?: string;
          source?: AppraisalSource;
          appraiser_id?: string | null;
          appraiser_name?: string | null;
          reference_note?: string | null;
        };
      };
      PropertyFile: {
        Row: {
          id: string;
          property_id: string;
          url: string;
          mime_type: string | null;
          kind: string;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          url: string;
          mime_type?: string | null;
          kind: string;
          label?: string | null;
        };
      };
      PropertyPersonContact: {
        Row: {
          id: string;
          property_id: string;
          person_id: string;
          is_owner: boolean;
          is_family: boolean;
          family_relation: string | null;
          is_guardian: boolean;
          is_broker: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          person_id: string;
          is_owner?: boolean;
          is_family?: boolean;
          family_relation?: string | null;
          is_guardian?: boolean;
          is_broker?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      PropertyShareFormat: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          is_default_share: boolean;
          show_org_logo: boolean;
          show_org_name: boolean;
          show_org_fiscal_address: boolean;
          show_org_contact: boolean;
          show_property_title: boolean;
          show_city_zone: boolean;
          show_street_address: boolean;
          show_price: boolean;
          show_spec_kind: boolean;
          show_spec_listing_status: boolean;
          show_spec_exclusive: boolean;
          show_spec_covered_m2: boolean;
          show_spec_total_m2: boolean;
          show_spec_rooms: boolean;
          show_spec_bathrooms: boolean;
          show_spec_parking: boolean;
          show_spec_condition: boolean;
          show_spec_amenities: boolean;
          show_spec_quincho: boolean;
          show_spec_pool: boolean;
          show_spec_floor_count: boolean;
          show_spec_patio: boolean;
          show_spec_terrace: boolean;
          show_spec_laundry: boolean;
          show_spec_balcony: boolean;
          show_spec_garden: boolean;
          show_spec_service_room: boolean;
          show_spec_elevator: boolean;
          show_description: boolean;
          show_photos: boolean;
          show_geo_path: boolean;
          show_coordinates: boolean;
          show_external_map_link: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          is_default_share?: boolean;
          show_org_logo?: boolean;
          show_org_name?: boolean;
          show_org_fiscal_address?: boolean;
          show_org_contact?: boolean;
          show_property_title?: boolean;
          show_city_zone?: boolean;
          show_street_address?: boolean;
          show_price?: boolean;
          show_spec_kind?: boolean;
          show_spec_listing_status?: boolean;
          show_spec_exclusive?: boolean;
          show_spec_covered_m2?: boolean;
          show_spec_total_m2?: boolean;
          show_spec_rooms?: boolean;
          show_spec_bathrooms?: boolean;
          show_spec_parking?: boolean;
          show_spec_condition?: boolean;
          show_spec_amenities?: boolean;
          show_spec_quincho?: boolean;
          show_spec_pool?: boolean;
          show_spec_floor_count?: boolean;
          show_spec_patio?: boolean;
          show_spec_terrace?: boolean;
          show_spec_laundry?: boolean;
          show_spec_balcony?: boolean;
          show_spec_garden?: boolean;
          show_spec_service_room?: boolean;
          show_spec_elevator?: boolean;
          show_description?: boolean;
          show_photos?: boolean;
          show_geo_path?: boolean;
          show_coordinates?: boolean;
          show_external_map_link?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["PropertyShareFormat"]["Insert"]>;
      };
      Person: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          company: string | null;
          address_line: string | null;
          tax_id: string | null;
          trade_name: string | null;
          linked_user_id: string | null;
          created_by_id: string | null;
          created_at: string;
          updated_at: string;
          organization_id: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          company?: string | null;
          address_line?: string | null;
          tax_id?: string | null;
          trade_name?: string | null;
          linked_user_id?: string | null;
          created_by_id?: string | null;
        };
      };
      PersonProfile: {
        Row: { person_id: string; profile: string };
        Insert: { person_id: string; profile: string };
      };
      PersonPreference: {
        Row: {
          person_id: string;
          zones_json: string | null;
          min_m2: number | null;
          min_price: string | null;
          max_price: string | null;
          price_currency: string;
          property_kinds_json: string | null;
          feature_tags_json: string | null;
          buyer_extra_json: string | null;
        };
        Insert: {
          person_id: string;
          zones_json?: string | null;
          min_m2?: number | null;
          min_price?: string | null;
          max_price?: string | null;
          price_currency?: string;
          property_kinds_json?: string | null;
          feature_tags_json?: string | null;
          buyer_extra_json?: string | null;
        };
      };
      Opportunity: {
        Row: {
          id: string;
          organization_id: string;
          person_id: string;
          title: string | null;
          funnel_id: string | null;
          stage_id: string | null;
          status: OpportunityStatus;
          lost_reason: string | null;
          estimated_value: string | null;
          probability: number | null;
          creation_mode: OpportunityCreationMode;
          created_by_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          person_id: string;
          title?: string | null;
          funnel_id?: string | null;
          stage_id?: string | null;
          status?: OpportunityStatus;
          lost_reason?: string | null;
          estimated_value?: string | null;
          probability?: number | null;
          creation_mode?: OpportunityCreationMode;
          created_by_id?: string | null;
        };
      };
      Funnel: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          is_system: boolean;
          system_type: FunnelSystemType;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          name: string;
          slug: string;
          is_system?: boolean;
          system_type?: FunnelSystemType;
        };
      };
      FunnelStage: {
        Row: {
          id: string;
          funnel_id: string;
          name: string;
          position: number;
          color: string | null;
        };
        Insert: {
          id?: string;
          funnel_id: string;
          name: string;
          position?: number;
          color?: string | null;
        };
      };
      OpportunityProperty: {
        Row: {
          opportunity_id: string;
          property_id: string;
          match_score: number | null;
          match_explain_json: string | null;
          link_status: OppPropertyLinkStatus;
          archived_at: string | null;
        };
        Insert: {
          opportunity_id: string;
          property_id: string;
          match_score?: number | null;
          match_explain_json?: string | null;
          link_status?: OppPropertyLinkStatus;
          archived_at?: string | null;
        };
      };
      OpportunityPropertyOffer: {
        Row: {
          id: string;
          opportunity_id: string;
          property_id: string;
          amount: string;
          currency: string;
          offered_at: string;
          status: OfferInOpportunityStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          property_id: string;
          amount: string | number;
          currency?: string;
          offered_at?: string;
          status?: OfferInOpportunityStatus;
          notes?: string | null;
        };
      };
      OpportunityActivity: {
        Row: {
          id: string;
          opportunity_id: string;
          property_id: string | null;
          type: ActivityType;
          title: string | null;
          notes: string | null;
          due_at: string | null;
          remind_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          property_id?: string | null;
          type: ActivityType;
          title?: string | null;
          notes?: string | null;
          due_at?: string | null;
          remind_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["OpportunityActivity"]["Insert"]>;
      };
      OpportunityFunnelHistory: {
        Row: {
          id: string;
          opportunity_id: string;
          from_funnel_id: string | null;
          to_funnel_id: string | null;
          from_stage_id: string | null;
          to_stage_id: string | null;
          from_status: OpportunityStatus;
          to_status: OpportunityStatus;
          reason: string | null;
          changed_by_id: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          from_funnel_id?: string | null;
          to_funnel_id?: string | null;
          from_stage_id?: string | null;
          to_stage_id?: string | null;
          from_status: OpportunityStatus;
          to_status: OpportunityStatus;
          reason?: string | null;
          changed_by_id?: string | null;
          changed_at?: string;
        };
      };
      CalendarEvent: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          starts_at: string;
          ends_at: string | null;
          type: string;
          notes: string | null;
          opportunity_id: string | null;
          created_by_id: string | null;
          created_at: string;
          updated_at: string;
          all_day: boolean;
          location: string | null;
          recurrence_rule: unknown | null;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          title: string;
          starts_at: string;
          ends_at?: string | null;
          type?: string;
          notes?: string | null;
          opportunity_id?: string | null;
          created_by_id?: string | null;
          all_day?: boolean;
          location?: string | null;
          recurrence_rule?: unknown | null;
        };
      };
      CurrencyCatalog: {
        Row: {
          code: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          code: string;
          name: string;
          sort_order?: number;
        };
        Update: Partial<{ name: string; sort_order: number }>;
      };
      ExchangeRate: {
        Row: {
          id: string;
          organization_id: string;
          currency_from: string;
          currency_to: string;
          effective_at: string;
          quote_buy: string;
          quote_sell: string;
          /** BUY=compra, SELL=venta, MID=promedio */
          use_variant: string;
          source: string;
          created_by_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          currency_from: string;
          currency_to: string;
          effective_at?: string;
          quote_buy: number | string;
          quote_sell: number | string;
          use_variant?: string;
          source?: string;
          created_by_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ExchangeRate"]["Insert"]>;
      };
      AuditLog: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string | null;
          entity: string;
          entity_id: string;
          action: string;
          payload_json: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          entity: string;
          entity_id: string;
          action: string;
          payload_json?: string | null;
        };
      };
      Group: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      Role: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      Permission: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          module: string | null;
          resource: string | null;
          action: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      UserGroup: {
        Row: { user_id: string; group_id: string };
        Insert: { user_id: string; group_id: string };
      };
    };
    Functions: {
      get_my_permissions: { Args: Record<string, never>; Returns: string[] };
      has_permission: { Args: { p_slug: string }; Returns: boolean };
      assert_organization_slug_matches_membership: { Args: { p_slug: string }; Returns: boolean };
      attach_organization_membership: { Args: { p_slug: string; p_invite: string }; Returns: undefined };
      claim_organization_invite_for_signup: {
        Args: { p_slug: string; p_invite: string; p_email: string };
        Returns: undefined;
      };
      release_organization_invite_claim: { Args: { p_slug: string; p_email: string }; Returns: undefined };
      finalize_organization_membership_from_signup: { Args: { p_slug: string }; Returns: undefined };
      get_my_organization: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          slug: string;
          display_name: string;
          logo_url: string | null;
          legal_json: string | null;
          fiscal_legal_name: string | null;
          fiscal_address: string | null;
          fiscal_cuit: string | null;
          fiscal_iva_condition: string | null;
          contact_phone: string | null;
          broker_matricula: string | null;
          subscription_tier: string;
          subscription_expires_at: string | null;
        }[];
      };
      update_my_organization_profile: {
        Args: {
          p_display_name: string;
          p_logo_url: string;
          p_fiscal_legal_name: string;
          p_fiscal_address: string;
          p_fiscal_cuit: string;
          p_fiscal_iva_condition: string;
          p_contact_phone: string;
          p_broker_matricula: string;
        };
        Returns: undefined;
      };
      list_organization_invites: {
        Args: Record<string, never>;
        Returns: (Database["public"]["Tables"]["OrganizationInvite"]["Row"] & {
          target_person_name: string | null;
        })[];
      };
      revoke_organization_invite: {
        Args: { p_invite_id: string };
        Returns: undefined;
      };
      generate_organization_invite: {
        Args: { p_target_access?: string; p_target_person_id?: string | null };
        Returns: {
          invite_id: string;
          code: string;
          expires_at: string;
          target_access: string;
          target_person_id: string | null;
        }[];
      };
      list_org_members: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          email: string | null;
          name: string | null;
          is_active: boolean;
          access_group_slug: string;
          role_id: string | null;
          role_name: string | null;
          role_slug: string | null;
          linked_person_id: string | null;
          linked_person_name: string | null;
        }[];
      };
      list_roles_admin: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          member_count: number;
        }[];
      };
      get_role_permission_slugs: { Args: { p_role_id: string }; Returns: string[] };
      save_role_permissions: { Args: { p_role_id: string; p_slugs: string[] }; Returns: undefined };
      create_custom_role: {
        Args: { p_name: string; p_slug: string; p_description?: string | null };
        Returns: string;
      };
      update_role_profile: {
        Args: { p_role_id: string; p_name: string; p_description?: string | null };
        Returns: undefined;
      };
      delete_custom_role: { Args: { p_role_id: string }; Returns: undefined };
      set_org_member_role: { Args: { p_user_id: string; p_role_id: string }; Returns: undefined };
      list_org_agent_persons_unlinked: {
        Args: Record<string, never>;
        Returns: { id: string; name: string; email: string | null }[];
      };
      set_org_member_active: { Args: { p_user_id: string; p_is_active: boolean }; Returns: undefined };
      set_org_member_access: { Args: { p_user_id: string; p_access: string }; Returns: undefined };
      link_org_person_to_user: {
        Args: { p_person_id: string; p_user_id: string | null };
        Returns: undefined;
      };
      create_property_public_share: {
        Args: { p_property_id: string; p_days?: number; p_share_format_id?: string | null };
        Returns: string;
      };
      create_property_person_contact: {
        Args: {
          p_property_id: string;
          p_name: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_notes?: string | null;
          p_is_owner?: boolean;
          p_is_family?: boolean;
          p_family_relation?: string | null;
          p_is_guardian?: boolean;
          p_is_broker?: boolean;
          p_company?: string | null;
        };
        Returns: string;
      };
      update_property_person_contact: {
        Args: {
          p_contact_id: string;
          p_name: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_notes?: string | null;
          p_is_owner?: boolean;
          p_is_family?: boolean;
          p_family_relation?: string | null;
          p_is_guardian?: boolean;
          p_is_broker?: boolean;
          p_company?: string | null;
        };
        Returns: undefined;
      };
      delete_property_person_contact: { Args: { p_contact_id: string }; Returns: undefined };
      link_property_person_contact_existing: {
        Args: {
          p_property_id: string;
          p_person_id: string;
          p_is_owner?: boolean;
          p_is_family?: boolean;
          p_family_relation?: string | null;
          p_is_guardian?: boolean;
          p_is_broker?: boolean;
          p_company?: string | null;
        };
        Returns: string;
      };
      sync_person_property_profiles: { Args: { p_person_id: string }; Returns: undefined };
      fetch_property_via_share_token: {
        Args: { p_token_text: string };
        Returns: Record<string, unknown>;
      };
      get_geo_country_root_id: { Args: { p_country: string }; Returns: string | null };
      get_geo_unit_chain: { Args: { p_unit_id: string }; Returns: string[] };
      geo_unit_path_labeled: { Args: { p_unit_id: string; p_locale?: string }; Returns: string | null };
      geo_unit_path_line: { Args: { p_unit_id: string }; Returns: string | null };
      list_geo_level_defs: {
        Args: { p_country: string };
        Returns: Database["public"]["Tables"]["GeoLevelDef"]["Row"][];
      };
      list_geo_units: {
        Args: { p_country: string; p_parent_id: string | null };
        Returns: Database["public"]["Tables"]["GeoUnit"]["Row"][];
      };
      mutate_currency_catalog: {
        Args: { p_old_code: string; p_new_code: string; p_name: string };
        Returns: undefined;
      };
      staff_search_organizations: {
        Args: { p_query?: string; p_limit?: number };
        Returns: { id: string; slug: string; display_name: string }[];
      };
      staff_set_impersonation: { Args: { p_organization_id: string }; Returns: undefined };
      staff_clear_impersonation: { Args: Record<string, never>; Returns: undefined };
      get_my_staff_context: {
        Args: Record<string, never>;
        Returns: {
          platform_staff: boolean;
          impersonating: boolean;
          impersonation_expires_at: string | null;
          impersonation_organization_id: string | null;
        }[];
      };
      staff_create_tenant: {
        Args: { p_slug: string; p_display_name: string; p_signup_invite_code?: string | null };
        Returns: { id: string; slug: string; display_name: string; signup_invite_code: string }[];
      };
      staff_list_tenants: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          slug: string;
          display_name: string;
          subscription_tier: string;
          member_count: number;
        }[];
      };
      staff_get_tenant_invite_code: { Args: { p_organization_id: string }; Returns: string };
      staff_list_tenant_members: {
        Args: { p_organization_id: string };
        Returns: {
          user_id: string;
          email: string | null;
          name: string | null;
          is_active: boolean;
          access_group_slug: string;
        }[];
      };
      staff_set_tenant_member_active: {
        Args: { p_organization_id: string; p_user_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      staff_set_tenant_member_access: {
        Args: { p_organization_id: string; p_user_id: string; p_access: string };
        Returns: undefined;
      };
      staff_attach_user_to_tenant: {
        Args: { p_user_id: string; p_organization_id: string; p_access?: string };
        Returns: undefined;
      };
      staff_find_user_by_email: { Args: { p_email: string }; Returns: string | null };
    };
  };
}

export type PersonPreference = Database["public"]["Tables"]["PersonPreference"]["Row"];
