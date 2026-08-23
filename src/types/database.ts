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
      canonical_delivery_proofs: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          proof_type: string
          sales_order_id: string
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          proof_type: string
          sales_order_id: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          proof_type?: string
          sales_order_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_delivery_proofs_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "canonical_sales_order_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_delivery_proofs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_sales_order_deliveries: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assigned_rider_id: string
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          delivery_date: string
          delivery_started_at: string | null
          delivery_started_by: string | null
          id: string
          ready_for_rider_at: string
          ready_for_rider_by: string | null
          sales_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_rider_id: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_date: string
          delivery_started_at?: string | null
          delivery_started_by?: string | null
          id?: string
          ready_for_rider_at?: string
          ready_for_rider_by?: string | null
          sales_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_rider_id?: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_date?: string
          delivery_started_at?: string | null
          delivery_started_by?: string | null
          id?: string
          ready_for_rider_at?: string
          ready_for_rider_by?: string | null
          sales_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_sales_order_deliveries_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_supplier_delivery_batch_orders: {
        Row: {
          added_at: string
          added_by: string | null
          batch_id: string
          id: string
          sales_order_id: string
          supplier_id: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          batch_id: string
          id?: string
          sales_order_id: string
          supplier_id: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          batch_id?: string
          id?: string
          sales_order_id?: string
          supplier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "canonical_supplier_delivery_batch_orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "canonical_supplier_delivery_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_supplier_delivery_batch_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_supplier_delivery_batch_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_supplier_delivery_batches: {
        Row: {
          arrived_hub_at: string | null
          arrived_hub_by: string | null
          batch_code: string
          booking_reference: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          delivery_date: string
          dispatched_at: string | null
          dispatched_by: string | null
          hub_code: string
          hub_name: string
          id: string
          notes: string | null
          status: string
          supplier_id: number
          tracking_url: string | null
          transport_provider: string | null
          updated_at: string
        }
        Insert: {
          arrived_hub_at?: string | null
          arrived_hub_by?: string | null
          batch_code: string
          booking_reference?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          hub_code?: string
          hub_name?: string
          id?: string
          notes?: string | null
          status?: string
          supplier_id: number
          tracking_url?: string | null
          transport_provider?: string | null
          updated_at?: string
        }
        Update: {
          arrived_hub_at?: string | null
          arrived_hub_by?: string | null
          batch_code?: string
          booking_reference?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          hub_code?: string
          hub_name?: string
          id?: string
          notes?: string | null
          status?: string
          supplier_id?: number
          tracking_url?: string | null
          transport_provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_supplier_delivery_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_items: {
        Row: {
          combo_id: string
          created_at: string
          custom_label: string | null
          id: string
          preparation: string | null
          product_id: string
          quantity_value: number
          selling_unit: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          combo_id: string
          created_at?: string
          custom_label?: string | null
          id?: string
          preparation?: string | null
          product_id: string
          quantity_value?: number
          selling_unit?: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          combo_id?: string
          created_at?: string
          custom_label?: string | null
          id?: string
          preparation?: string | null
          product_id?: string
          quantity_value?: number
          selling_unit?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_version_items: {
        Row: {
          combo_version_id: string
          created_at: string
          display_order: number
          id: string
          product_id: string
          product_version_id: string | null
          quantity: number
          unit_snapshot: Json
        }
        Insert: {
          combo_version_id: string
          created_at?: string
          display_order?: number
          id?: string
          product_id: string
          product_version_id?: string | null
          quantity: number
          unit_snapshot?: Json
        }
        Update: {
          combo_version_id?: string
          created_at?: string
          display_order?: number
          id?: string
          product_id?: string
          product_version_id?: string | null
          quantity?: number
          unit_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "combo_version_items_combo_version_id_fkey"
            columns: ["combo_version_id"]
            isOneToOne: false
            referencedRelation: "combo_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_version_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_version_items_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_versions: {
        Row: {
          combo_id: string
          configuration: Json
          created_at: string
          created_by: string | null
          currency_code: string
          display_snapshot: Json
          effective_from: string
          effective_to: string | null
          id: string
          published_at: string | null
          published_by: string | null
          selling_price: number
          status: string
          version_number: number
        }
        Insert: {
          combo_id: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          currency_code?: string
          display_snapshot?: Json
          effective_from?: string
          effective_to?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          selling_price: number
          status?: string
          version_number: number
        }
        Update: {
          combo_id?: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          currency_code?: string
          display_snapshot?: Json
          effective_from?: string
          effective_to?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          selling_price?: number
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_versions_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          active: boolean
          badge: string
          category_label: string
          created_at: string
          description: string
          discount_percent: number
          display_order: number
          featured: boolean
          highlights: string[]
          id: string
          image: string
          images: string[]
          is_pinned: boolean
          lifecycle_status: string
          name: string
          name_ms: string
          original_value: number
          price: number
          servings: number
          slug: string
          tagline: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string
          category_label?: string
          created_at?: string
          description?: string
          discount_percent?: number
          display_order?: number
          featured?: boolean
          highlights?: string[]
          id: string
          image?: string
          images?: string[]
          is_pinned?: boolean
          lifecycle_status?: string
          name: string
          name_ms?: string
          original_value?: number
          price?: number
          servings?: number
          slug: string
          tagline?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string
          category_label?: string
          created_at?: string
          description?: string
          discount_percent?: number
          display_order?: number
          featured?: boolean
          highlights?: string[]
          id?: string
          image?: string
          images?: string[]
          is_pinned?: boolean
          lifecycle_status?: string
          name?: string
          name_ms?: string
          original_value?: number
          price?: number
          servings?: number
          slug?: string
          tagline?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          address: string
          apartment: string
          city: string
          email_address: string | null
          full_name: string
          house_unit: string
          id: string
          notes: string | null
          phone: string
          pickup_location: string
          postcode: string
          state: string
          updated_at: string
        }
        Insert: {
          address?: string
          apartment?: string
          city?: string
          email_address?: string | null
          full_name?: string
          house_unit?: string
          id: string
          notes?: string | null
          phone?: string
          pickup_location?: string
          postcode?: string
          state?: string
          updated_at?: string
        }
        Update: {
          address?: string
          apartment?: string
          city?: string
          email_address?: string | null
          full_name?: string
          house_unit?: string
          id?: string
          notes?: string | null
          phone?: string
          pickup_location?: string
          postcode?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_assignments: {
        Row: {
          created_at: string
          delivery_date: string
          id: number
          rider_id: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          id?: never
          rider_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: never
          rider_id?: string
        }
        Relationships: []
      }
      delivery_batch_manifest: {
        Row: {
          batch_id: string
          created_at: string
          id: number
          loaded: boolean
          loaded_at: string | null
          order_id: number
          packed: boolean
          packed_at: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: never
          loaded?: boolean
          loaded_at?: string | null
          order_id: number
          packed?: boolean
          packed_at?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: never
          loaded?: boolean
          loaded_at?: string | null
          order_id?: number
          packed?: boolean
          packed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_batch_manifest_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "delivery_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_batch_manifest_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "Orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_batch_manifest_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_order_item_flat"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "delivery_batch_manifest_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vw_order_profit"
            referencedColumns: ["order_id"]
          },
        ]
      }
      delivery_batches: {
        Row: {
          batch_code: string
          booking_reference: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivery_date: string
          delivery_started_at: string | null
          hub_arrived_at: string | null
          hub_name: string
          id: string
          lalamove_booked_at: string | null
          lalamove_tracking_url: string | null
          packing_completed_at: string | null
          packing_started_at: string | null
          ready_for_rider_at: string | null
          status: string
          supplier_name: string | null
          supplier_notes: string | null
          updated_at: string
        }
        Insert: {
          batch_code: string
          booking_reference?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date: string
          delivery_started_at?: string | null
          hub_arrived_at?: string | null
          hub_name?: string
          id?: string
          lalamove_booked_at?: string | null
          lalamove_tracking_url?: string | null
          packing_completed_at?: string | null
          packing_started_at?: string | null
          ready_for_rider_at?: string | null
          status?: string
          supplier_name?: string | null
          supplier_notes?: string | null
          updated_at?: string
        }
        Update: {
          batch_code?: string
          booking_reference?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string
          delivery_started_at?: string | null
          hub_arrived_at?: string | null
          hub_name?: string
          id?: string
          lalamove_booked_at?: string | null
          lalamove_tracking_url?: string | null
          packing_completed_at?: string | null
          packing_started_at?: string | null
          ready_for_rider_at?: string | null
          status?: string
          supplier_name?: string | null
          supplier_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delivery_method_version_days: {
        Row: {
          delivery_method_version_id: string
          weekday: number
        }
        Insert: {
          delivery_method_version_id: string
          weekday: number
        }
        Update: {
          delivery_method_version_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_method_version_days_delivery_method_version_id_fkey"
            columns: ["delivery_method_version_id"]
            isOneToOne: false
            referencedRelation: "delivery_method_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_method_version_windows: {
        Row: {
          delivery_method_version_id: string
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          delivery_method_version_id: string
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          delivery_method_version_id?: string
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_method_version_windows_delivery_method_version_id_fkey"
            columns: ["delivery_method_version_id"]
            isOneToOne: false
            referencedRelation: "delivery_method_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_method_version_zones: {
        Row: {
          delivery_method_version_id: string
          id: string
          zone_code: string
          zone_name: string
          zone_snapshot: Json
        }
        Insert: {
          delivery_method_version_id: string
          id?: string
          zone_code: string
          zone_name: string
          zone_snapshot?: Json
        }
        Update: {
          delivery_method_version_id?: string
          id?: string
          zone_code?: string
          zone_name?: string
          zone_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "delivery_method_version_zones_delivery_method_version_id_fkey"
            columns: ["delivery_method_version_id"]
            isOneToOne: false
            referencedRelation: "delivery_method_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_method_versions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          currency_code: string
          customer_pays_external_provider: boolean
          effective_from: string
          effective_to: string | null
          external_booking_url: string | null
          external_provider: string | null
          fee_amount: number
          id: string
          method_code: string
          published_at: string | null
          published_by: string | null
          status: string
          timezone: string
          version_number: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_pays_external_provider?: boolean
          effective_from?: string
          effective_to?: string | null
          external_booking_url?: string | null
          external_provider?: string | null
          fee_amount?: number
          id?: string
          method_code: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          timezone?: string
          version_number: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_pays_external_provider?: boolean
          effective_from?: string
          effective_to?: string | null
          external_booking_url?: string | null
          external_provider?: string | null
          fee_amount?: number
          id?: string
          method_code?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          timezone?: string
          version_number?: number
        }
        Relationships: []
      }
      delivery_points: {
        Row: {
          active: boolean
          area: string | null
          created_at: string
          delivery_fee: number
          delivery_method: Database["public"]["Enums"]["delivery_method"]
          display_order: number
          id: number
          latitude: number | null
          longitude: number | null
          name: string
          pickup_notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          display_order?: number
          id?: never
          latitude?: number | null
          longitude?: number | null
          name: string
          pickup_notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          area?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          display_order?: number
          id?: never
          latitude?: number | null
          longitude?: number | null
          name?: string
          pickup_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      historical_business_daily: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          delivery_income_amount: number
          gross_profit_amount: number
          id: number
          notes: string | null
          order_count: number
          revenue_amount: number
          source: string
          supplier_cost_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          delivery_income_amount?: number
          gross_profit_amount?: number
          id?: never
          notes?: string | null
          order_count?: number
          revenue_amount?: number
          source?: string
          supplier_cost_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          delivery_income_amount?: number
          gross_profit_amount?: number
          id?: never
          notes?: string | null
          order_count?: number
          revenue_amount?: number
          source?: string
          supplier_cost_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          notification_type: string
          payload: Json
          read_at: string | null
          recipient_role: string | null
          recipient_user_id: string | null
          sales_order_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          notification_type: string
          payload?: Json
          read_at?: string | null
          recipient_role?: string | null
          recipient_user_id?: string | null
          sales_order_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          notification_type?: string
          payload?: Json
          read_at?: string | null
          recipient_role?: string | null
          recipient_user_id?: string | null
          sales_order_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_preparation_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          legacy_order_id: number
          questionnaire_snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          legacy_order_id: number
          questionnaire_snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          legacy_order_id?: number
          questionnaire_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_preparation_snapshots_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "Orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_preparation_snapshots_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "vw_order_item_flat"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_preparation_snapshots_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "vw_order_profit"
            referencedColumns: ["order_id"]
          },
        ]
      }
      Orders: {
        Row: {
          apartment: string
          archived_at: string | null
          archived_by: string | null
          booking_reference: string | null
          cancellation_reason: string | null
          city: string
          created_at: string
          currency: string
          delivered_at: string | null
          delivered_by: string | null
          delivery_batch_id: string | null
          delivery_date: string | null
          delivery_fee: number
          delivery_method: string | null
          delivery_point_name: string | null
          delivery_slot: string
          delivery_status: string
          email_address: string
          frozen_total: number
          full_name: string
          gross_profit: number
          house_unit: string
          id: number
          item_options: Json
          lalamove_booked_at: string | null
          lalamove_tracking_url: string | null
          order_items: Json
          order_notes: string | null
          order_summary: Json
          packing_completed_at: string | null
          packing_started_at: string | null
          paid_at: string | null
          paid_by: string | null
          payment_status: string
          phone_number: string
          pickup_location: string
          postcode: string
          pricing_snapshot_timestamp: string | null
          profit_margin_percent: number
          ready_for_rider_at: string | null
          revenue: number
          state: string
          street_address: string
          subtotal: number
          supplier_cost: number
          supplier_dispatch_completed_at: string | null
          supplier_dispatch_started_at: string | null
          supplier_weights: Json
          total: number
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          apartment?: string
          archived_at?: string | null
          archived_by?: string | null
          booking_reference?: string | null
          cancellation_reason?: string | null
          city?: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_batch_id?: string | null
          delivery_date?: string | null
          delivery_fee?: number
          delivery_method?: string | null
          delivery_point_name?: string | null
          delivery_slot?: string
          delivery_status?: string
          email_address?: string
          frozen_total?: number
          full_name?: string
          gross_profit?: number
          house_unit?: string
          id?: number
          item_options?: Json
          lalamove_booked_at?: string | null
          lalamove_tracking_url?: string | null
          order_items?: Json
          order_notes?: string | null
          order_summary?: Json
          packing_completed_at?: string | null
          packing_started_at?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string
          phone_number?: string
          pickup_location?: string
          postcode?: string
          pricing_snapshot_timestamp?: string | null
          profit_margin_percent?: number
          ready_for_rider_at?: string | null
          revenue?: number
          state?: string
          street_address?: string
          subtotal?: number
          supplier_cost?: number
          supplier_dispatch_completed_at?: string | null
          supplier_dispatch_started_at?: string | null
          supplier_weights?: Json
          total?: number
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          apartment?: string
          archived_at?: string | null
          archived_by?: string | null
          booking_reference?: string | null
          cancellation_reason?: string | null
          city?: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_batch_id?: string | null
          delivery_date?: string | null
          delivery_fee?: number
          delivery_method?: string | null
          delivery_point_name?: string | null
          delivery_slot?: string
          delivery_status?: string
          email_address?: string
          frozen_total?: number
          full_name?: string
          gross_profit?: number
          house_unit?: string
          id?: number
          item_options?: Json
          lalamove_booked_at?: string | null
          lalamove_tracking_url?: string | null
          order_items?: Json
          order_notes?: string | null
          order_summary?: Json
          packing_completed_at?: string | null
          packing_started_at?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string
          phone_number?: string
          pickup_location?: string
          postcode?: string
          pricing_snapshot_timestamp?: string | null
          profit_margin_percent?: number
          ready_for_rider_at?: string | null
          revenue?: number
          state?: string
          street_address?: string
          subtotal?: number
          supplier_cost?: number
          supplier_dispatch_completed_at?: string | null
          supplier_dispatch_started_at?: string | null
          supplier_weights?: Json
          total?: number
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Orders_delivery_batch_id_fkey"
            columns: ["delivery_batch_id"]
            isOneToOne: false
            referencedRelation: "delivery_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_configuration_versions: {
        Row: {
          configuration_code: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          id: string
          instructions: string | null
          published_at: string | null
          published_by: string | null
          qr_storage_path: string | null
          status: string
          version_number: number
        }
        Insert: {
          configuration_code: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          published_at?: string | null
          published_by?: string | null
          qr_storage_path?: string | null
          status?: string
          version_number: number
        }
        Update: {
          configuration_code?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          published_at?: string | null
          published_by?: string | null
          qr_storage_path?: string | null
          status?: string
          version_number?: number
        }
        Relationships: []
      }
      payment_reminder_attempts: {
        Row: {
          created_at: string
          id: string
          occurrence_number: number
          reminder_rule_id: string
          sales_order_id: string
          scheduled_for: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_number: number
          reminder_rule_id: string
          sales_order_id: string
          scheduled_for: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_number?: number
          reminder_rule_id?: string
          sales_order_id?: string
          scheduled_for?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminder_attempts_reminder_rule_id_fkey"
            columns: ["reminder_rule_id"]
            isOneToOne: false
            referencedRelation: "payment_reminder_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminder_attempts_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminder_rules: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          enabled: boolean
          first_delay_minutes: number
          id: string
          maximum_reminders: number
          repeat_interval_minutes: number
          rule_code: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          enabled?: boolean
          first_delay_minutes: number
          id?: string
          maximum_reminders: number
          repeat_interval_minutes: number
          rule_code: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          enabled?: boolean
          first_delay_minutes?: number
          id?: string
          maximum_reminders?: number
          repeat_interval_minutes?: number
          rule_code?: string
        }
        Relationships: []
      }
      preparation_question_options: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_order: number
          id: string
          label: string
          label_ms: string
          preparation_question_id: string
          value: Json
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_order?: number
          id?: string
          label: string
          label_ms?: string
          preparation_question_id: string
          value?: Json
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          label_ms?: string
          preparation_question_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "preparation_question_options_preparation_question_id_fkey"
            columns: ["preparation_question_id"]
            isOneToOne: false
            referencedRelation: "preparation_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_questions: {
        Row: {
          active: boolean
          answer_type: string
          code: string
          created_at: string
          display_order: number
          help_text: string
          help_text_ms: string
          id: string
          label: string
          label_ms: string
          preparation_schema_version_id: string
          required: boolean
          selection_scope: string
          validation: Json
        }
        Insert: {
          active?: boolean
          answer_type: string
          code: string
          created_at?: string
          display_order?: number
          help_text?: string
          help_text_ms?: string
          id?: string
          label: string
          label_ms?: string
          preparation_schema_version_id: string
          required?: boolean
          selection_scope: string
          validation?: Json
        }
        Update: {
          active?: boolean
          answer_type?: string
          code?: string
          created_at?: string
          display_order?: number
          help_text?: string
          help_text_ms?: string
          id?: string
          label?: string
          label_ms?: string
          preparation_schema_version_id?: string
          required?: boolean
          selection_scope?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "preparation_questions_preparation_schema_version_id_fkey"
            columns: ["preparation_schema_version_id"]
            isOneToOne: false
            referencedRelation: "preparation_schema_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_schema_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string
          notes_ms: string
          preparation_schema_id: string
          published_at: string | null
          published_by: string | null
          status: string
          title: string
          title_ms: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          notes_ms?: string
          preparation_schema_id: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          title?: string
          title_ms?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          notes_ms?: string
          preparation_schema_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          title?: string
          title_ms?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "preparation_schema_versions_preparation_schema_id_fkey"
            columns: ["preparation_schema_id"]
            isOneToOne: false
            referencedRelation: "preparation_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_schemas: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string
          description_ms: string
          id: string
          name: string
          name_ms: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string
          description_ms?: string
          id?: string
          name: string
          name_ms?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string
          description_ms?: string
          id?: string
          name?: string
          name_ms?: string
        }
        Relationships: []
      }
      Product: {
        Row: {
          category: string
          cost_price: number
          cost_supplier_name: string
          created_at: string
          default_slice: number
          description: string
          display_order: number
          freshness: string
          id: string
          image: string
          images: string[]
          is_pinned: boolean
          is_popular: boolean
          long_description: string
          max_slice: number
          min_slice: number
          name: string
          name_ms: string
          ordering_mode: string
          preparation_options: string[]
          price: number
          price_note: string | null
          quantity: number
          selling_unit: string
          slice_increment: number
          slice_instruction: string
          slice_unit: string
          tags: string[]
          unit: string
          vendor_id: string
          vendor_name: string
          weight: string | null
        }
        Insert: {
          category: string
          cost_price?: number
          cost_supplier_name?: string
          created_at?: string
          default_slice?: number
          description: string
          display_order?: number
          freshness?: string
          id: string
          image: string
          images?: string[]
          is_pinned?: boolean
          is_popular?: boolean
          long_description: string
          max_slice?: number
          min_slice?: number
          name: string
          name_ms: string
          ordering_mode?: string
          preparation_options?: string[]
          price: number
          price_note?: string | null
          quantity?: number
          selling_unit?: string
          slice_increment?: number
          slice_instruction?: string
          slice_unit?: string
          tags?: string[]
          unit: string
          vendor_id: string
          vendor_name: string
          weight?: string | null
        }
        Update: {
          category?: string
          cost_price?: number
          cost_supplier_name?: string
          created_at?: string
          default_slice?: number
          description?: string
          display_order?: number
          freshness?: string
          id?: string
          image?: string
          images?: string[]
          is_pinned?: boolean
          is_popular?: boolean
          long_description?: string
          max_slice?: number
          min_slice?: number
          name?: string
          name_ms?: string
          ordering_mode?: string
          preparation_options?: string[]
          price?: number
          price_note?: string | null
          quantity?: number
          selling_unit?: string
          slice_increment?: number
          slice_instruction?: string
          slice_unit?: string
          tags?: string[]
          unit?: string
          vendor_id?: string
          vendor_name?: string
          weight?: string | null
        }
        Relationships: []
      }
      product_versions: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string | null
          display_snapshot: Json
          effective_from: string
          effective_to: string | null
          id: string
          maximum_quantity: number | null
          minimum_quantity: number | null
          ordering_mode: string | null
          physical_unit_type: string | null
          preparation_schema_version_id: string | null
          product_id: string
          published_at: string | null
          published_by: string | null
          quantity_increment: number | null
          selling_unit: string | null
          status: string
          version_number: number
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          display_snapshot?: Json
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_quantity?: number | null
          minimum_quantity?: number | null
          ordering_mode?: string | null
          physical_unit_type?: string | null
          preparation_schema_version_id?: string | null
          product_id: string
          published_at?: string | null
          published_by?: string | null
          quantity_increment?: number | null
          selling_unit?: string | null
          status?: string
          version_number: number
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          display_snapshot?: Json
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_quantity?: number | null
          minimum_quantity?: number | null
          ordering_mode?: string | null
          physical_unit_type?: string | null
          preparation_schema_version_id?: string | null
          product_id?: string
          published_at?: string | null
          published_by?: string | null
          quantity_increment?: number | null
          selling_unit?: string | null
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_versions_preparation_schema_version_id_fkey"
            columns: ["preparation_schema_version_id"]
            isOneToOne: false
            referencedRelation: "preparation_schema_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          created_at: string
          created_by: string | null
          currency_code: string
          id: string
          reason: string
          sales_order_id: string
          sales_order_line_id: string | null
        }
        Insert: {
          adjustment_type: string
          amount: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          id?: string
          reason: string
          sales_order_id: string
          sales_order_line_id?: string | null
        }
        Update: {
          adjustment_type?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          id?: string
          reason?: string
          sales_order_id?: string
          sales_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_adjustments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_adjustments_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_checkout_idempotency: {
        Row: {
          created_at: string
          customer_id: string
          idempotency_key: string
          response: Json
          sales_order_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          idempotency_key: string
          response: Json
          sales_order_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          idempotency_key?: string
          response?: Json
          sales_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_checkout_idempotency_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_at: string
          event_type: string
          id: string
          payload: Json
          sales_order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_at?: string
          event_type: string
          id?: string
          payload?: Json
          sales_order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_at?: string
          event_type?: string
          id?: string
          payload?: Json
          sales_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_events_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_line_component_units: {
        Row: {
          actual_weight_kg: number | null
          created_at: string
          estimated_weight_kg: number | null
          id: string
          physical_unit_type: string
          sales_order_line_component_id: string
          unit_number: number
          unit_snapshot: Json
        }
        Insert: {
          actual_weight_kg?: number | null
          created_at?: string
          estimated_weight_kg?: number | null
          id?: string
          physical_unit_type: string
          sales_order_line_component_id: string
          unit_number: number
          unit_snapshot?: Json
        }
        Update: {
          actual_weight_kg?: number | null
          created_at?: string
          estimated_weight_kg?: number | null
          id?: string
          physical_unit_type?: string
          sales_order_line_component_id?: string
          unit_number?: number
          unit_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_component_un_sales_order_line_component_i_fkey"
            columns: ["sales_order_line_component_id"]
            isOneToOne: false
            referencedRelation: "sales_order_line_components"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_line_components: {
        Row: {
          actual_weight_kg: number | null
          combo_version_item_id: string
          component_number: number
          created_at: string
          estimated_supplier_cost: number | null
          estimated_weight_kg: number | null
          final_supplier_cost: number | null
          finalised_at: string | null
          id: string
          ordering_mode: string
          product_id: string
          product_snapshot: Json
          product_version_id: string
          quantity: number
          sales_order_line_id: string
          selling_unit: string
          supplier_id: number | null
          supplier_snapshot: Json
          unit_cost_price: number | null
        }
        Insert: {
          actual_weight_kg?: number | null
          combo_version_item_id: string
          component_number: number
          created_at?: string
          estimated_supplier_cost?: number | null
          estimated_weight_kg?: number | null
          final_supplier_cost?: number | null
          finalised_at?: string | null
          id?: string
          ordering_mode: string
          product_id: string
          product_snapshot?: Json
          product_version_id: string
          quantity: number
          sales_order_line_id: string
          selling_unit?: string
          supplier_id?: number | null
          supplier_snapshot?: Json
          unit_cost_price?: number | null
        }
        Update: {
          actual_weight_kg?: number | null
          combo_version_item_id?: string
          component_number?: number
          created_at?: string
          estimated_supplier_cost?: number | null
          estimated_weight_kg?: number | null
          final_supplier_cost?: number | null
          finalised_at?: string | null
          id?: string
          ordering_mode?: string
          product_id?: string
          product_snapshot?: Json
          product_version_id?: string
          quantity?: number
          sales_order_line_id?: string
          selling_unit?: string
          supplier_id?: number | null
          supplier_snapshot?: Json
          unit_cost_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_components_combo_version_item_id_fkey"
            columns: ["combo_version_item_id"]
            isOneToOne: false
            referencedRelation: "combo_version_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_components_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_components_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_line_components_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_line_units: {
        Row: {
          actual_weight_kg: number | null
          created_at: string
          estimated_weight_kg: number | null
          id: string
          physical_unit_type: string
          sales_order_line_id: string
          unit_number: number
          unit_snapshot: Json
        }
        Insert: {
          actual_weight_kg?: number | null
          created_at?: string
          estimated_weight_kg?: number | null
          id?: string
          physical_unit_type: string
          sales_order_line_id: string
          unit_number: number
          unit_snapshot?: Json
        }
        Update: {
          actual_weight_kg?: number | null
          created_at?: string
          estimated_weight_kg?: number | null
          id?: string
          physical_unit_type?: string
          sales_order_line_id?: string
          unit_number?: number
          unit_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_line_units_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          actual_weight_kg: number | null
          combo_id: string | null
          combo_version_id: string | null
          created_at: string
          discount_amount: number
          estimated_line_total: number | null
          estimated_supplier_cost: number | null
          estimated_weight_kg: number | null
          final_line_total: number | null
          final_supplier_cost: number | null
          finalised_at: string | null
          id: string
          item_kind: string
          line_number: number
          line_total: number
          ordering_mode: string | null
          product_id: string | null
          product_snapshot: Json
          product_version_id: string | null
          quantity: number
          sales_order_id: string
          selling_unit: string
          supplier_id: number | null
          supplier_snapshot: Json
          unit_cost_price: number | null
          unit_selling_price: number
        }
        Insert: {
          actual_weight_kg?: number | null
          combo_id?: string | null
          combo_version_id?: string | null
          created_at?: string
          discount_amount?: number
          estimated_line_total?: number | null
          estimated_supplier_cost?: number | null
          estimated_weight_kg?: number | null
          final_line_total?: number | null
          final_supplier_cost?: number | null
          finalised_at?: string | null
          id?: string
          item_kind: string
          line_number: number
          line_total: number
          ordering_mode?: string | null
          product_id?: string | null
          product_snapshot?: Json
          product_version_id?: string | null
          quantity: number
          sales_order_id: string
          selling_unit?: string
          supplier_id?: number | null
          supplier_snapshot?: Json
          unit_cost_price?: number | null
          unit_selling_price: number
        }
        Update: {
          actual_weight_kg?: number | null
          combo_id?: string | null
          combo_version_id?: string | null
          created_at?: string
          discount_amount?: number
          estimated_line_total?: number | null
          estimated_supplier_cost?: number | null
          estimated_weight_kg?: number | null
          final_line_total?: number | null
          final_supplier_cost?: number | null
          finalised_at?: string | null
          id?: string
          item_kind?: string
          line_number?: number
          line_total?: number
          ordering_mode?: string | null
          product_id?: string | null
          product_snapshot?: Json
          product_version_id?: string | null
          quantity?: number
          sales_order_id?: string
          selling_unit?: string
          supplier_id?: number | null
          supplier_snapshot?: Json
          unit_cost_price?: number | null
          unit_selling_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_combo_version_id_fkey"
            columns: ["combo_version_id"]
            isOneToOne: false
            referencedRelation: "combo_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_payment_receipts: {
        Row: {
          created_at: string
          file_size: number
          id: string
          mime_type: string
          original_file_name: string
          rejection_reason: string | null
          sales_order_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          original_file_name?: string
          rejection_reason?: string | null
          sales_order_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_file_name?: string
          rejection_reason?: string | null
          sales_order_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_payment_receipts_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_preparation_answers: {
        Row: {
          answer_value: Json
          created_at: string
          id: string
          option_code: string | null
          preparation_option_id: string | null
          preparation_question_id: string
          preparation_schema_version_id: string
          question_code: string
          sales_order_line_component_id: string | null
          sales_order_line_component_unit_id: string | null
          sales_order_line_id: string
          sales_order_line_unit_id: string | null
        }
        Insert: {
          answer_value?: Json
          created_at?: string
          id?: string
          option_code?: string | null
          preparation_option_id?: string | null
          preparation_question_id: string
          preparation_schema_version_id: string
          question_code: string
          sales_order_line_component_id?: string | null
          sales_order_line_component_unit_id?: string | null
          sales_order_line_id: string
          sales_order_line_unit_id?: string | null
        }
        Update: {
          answer_value?: Json
          created_at?: string
          id?: string
          option_code?: string | null
          preparation_option_id?: string | null
          preparation_question_id?: string
          preparation_schema_version_id?: string
          question_code?: string
          sales_order_line_component_id?: string | null
          sales_order_line_component_unit_id?: string | null
          sales_order_line_id?: string
          sales_order_line_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_preparation_answe_preparation_schema_version_i_fkey"
            columns: ["preparation_schema_version_id"]
            isOneToOne: false
            referencedRelation: "preparation_schema_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answe_sales_order_line_component_i_fkey"
            columns: ["sales_order_line_component_id"]
            isOneToOne: false
            referencedRelation: "sales_order_line_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answe_sales_order_line_component_u_fkey"
            columns: ["sales_order_line_component_unit_id"]
            isOneToOne: false
            referencedRelation: "sales_order_line_component_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answers_preparation_option_id_fkey"
            columns: ["preparation_option_id"]
            isOneToOne: false
            referencedRelation: "preparation_question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answers_preparation_question_id_fkey"
            columns: ["preparation_question_id"]
            isOneToOne: false
            referencedRelation: "preparation_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answers_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_preparation_answers_sales_order_line_unit_id_fkey"
            columns: ["sales_order_line_unit_id"]
            isOneToOne: false
            referencedRelation: "sales_order_line_units"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_supplier_fulfilments: {
        Row: {
          created_at: string
          id: string
          packing_completed_at: string | null
          packing_completed_by: string | null
          packing_started_at: string | null
          packing_started_by: string | null
          sales_order_id: string
          status: string
          supplier_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          packing_completed_at?: string | null
          packing_completed_by?: string | null
          packing_started_at?: string | null
          packing_started_by?: string | null
          sales_order_id: string
          status?: string
          supplier_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          packing_completed_at?: string | null
          packing_completed_by?: string | null
          packing_started_at?: string | null
          packing_started_by?: string | null
          sales_order_id?: string
          status?: string
          supplier_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_supplier_fulfilments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_supplier_fulfilments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          confirmed_at: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string | null
          customer_snapshot: Json
          delivery_configuration_snapshot: Json
          delivery_configuration_version_id: string | null
          delivery_fee: number
          delivery_snapshot: Json
          discount_amount: number
          estimated_subtotal: number
          estimated_total: number
          final_subtotal: number | null
          final_total: number | null
          id: string
          legacy_order_id: number | null
          order_number: string
          paid_at: string | null
          paid_by: string | null
          payment_configuration_snapshot: Json
          payment_configuration_version_id: string | null
          payment_status: string
          price_finalised_at: string | null
          price_finalised_by: string | null
          price_status: string
          receipt_submitted_at: string | null
          requires_supplier_finalisation: boolean
          source_payload: Json
          status: string
          subtotal: number
          total: number
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          customer_snapshot?: Json
          delivery_configuration_snapshot?: Json
          delivery_configuration_version_id?: string | null
          delivery_fee?: number
          delivery_snapshot?: Json
          discount_amount?: number
          estimated_subtotal?: number
          estimated_total?: number
          final_subtotal?: number | null
          final_total?: number | null
          id?: string
          legacy_order_id?: number | null
          order_number: string
          paid_at?: string | null
          paid_by?: string | null
          payment_configuration_snapshot?: Json
          payment_configuration_version_id?: string | null
          payment_status?: string
          price_finalised_at?: string | null
          price_finalised_by?: string | null
          price_status?: string
          receipt_submitted_at?: string | null
          requires_supplier_finalisation?: boolean
          source_payload?: Json
          status?: string
          subtotal?: number
          total?: number
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          customer_snapshot?: Json
          delivery_configuration_snapshot?: Json
          delivery_configuration_version_id?: string | null
          delivery_fee?: number
          delivery_snapshot?: Json
          discount_amount?: number
          estimated_subtotal?: number
          estimated_total?: number
          final_subtotal?: number | null
          final_total?: number | null
          id?: string
          legacy_order_id?: number | null
          order_number?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_configuration_snapshot?: Json
          payment_configuration_version_id?: string | null
          payment_status?: string
          price_finalised_at?: string | null
          price_finalised_by?: string | null
          price_status?: string
          receipt_submitted_at?: string | null
          requires_supplier_finalisation?: boolean
          source_payload?: Json
          status?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_delivery_configuration_version_id_fkey"
            columns: ["delivery_configuration_version_id"]
            isOneToOne: false
            referencedRelation: "delivery_method_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "Orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "vw_order_item_flat"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_orders_legacy_order_id_fkey"
            columns: ["legacy_order_id"]
            isOneToOne: true
            referencedRelation: "vw_order_profit"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_orders_payment_configuration_version_id_fkey"
            columns: ["payment_configuration_version_id"]
            isOneToOne: false
            referencedRelation: "payment_configuration_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      selling_price_history: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: number
          is_active: boolean
          product_id: string
          selling_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          product_id: string
          selling_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          product_id?: string
          selling_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selling_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      supplier_price_history: {
        Row: {
          cost_price: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: number
          is_active: boolean
          product_id: string
          supplier_id: number | null
          supplier_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_price: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          product_id: string
          supplier_id?: number | null
          supplier_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: never
          is_active?: boolean
          product_id?: string
          supplier_id?: number | null
          supplier_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id: string
          vendor_id?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      supplier_users: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          supplier_id: number
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          supplier_id: number
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          supplier_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_users_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_ref: string | null
          address: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: number
          is_active: boolean
          name: string
          payment_terms: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_ref?: string | null
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: never
          is_active?: boolean
          name: string
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_ref?: string | null
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: never
          is_active?: boolean
          name?: string
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_sales_summary_monthly: {
        Row: {
          avg_profit: number | null
          avg_selling_price: number | null
          avg_supplier_cost: number | null
          margin_percent: number | null
          order_count: number | null
          profit: number | null
          quantity_sold: number | null
          report_month: string | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_category_profit: {
        Row: {
          category: string | null
          margin_percent: number | null
          order_count: number | null
          profit: number | null
          quantity_sold: number | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_dashboard_kpis: {
        Row: {
          avg_order_value_30d: number | null
          monthly_profit: number | null
          monthly_revenue: number | null
          most_profitable_category: string | null
          most_profitable_product: string | null
          today_margin_percent: number | null
          today_profit: number | null
          today_revenue: number | null
          today_supplier_cost: number | null
          top_selling_product: string | null
        }
        Relationships: []
      }
      vw_order_item_flat: {
        Row: {
          actual_weight: number | null
          category: string | null
          delivery_slot: string | null
          gross_profit: number | null
          item_index: number | null
          order_created_at: string | null
          order_date: string | null
          order_id: number | null
          order_status: string | null
          payment_status: string | null
          pricing_type: string | null
          product_id: string | null
          product_name: string | null
          profit_margin_percent: number | null
          qty_sold: number | null
          selling_price_per_unit: number | null
          selling_total: number | null
          supplier_cost_per_unit: number | null
          supplier_name: string | null
          supplier_total: number | null
        }
        Relationships: []
      }
      vw_order_profit: {
        Row: {
          customer_name: string | null
          delivery_fee: number | null
          gross_profit: number | null
          item_count: number | null
          margin_percent: number | null
          order_date: string | null
          order_id: number | null
          order_status: string | null
          payment_status: string | null
          revenue: number | null
          supplier_cost: number | null
          total: number | null
        }
        Relationships: []
      }
      vw_product_profit: {
        Row: {
          avg_profit: number | null
          avg_selling_price: number | null
          avg_supplier_cost: number | null
          avg_weight: number | null
          category: string | null
          margin_percent: number | null
          order_count: number | null
          product_id: string | null
          product_name: string | null
          profit: number | null
          quantity_sold: number | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_sales_summary_daily: {
        Row: {
          avg_profit: number | null
          avg_selling_price: number | null
          avg_supplier_cost: number | null
          margin_percent: number | null
          order_count: number | null
          profit: number | null
          quantity_sold: number | null
          report_date: string | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_sales_summary_monthly: {
        Row: {
          avg_profit: number | null
          avg_selling_price: number | null
          avg_supplier_cost: number | null
          margin_percent: number | null
          order_count: number | null
          profit: number | null
          quantity_sold: number | null
          report_month: string | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_supplier_profit: {
        Row: {
          avg_margin_percent: number | null
          order_count: number | null
          products_sold: number | null
          profit: number | null
          revenue: number | null
          supplier_cost: number | null
          supplier_name: string | null
        }
        Relationships: []
      }
      vw_top_products: {
        Row: {
          category: string | null
          margin_percent: number | null
          order_count: number | null
          product_id: string | null
          product_name: string | null
          profit: number | null
          quantity_sold: number | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
      vw_top_profit_products: {
        Row: {
          category: string | null
          margin_percent: number | null
          order_count: number | null
          product_id: string | null
          product_name: string | null
          profit: number | null
          quantity_sold: number | null
          revenue: number | null
          supplier_cost: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _line_cost: { Args: { item: Json }; Returns: number }
      _line_margin: { Args: { item: Json }; Returns: number }
      _line_profit: { Args: { item: Json }; Returns: number }
      _line_qty: { Args: { item: Json }; Returns: number }
      _line_selling: { Args: { item: Json }; Returns: number }
      _pricing_set_selling: {
        Args: {
          p_effective_at: string
          p_product_id: string
          p_selling_price: number
        }
        Returns: undefined
      }
      _pricing_set_supplier: {
        Args: {
          p_cost_price: number
          p_effective_at: string
          p_product_id: string
          p_supplier_id: number
          p_supplier_name: string
        }
        Returns: undefined
      }
      admin_add_sales_order_to_supplier_delivery_batch: {
        Args: { p_batch_id: string; p_sales_order_id: string }
        Returns: undefined
      }
      admin_archive_order: {
        Args: { p_order_id: number; p_reason?: string }
        Returns: undefined
      }
      admin_assign_canonical_sales_order_rider: {
        Args: { p_rider_id: string; p_sales_order_id: string }
        Returns: string
      }
      admin_cancel_empty_canonical_supplier_delivery_batch: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      admin_confirm_canonical_supplier_batch_hub_arrival: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      admin_confirm_hub_arrival: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      admin_confirm_order_arrival: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      admin_create_canonical_supplier_delivery_batch: {
        Args: {
          p_delivery_date: string
          p_notes?: string
          p_supplier_id: number
          p_transport_provider?: string
        }
        Returns: string
      }
      admin_dispatch_canonical_supplier_delivery_batch: {
        Args: {
          p_batch_id: string
          p_booking_reference?: string
          p_tracking_url?: string
          p_transport_provider?: string
        }
        Returns: undefined
      }
      admin_mark_order_ready_for_rider: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      admin_mark_ready_for_rider: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      admin_remove_sales_order_from_supplier_delivery_batch: {
        Args: { p_batch_id: string; p_sales_order_id: string }
        Returns: undefined
      }
      admin_update_canonical_supplier_delivery_batch_tracking_url: {
        Args: { p_batch_id: string; p_tracking_url?: string }
        Returns: undefined
      }
      can_read_canonical_delivery_proof_object: {
        Args: { p_storage_path: string }
        Returns: boolean
      }
      confirm_sales_order_payment: {
        Args: { p_receipt_id: string }
        Returns: undefined
      }
      e2e_cleanup_phase3_test_run: { Args: { p_run_id: string }; Returns: Json }
      finalize_sales_order_pricing: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      get_canonical_supplier_directory: {
        Args: never
        Returns: {
          supplier_id: number
          supplier_name: string
        }[]
      }
      get_current_payment_configuration: {
        Args: never
        Returns: {
          configuration_code: string
          currency_code: string
          effective_from: string
          id: string
          instructions: string
          published_at: string
          qr_storage_path: string
          status: string
          version_number: number
        }[]
      }
      get_effective_product_configuration: {
        Args: { p_at?: string; p_product_id: string }
        Returns: {
          configuration: Json
          cost_price: number
          display_snapshot: Json
          preparation_schema_version_id: string
          product_version_id: string
          selling_price: number
          supplier_id: number
          supplier_name: string
        }[]
      }
      get_my_canonical_rider_orders: {
        Args: never
        Returns: {
          apartment: string
          customer_name: string
          customer_notes: string
          customer_phone: string
          delivered_at: string
          delivery_date: string
          delivery_point_name: string
          delivery_started_at: string
          delivery_status: string
          house_unit: string
          items: Json
          order_number: string
          payment_status: string
          pickup_location: string
          ready_for_rider_at: string
          sales_order_id: string
        }[]
      }
      get_published_product_preparation_questionnaire: {
        Args: { p_at?: string; p_product_id: string }
        Returns: Json
      }
      get_sales_order_canonical_delivery_proofs: {
        Args: { p_sales_order_id: string }
        Returns: {
          proof_type: string
          storage_path: string
          uploaded_at: string
        }[]
      }
      get_sales_order_canonical_delivery_tracking: {
        Args: { p_sales_order_id: string }
        Returns: {
          arrived_batch_count: number
          batch_count: number
          dispatched_batch_count: number
          supplier_dispatch_completed_at: string
          supplier_dispatch_started_at: string
          tracking_url: string
        }[]
      }
      get_sales_order_canonical_rider_tracking: {
        Args: { p_sales_order_id: string }
        Returns: {
          delivered_at: string
          delivery_started_at: string
          delivery_status: string
          ready_for_rider_at: string
          rider_name: string
        }[]
      }
      get_sales_order_payment_display: {
        Args: { p_sales_order_id: string }
        Returns: {
          configuration_source: string
          instructions: string
          qr_storage_path: string
        }[]
      }
      get_sales_order_supplier_fulfilment_tracking: {
        Args: { p_sales_order_id: string }
        Returns: {
          packed_supplier_count: number
          packing_completed_at: string
          packing_started_at: string
          packing_supplier_count: number
          supplier_count: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_delivery_rider: { Args: never; Returns: boolean }
      is_supplier: { Args: never; Returns: boolean }
      is_supplier_for_sales_order: {
        Args: { p_sales_order_id: string }
        Returns: boolean
      }
      is_supplier_for_sales_order_line: {
        Args: { p_sales_order_line_id: string }
        Returns: boolean
      }
      is_supplier_for_sales_order_line_component: {
        Args: { p_sales_order_line_component_id: string }
        Returns: boolean
      }
      is_supplier_for_sales_order_line_via_component: {
        Args: { p_sales_order_line_id: string }
        Returns: boolean
      }
      manifest_set_loaded: {
        Args: { p_batch_id: string; p_loaded: boolean; p_order_id: number }
        Returns: undefined
      }
      manifest_set_packed: {
        Args: { p_batch_id: string; p_order_id: number; p_packed: boolean }
        Returns: undefined
      }
      move_combo: {
        Args: { p_id: string; p_to_index: number }
        Returns: undefined
      }
      move_product: {
        Args: { p_id: string; p_to_index: number }
        Returns: undefined
      }
      normalize_combo_order: { Args: never; Returns: undefined }
      normalize_product_order: { Args: never; Returns: undefined }
      phase4a_assert_supplier_paid: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      phase4b1_generate_order_number: { Args: never; Returns: string }
      phase4b2_has_physical_unit_preparation: {
        Args: { p_preparation_schema_version_id: string }
        Returns: boolean
      }
      phase4c3_supplier_ids_for_sales_order: {
        Args: { p_sales_order_id: string }
        Returns: {
          supplier_id: number
        }[]
      }
      phase4c6_finalize_if_measurements_complete: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      phase4c7_generate_supplier_batch_code: {
        Args: { p_delivery_date: string }
        Returns: string
      }
      place_sales_order: {
        Args: {
          p_customer_snapshot: Json
          p_delivery_request: Json
          p_idempotency_key?: string
          p_items: Json
          p_preparation_answers?: Json
        }
        Returns: {
          estimated_total: number
          final_total: number
          order_number: string
          payment_status: string
          price_status: string
          requires_supplier_finalisation: boolean
          sales_order_id: string
        }[]
      }
      place_sales_order_unkeyed_internal: {
        Args: {
          p_customer_snapshot: Json
          p_delivery_request: Json
          p_items: Json
          p_preparation_answers?: Json
        }
        Returns: {
          estimated_total: number
          final_total: number
          order_number: string
          payment_status: string
          price_status: string
          requires_supplier_finalisation: boolean
          sales_order_id: string
        }[]
      }
      publish_delivery_method_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      publish_payment_configuration_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      publish_preparation_schema_version: {
        Args: { p_version_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string
          notes_ms: string
          preparation_schema_id: string
          published_at: string | null
          published_by: string | null
          status: string
          title: string
          title_ms: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "preparation_schema_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      r4_context_probe: { Args: never; Returns: Json }
      r4_context_probe_direct: { Args: never; Returns: Json }
      r4_trigger_order: { Args: never; Returns: string[] }
      record_order_preparation_snapshot: {
        Args: { p_legacy_order_id: number; p_questionnaire_snapshot: Json }
        Returns: string
      }
      record_sales_order_line_actual_weight: {
        Args: { p_actual_weight_kg: number; p_sales_order_line_id: string }
        Returns: undefined
      }
      record_sales_order_line_component_actual_weight: {
        Args: {
          p_actual_weight_kg: number
          p_sales_order_line_component_id: string
        }
        Returns: undefined
      }
      record_sales_order_line_component_unit_actual_weight: {
        Args: {
          p_actual_weight_kg: number
          p_sales_order_line_component_unit_id: string
        }
        Returns: undefined
      }
      record_sales_order_line_unit_actual_weight: {
        Args: { p_actual_weight_kg: number; p_sales_order_line_unit_id: string }
        Returns: undefined
      }
      refresh_monthly_report_mv: { Args: never; Returns: undefined }
      reject_sales_order_payment_receipt: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: undefined
      }
      reorder_combos: { Args: { p_ids: string[] }; Returns: undefined }
      admin_set_combo_lifecycle: {
        Args: { p_combo_id: string; p_lifecycle_status: string }
        Returns: undefined
      }
      admin_duplicate_combo: {
        Args: { p_source_combo_id: string }
        Returns: string
      }
      admin_save_combo: {
        Args: { p_combo_id: string; p_combo: Json; p_items?: Json | null }
        Returns: string
      }
      admin_set_combo_presentation: {
        Args: { p_combo_id: string; p_featured?: boolean | null; p_is_pinned?: boolean | null }
        Returns: undefined
      }
      reorder_products: { Args: { p_ids: string[] }; Returns: undefined }
      replace_payment_qr_configuration: {
        Args: { p_instructions?: string; p_qr_storage_path: string }
        Returns: {
          id: string
          instructions: string
          qr_storage_path: string
          version_number: number
        }[]
      }
      reprice_open_orders_for_product: {
        Args: { p_product_id: string }
        Returns: number
      }
      retire_delivery_method_version: {
        Args: { p_effective_to: string; p_version_id: string }
        Returns: undefined
      }
      retire_payment_configuration_version: {
        Args: { p_effective_to: string; p_version_id: string }
        Returns: undefined
      }
      rider_complete_batch_if_done: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      rider_complete_canonical_sales_order_delivery: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      rider_receive_order_at_hub: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      rider_register_canonical_delivery_proof: {
        Args: {
          p_proof_type: string
          p_sales_order_id: string
          p_storage_path: string
        }
        Returns: string
      }
      rider_start_batch_delivery: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      rider_start_canonical_sales_order_delivery: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      rider_start_order_delivery: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      rider_update_delivery_status: {
        Args: { p_order_id: number; p_status: string }
        Returns: undefined
      }
      set_product_selling_price: {
        Args: { p_product_id: string; p_selling_price: number }
        Returns: undefined
      }
      set_product_selling_price_at: {
        Args: {
          p_effective_at: string
          p_product_id: string
          p_selling_price: number
        }
        Returns: undefined
      }
      set_product_supplier_price: {
        Args: {
          p_cost_price: number
          p_product_id: string
          p_supplier_name: string
        }
        Returns: undefined
      }
      set_product_supplier_price_at: {
        Args: {
          p_cost_price: number
          p_effective_at: string
          p_product_id: string
          p_supplier_id: number
          p_supplier_name: string
        }
        Returns: undefined
      }
      submit_sales_order_payment_receipt: {
        Args: {
          p_file_size: number
          p_mime_type: string
          p_original_file_name: string
          p_sales_order_id: string
          p_storage_path: string
        }
        Returns: string
      }
      supplier_book_lalamove: {
        Args: {
          p_batch_id: string
          p_booking_reference: string
          p_tracking_url: string
        }
        Returns: undefined
      }
      supplier_book_lalamove_order: {
        Args: {
          p_booking_reference: string
          p_order_id: number
          p_tracking_url: string
        }
        Returns: undefined
      }
      supplier_complete_canonical_packing: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      supplier_complete_packing: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      supplier_complete_packing_order: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      supplier_start_canonical_packing: {
        Args: { p_sales_order_id: string }
        Returns: undefined
      }
      supplier_start_packing: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      supplier_start_packing_order: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      tracking_rider_name: {
        Args: { p_delivery_date: string }
        Returns: string
      }
    }
    Enums: {
      delivery_method:
        | "Lobby Collection"
        | "Security Collection"
        | "Customer Come Down"
        | "Doorstep Delivery"
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
    Enums: {
      delivery_method: [
        "Lobby Collection",
        "Security Collection",
        "Customer Come Down",
        "Doorstep Delivery",
      ],
    },
  },
} as const
