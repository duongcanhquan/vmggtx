// ============================================================
// Kiểu TypeScript cho Supabase Database - GDTX ERP.
//
// File này được viết khớp 1-1 với schema trong supabase/migrations
// (001 -> 009 + 999). Khi đã link project với Supabase CLI
// (supabase login && supabase link), tái sinh tự động bằng:
//   npm run gen:types
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgType = 'hq' | 'region' | 'campus' | 'branch'

export type UserRole =
  | 'super_admin'
  | 'campus_admin'
  | 'academic_staff'
  | 'teacher'
  | 'student'

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'
export type EnrollmentStatus = 'active' | 'completed' | 'dropped'

type Timestamps = {
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type TimestampsInsert = {
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          type: OrgType
          parent_id: string | null
          /** ltree - đường dẫn cây, do trigger tự sinh */
          path: string
          custom_metadata: Json
        } & Timestamps
        Insert: {
          id?: string
          name: string
          type: OrgType
          parent_id?: string | null
          path?: string
          custom_metadata?: Json
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string | null
          role: UserRole
          org_id: string | null
          phone: string | null
          address: string | null
          custom_metadata: Json
        } & Timestamps
        Insert: {
          id: string
          full_name: string
          email?: string | null
          role: UserRole
          org_id?: string | null
          phone?: string | null
          address?: string | null
          custom_metadata?: Json
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      subjects: {
        Row: {
          id: string
          org_id: string
          name: string
          is_active: boolean
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          name: string
          is_active?: boolean
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          org_id: string
          subject_id: string | null
          name: string
          teacher_id: string | null
          start_date: string | null
          end_date: string | null
          custom_metadata: Json
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          subject_id?: string | null
          name: string
          teacher_id?: string | null
          start_date?: string | null
          end_date?: string | null
          custom_metadata?: Json
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['classes']['Insert']>
        Relationships: []
      }
      org_custom_fields: {
        Row: {
          id: string
          org_id: string
          entity_type: 'student' | 'teacher' | 'class'
          field_name: string
          field_label: string
          field_type: 'text' | 'number' | 'date' | 'boolean' | 'select'
          options: Json
          is_required: boolean
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          entity_type: 'student' | 'teacher' | 'class'
          field_name: string
          field_label: string
          field_type: 'text' | 'number' | 'date' | 'boolean' | 'select'
          options?: Json
          is_required?: boolean
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['org_custom_fields']['Insert']>
        Relationships: []
      }
      class_sessions: {
        Row: {
          id: string
          org_id: string
          class_id: string
          teacher_id: string | null
          room: string | null
          start_time: string
          end_time: string
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          class_id: string
          teacher_id?: string | null
          room?: string | null
          start_time: string
          end_time: string
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['class_sessions']['Insert']>
        Relationships: []
      }
      attendance: {
        Row: {
          id: string
          org_id: string
          session_id: string
          student_id: string
          status: AttendanceStatus
          note: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          session_id: string
          student_id: string
          status: AttendanceStatus
          note?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['attendance']['Insert']>
        Relationships: []
      }
      lesson_materials: {
        Row: {
          id: string
          org_id: string
          class_id: string | null
          content: string
          /** vector(1536) - supabase-js trả về dạng string/number[] */
          embedding: string | null
          metadata: Record<string, unknown>
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          class_id?: string | null
          content: string
          embedding?: string | null
          metadata?: Record<string, unknown>
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['lesson_materials']['Insert']>
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          org_id: string
          student_id: string
          amount: number
          status: InvoiceStatus
          due_date: string | null
          note: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          student_id: string
          amount: number
          status?: InvoiceStatus
          due_date?: string | null
          note?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          org_id: string
          invoice_id: string
          amount_paid: number
          payment_method: PaymentMethod
          recorded_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          invoice_id: string
          amount_paid: number
          payment_method: PaymentMethod
          recorded_by?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      assessments: {
        Row: {
          id: string
          org_id: string
          class_id: string
          name: string
          weight: number
          max_score: number
          grading_deadline: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          class_id: string
          name: string
          weight?: number
          max_score?: number
          grading_deadline?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['assessments']['Insert']>
        Relationships: []
      }
      grades: {
        Row: {
          id: string
          org_id: string
          assessment_id: string
          student_id: string
          score: number
          note: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          assessment_id: string
          student_id: string
          score: number
          note?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['grades']['Insert']>
        Relationships: []
      }
      class_results: {
        Row: {
          id: string
          org_id: string
          class_id: string
          /** GENERATED từ lock_status (migration 023) - chỉ đọc */
          is_locked: boolean
          lock_status: 'open' | 'review' | 'locked'
          locked_at: string | null
          locked_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          class_id: string
          lock_status?: 'open' | 'review' | 'locked'
          locked_at?: string | null
          locked_by?: string | null
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['class_results']['Insert']>
        Relationships: []
      }
      enrollments: {
        Row: {
          id: string
          org_id: string
          class_id: string
          student_id: string
          status: EnrollmentStatus
        } & Timestamps
        Insert: {
          id?: string
          org_id: string
          class_id: string
          student_id: string
          status?: EnrollmentStatus
        } & TimestampsInsert
        Update: Partial<Database['public']['Tables']['enrollments']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_descendant_org_ids: {
        Args: { p_org_id: string }
        Returns: string[]
      }
      check_schedule_conflict: {
        Args: {
          p_teacher_id: string | null
          p_room: string | null
          p_start_time: string
          p_end_time: string
        }
        Returns: boolean
      }
      match_lesson_materials: {
        Args: {
          query_embedding: string
          p_org_id: string
          filter_class_id?: string | null
          match_count?: number
        }
        Returns: {
          id: string
          class_id: string | null
          org_id: string
          content: string
          metadata: Record<string, unknown>
          similarity: number
        }[]
      }
      is_authorized: {
        Args: {
          p_user_id: string
          p_target_org_id: string
          p_required_role: string
        }
        Returns: boolean
      }
      is_org_in_my_subtree: {
        Args: { p_target_org_id: string }
        Returns: boolean
      }
      get_my_role: {
        Args: Record<string, never>
        Returns: string
      }
      get_my_org_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_my_class: {
        Args: { p_class_id: string }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// ---------- Helper types tiện dụng ----------
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
