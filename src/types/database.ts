import type { Category, PreparationOption } from './index';

// Hand-maintained Supabase generated types.
// Matches the current database schema for the tables used by this app.
// Regenerate (or re-sync) with: supabase gen types typescript

export type OrderSummaryJson = {
  status?: string;
  deliveryDate?: string;
  deliveryWindow?: string;
  statusTimeline?: { status: string; time: string; done: boolean }[];
  orderRef?: string;
};

export type Database = {
  public: {
    Tables: {
      Product: {
        Row: {
          id: string;
          name: string;
          name_ms: string;
          category: Category;
          price: number;
          cost_price: number;
          cost_supplier_name: string;
          unit: string;
          price_note: string | null;
          weight: string | null;
          quantity: number;
          description: string;
          long_description: string;
          image: string;
          images: string[];
          freshness: 'available' | 'limited' | 'sold-out';
          preparation_options: PreparationOption[];
          vendor_id: string;
          vendor_name: string;
          tags: string[];
          is_popular: boolean;
          ordering_mode: string | null;
          selling_unit: string | null;
          display_order: number;
          is_pinned: boolean;
          slice_unit: string | null;
          min_slice: number | null;
          max_slice: number | null;
          default_slice: number | null;
          slice_increment: number | null;
          slice_instruction: string | null;
        };
        Insert: {
          id: string;
          name?: string;
          name_ms?: string;
          category?: Category;
          price?: number;
          cost_price?: number;
          cost_supplier_name?: string;
          unit?: string;
          price_note?: string | null;
          weight?: string | null;
          quantity?: number;
          description?: string;
          long_description?: string;
          image?: string;
          images?: string[];
          freshness?: 'available' | 'limited' | 'sold-out';
          preparation_options?: PreparationOption[];
          vendor_id?: string;
          vendor_name?: string;
          tags?: string[];
          is_popular?: boolean;
          ordering_mode?: string | null;
          selling_unit?: string | null;
          display_order?: number;
          is_pinned?: boolean;
          slice_unit?: string | null;
          min_slice?: number | null;
          max_slice?: number | null;
          default_slice?: number | null;
          slice_increment?: number | null;
          slice_instruction?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          name_ms?: string;
          category?: Category;
          price?: number;
          cost_price?: number;
          cost_supplier_name?: string;
          unit?: string;
          price_note?: string | null;
          weight?: string | null;
          quantity?: number;
          description?: string;
          long_description?: string;
          image?: string;
          images?: string[];
          freshness?: 'available' | 'limited' | 'sold-out';
          preparation_options?: PreparationOption[];
          vendor_id?: string;
          vendor_name?: string;
          tags?: string[];
          is_popular?: boolean;
          ordering_mode?: string | null;
          selling_unit?: string | null;
          display_order?: number;
          is_pinned?: boolean;
          slice_unit?: string | null;
          min_slice?: number | null;
          max_slice?: number | null;
          default_slice?: number | null;
          slice_increment?: number | null;
          slice_instruction?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: string;
        };
        Insert: {
          id: string;
          role: string;
        };
        Update: {
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: unknown;
          updated_at: string | null;
        };
        Insert: {
          key?: string;
          value?: unknown;
          updated_at?: string | null;
        };
        Update: {
          key?: string;
          value?: unknown;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customer_profiles: {
        Row: {
          id: string;
          email_address: string | null;
          full_name: string | null;
          phone: string | null;
          address: string | null;
          postcode: string | null;
          city: string | null;
          state: string | null;
          apartment: string | null;
          house_unit: string | null;
          pickup_location: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          email_address?: string | null;
          full_name?: string | null;
          phone?: string | null;
          address?: string | null;
          postcode?: string | null;
          city?: string | null;
          state?: string | null;
          apartment?: string | null;
          house_unit?: string | null;
          pickup_location?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email_address?: string | null;
          full_name?: string | null;
          phone?: string | null;
          address?: string | null;
          postcode?: string | null;
          city?: string | null;
          state?: string | null;
          apartment?: string | null;
          house_unit?: string | null;
          pickup_location?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      combos: {
        Row: {
          id: string;
          name: string;
          name_ms: string;
          slug: string;
          description: string;
          badge: string;
          category_label: string;
          tagline: string;
          price: number;
          original_value: number;
          discount_percent: number;
          image: string;
          images: string[];
          servings: number;
          highlights: string[];
          featured: boolean;
          active: boolean;
          is_pinned: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          name_ms?: string;
          slug: string;
          description?: string;
          badge?: string;
          category_label?: string;
          tagline?: string;
          price?: number;
          original_value?: number;
          discount_percent?: number;
          image?: string;
          images?: string[];
          servings?: number;
          highlights?: string[];
          featured?: boolean;
          active?: boolean;
          is_pinned?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          name_ms?: string;
          slug?: string;
          description?: string;
          badge?: string;
          category_label?: string;
          tagline?: string;
          price?: number;
          original_value?: number;
          discount_percent?: number;
          image?: string;
          images?: string[];
          servings?: number;
          highlights?: string[];
          featured?: boolean;
          active?: boolean;
          is_pinned?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      combo_items: {
        Row: {
          id: string;
          combo_id: string;
          product_id: string;
          quantity_value: number;
          selling_unit: string;
          sort_order: number;
          custom_label: string | null;
          preparation: string | null;
          unit: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          combo_id: string;
          product_id: string;
          quantity_value?: number;
          selling_unit?: string;
          sort_order?: number;
          custom_label?: string | null;
          preparation?: string | null;
          unit?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          combo_id?: string;
          product_id?: string;
          quantity_value?: number;
          selling_unit?: string;
          sort_order?: number;
          custom_label?: string | null;
          preparation?: string | null;
          unit?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'combo_items_combo_id_fkey';
            columns: ['combo_id'];
            isOneToOne: false;
            referencedRelation: 'combos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'combo_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'Product';
            referencedColumns: ['id'];
          },
        ];
      };
      Orders: {
        Row: {
          id: number;
          created_at: string;
          full_name: string;
          phone_number: string;
          email_address: string;
          street_address: string;
          postcode: string;
          city: string;
          state: string;
          apartment: string;
          house_unit: string;
          pickup_location: string;
          delivery_point_name: string | null;
          delivery_method: string | null;
          order_notes: string | null;
          item_options: unknown;
          order_items: unknown;
          delivery_slot: string;
          order_summary: OrderSummaryJson;
          subtotal: number;
          delivery_fee: number;
          total: number;
          gross_profit: number;
          payment_status: string;
          paid_at: string | null;
          supplier_weights?: unknown;
          paid_by?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
          delivery_status?: string;
          delivered_at?: string | null;
          delivered_by?: string | null;
          delivery_batch_id?: string | null;
        };
        Insert: {
          id?: number;
          created_at?: string;
          full_name?: string;
          phone_number?: string;
          email_address?: string;
          street_address?: string;
          postcode?: string;
          city?: string;
          state?: string;
          apartment?: string;
          house_unit?: string;
          pickup_location?: string;
          delivery_point_name?: string | null;
          delivery_method?: string | null;
          order_notes?: string | null;
          item_options?: unknown;
          order_items?: unknown;
          delivery_slot?: string;
          order_summary?: OrderSummaryJson;
          subtotal?: number;
          delivery_fee?: number;
          total?: number;
          gross_profit?: number;
          payment_status?: string;
          paid_at?: string | null;
          supplier_weights?: unknown;
          paid_by?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
          delivery_status?: string;
          delivered_at?: string | null;
          delivered_by?: string | null;
          delivery_batch_id?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          full_name?: string;
          phone_number?: string;
          email_address?: string;
          street_address?: string;
          postcode?: string;
          city?: string;
          state?: string;
          apartment?: string;
          house_unit?: string;
          pickup_location?: string;
          delivery_point_name?: string | null;
          delivery_method?: string | null;
          order_notes?: string | null;
          item_options?: unknown;
          order_items?: unknown;
          delivery_slot?: string;
          order_summary?: OrderSummaryJson;
          subtotal?: number;
          delivery_fee?: number;
          total?: number;
          gross_profit?: number;
          payment_status?: string;
          paid_at?: string | null;
          supplier_weights?: unknown;
          paid_by?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
          delivery_status?: string;
          delivered_at?: string | null;
          delivered_by?: string | null;
          delivery_batch_id?: string | null;
        };
        Relationships: [];
      };
      supplier_price_history: {
        Row: {
          id: number;
          product_id: string;
          supplier_id: number | null;
          supplier_name: string;
          cost_price: number;
          effective_from: string;
          effective_to: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          product_id: string;
          supplier_id?: number | null;
          supplier_name?: string;
          cost_price: number;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          product_id?: string;
          supplier_id?: number | null;
          supplier_name?: string;
          cost_price?: number;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      selling_price_history: {
        Row: {
          id: number;
          product_id: string;
          selling_price: number;
          effective_from: string;
          effective_to: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          product_id: string;
          selling_price: number;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          product_id?: string;
          selling_price?: number;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      delivery_points: {
        Row: {
          id: number;
          name: string;
          area: string | null;
          delivery_fee: number;
          delivery_method: string;
          display_order: number;
          active: boolean;
          pickup_notes: string | null;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          area?: string | null;
          delivery_fee?: number;
          delivery_method?: string;
          display_order?: number;
          active?: boolean;
          pickup_notes?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          area?: string | null;
          delivery_fee?: number;
          delivery_method?: string;
          display_order?: number;
          active?: boolean;
          pickup_notes?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      delivery_batches: {
        Row: {
          id: string;
          batch_code: string;
          delivery_date: string;
          supplier_name: string | null;
          supplier_notes: string | null;
          hub_name: string;
          lalamove_tracking_url: string | null;
          booking_reference: string | null;
          packing_started_at: string | null;
          packing_completed_at: string | null;
          lalamove_booked_at: string | null;
          hub_arrived_at: string | null;
          ready_for_rider_at: string | null;
          delivery_started_at: string | null;
          completed_at: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_code: string;
          delivery_date: string;
          supplier_name?: string | null;
          supplier_notes?: string | null;
          hub_name?: string;
          lalamove_tracking_url?: string | null;
          booking_reference?: string | null;
          packing_started_at?: string | null;
          packing_completed_at?: string | null;
          lalamove_booked_at?: string | null;
          hub_arrived_at?: string | null;
          ready_for_rider_at?: string | null;
          delivery_started_at?: string | null;
          completed_at?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          batch_code?: string;
          delivery_date?: string;
          supplier_name?: string | null;
          supplier_notes?: string | null;
          hub_name?: string;
          lalamove_tracking_url?: string | null;
          booking_reference?: string | null;
          packing_started_at?: string | null;
          packing_completed_at?: string | null;
          lalamove_booked_at?: string | null;
          hub_arrived_at?: string | null;
          ready_for_rider_at?: string | null;
          delivery_started_at?: string | null;
          completed_at?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      historical_business_daily: {
        Row: {
          id: number;
          business_date: string;
          order_count: number;
          revenue_amount: number;
          supplier_cost_amount: number;
          delivery_income_amount: number;
          gross_profit_amount: number;
          source: string;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          business_date: string;
          order_count?: number;
          revenue_amount?: number;
          supplier_cost_amount?: number;
          delivery_income_amount?: number;
          gross_profit_amount?: number;
          source?: string;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          business_date?: string;
          order_count?: number;
          revenue_amount?: number;
          supplier_cost_amount?: number;
          delivery_income_amount?: number;
          gross_profit_amount?: number;
          source?: string;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      delivery_assignments: {
        Row: {
          id: number;
          delivery_date: string;
          rider_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          delivery_date: string;
          rider_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          delivery_date?: string;
          rider_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      delivery_batch_manifest: {
        Row: {
          id: number;
          batch_id: string;
          order_id: number;
          packed: boolean;
          loaded: boolean;
          packed_at: string | null;
          loaded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          batch_id: string;
          order_id: number;
          packed?: boolean;
          loaded?: boolean;
          packed_at?: string | null;
          loaded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          batch_id?: string;
          order_id?: number;
          packed?: boolean;
          loaded?: boolean;
          packed_at?: string | null;
          loaded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      reorder_products: {
        Args: { p_ids: string[] };
        Returns: undefined;
      };
      reorder_combos: {
        Args: { p_ids: string[] };
        Returns: undefined;
      };
      move_product: {
        Args: { p_id: string; p_to_index: number };
        Returns: undefined;
      };
      move_combo: {
        Args: { p_id: string; p_to_index: number };
        Returns: undefined;
      };
      normalize_product_order: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      normalize_combo_order: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      rider_update_delivery_status: {
        Args: { p_order_id: number; p_status: string };
        Returns: undefined;
      };
      set_product_selling_price: {
        Args: { p_product_id: string; p_selling_price: number };
        Returns: undefined;
      };
      set_product_supplier_price: {
        Args: { p_product_id: string; p_cost_price: number; p_supplier_name: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
