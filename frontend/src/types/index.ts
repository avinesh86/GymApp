// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface TokenPair {
  access: string
  refresh: string
}

export interface AuthUser {
  id: number
  email: string
  first_name: string
  last_name: string
  role: UserRole
  tenant_id: number
  is_active: boolean
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export type UserRole =
  | 'owner'
  | 'admin'
  | 'gym_manager'
  | 'payroll'
  | 'team_leader'
  | 'instructor'
  | 'class_count_admin'

// ─── Tenant ──────────────────────────────────────────────────────────────────

export interface Tenant {
  id: number
  name: string
  slug: string
}

export interface TenantSettings {
  currency_symbol: string
  timezone: string
  invoice_frequency: 'weekly' | 'fortnightly' | 'monthly' | '8-weekly'
  payroll_approval_required: boolean
  week_start_day: number
  default_timetable_view: 'week' | 'list'
  email_notifications_enabled: boolean
  whatsapp_notifications_enabled: boolean
  cover_request_alerts_enabled: boolean
  invoice_reminders_enabled: boolean
  email_enabled: boolean
  notification_from_email: string
  notification_from_name: string
  // write-only on PATCH — never returned
  notification_email_password?: string
  // true when a password is already stored server-side
  notification_email_password_set: boolean
}

export interface TenantBranding {
  app_name: string
  logo_url: string | null
  primary_color: string
}

export interface WhatsAppAccount {
  id: number
  business_phone_number: string
  display_name: string
  phone_number_id: string
  waba_id: string
  // write-only — never returned
  access_token?: string
  // true when an access token is already stored server-side
  access_token_set: boolean
  webhook_verify_token: string
  is_active: boolean
}

// ─── Sites / Locations ───────────────────────────────────────────────────────

export interface Site {
  id: number
  name: string
  address: string
  is_active: boolean
}

// ─── Class Types ─────────────────────────────────────────────────────────────

export interface ClassType {
  id: number
  name: string
  color: string
  description: string
  duration_minutes: number
  default_location: string
  required_qualifications: string
  red_threshold: number
  amber_threshold: number
  green_threshold: number
  purple_threshold: number
  is_active: boolean
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: number
  name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  is_active?: boolean
  reliability_score: number | null
  avatar: string | null
}

export interface PayRate {
  id: number
  rate_type: string
  amount: string
  rate_per_hour: string
  effective_from: string
  effective_to: string | null
}

export interface Qualification {
  id: number
  name: string
  issued_at: string | null
  issued_date: string | null
  expires_at: string | null
  expiry_date: string | null
  document: string | null
  is_expired: boolean
}

export interface Capability {
  id: number
  staff_id: number
  class_type: number
  class_type_name: string
}

export interface Availability {
  id: number
  staff_id: number
  day_of_week: number
  start_time: string
  end_time: string
  is_available?: boolean
}

// ─── Timetable ───────────────────────────────────────────────────────────────

export type TimetableEventStatus =
  | 'scheduled'
  | 'unfilled'
  | 'needs_cover'
  | 'cancelled'
  | 'completed'

export interface TimetableEvent {
  id: number
  class_type: number
  class_type_name: string
  instructor: number | null
  instructor_name: string | null
  original_instructor_name?: string | null
  site: number
  site_name: string
  start_datetime?: string
  end_datetime?: string
  date: string
  start_time: string
  end_time: string
  capacity: number
  status: TimetableEventStatus
  attendance_count: number | null
  notes: string
  viability_color?: string
  internal_notes?: string
  cancellation_reason?: string
  recurring_pattern_id?: string | null
  archive_status?: string
}

// ─── Cover ───────────────────────────────────────────────────────────────────

export type CoverUrgency = 'low' | 'high' | 'critical'
export type CoverRequestStatus = 'open' | 'offered' | 'accepted' | 'cancelled'

export interface CoverRequest {
  id: number
  timetable_event: number
  event: number
  event_detail: TimetableEvent
  original_instructor_name: string | null
  urgency: CoverUrgency
  bonus_amount: string | null
  status: CoverRequestStatus
  notes: string
  cancellation_reason: string
  cancelled_at: string | null
  cancelled_by_name: string | null
  created_at: string
  updated_at: string
  offers: CoverOffer[]
}

export interface CoverOffer {
  id: number
  staff: number
  staff_name: string
  instructor: number
  instructor_name: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  offered_at: string
  responded_at: string | null
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: number
  event: number
  event_detail: TimetableEvent
  count: number
  recorded_by: number | null
  recorded_at: string | null
  is_verified: boolean
}

export interface QRToken {
  id: number
  timetable_event: number
  event: number
  token: string
  url: string
  expires_at: string
  is_used: boolean
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'submitted'
  | 'manager_approved'
  | 'payroll_approved'
  | 'paid'
  | 'rejected'
  | 'cancelled'

export interface Invoice {
  id: number
  invoice_number: string
  instructor: number
  instructor_name: string
  period_start: string
  period_end: string
  status: InvoiceStatus
  total_amount: string
  class_count: number
  submitted_at: string | null
  notes: string
  line_items: InvoiceLineItem[]
  approvals: ApprovalEvent[]
  approval_history: ApprovalEvent[]
}

export interface InvoiceLineItem {
  id: number
  timetable_event: number | null
  description: string
  quantity: string
  rate: string
  rate_per_hour: string
  amount: string
  event_date: string | null
  class_name: string
  duration_minutes: number | null
  is_bonus: boolean
  is_manual_adjustment: boolean
  is_flagged: boolean
  flag_reason: string
  has_bonus: boolean
  has_adjustment: boolean
}

export interface ApprovalEvent {
  id: number
  approved_by: number
  approved_by_email: string
  actor_name: string
  role: string
  action: string
  notes: string
  approved_at: string
  timestamp: string
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface AttendanceReport {
  from_date: string
  to_date: string
  total_classes: number
  classes_with_attendance: number
  avg_attendance: number
  total_attendees: number
  daily_breakdown: Array<{
    date: string
    events: Array<{
      event_id: number
      class_name: string
      time: string
      instructor_name: string | null
      site_name: string | null
      attendance_count: number | null
      color: string
    }>
  }>
  weekly_trend: Array<{ week_start: string; avg_attendance: number; total_classes: number }>
  by_class_type: Array<{ class_type_id: number; class_type_name: string; avg_attendance: number; color: string }>
  by_day_of_week: Array<{ day: string; avg_attendance: number }>
  by_time_slot: Array<{ slot: string; avg_attendance: number }>
  class_log: Array<{
    event_id: number
    class_name: string
    instructor_name: string | null
    site_name: string | null
    date: string
    time: string
    attendance_count: number
    color: string
  }>
  class_type_weekly_trend: Record<string, Array<{ week_start: string; avg_attendance: number }>>
}

export interface InstructorReliabilityReport {
  instructor_id: number
  instructor_name: string
  total_classes: number
  avg_attendance: number
  reliability_score: number
  cover_requests_count: number
}

export interface PayrollReport {
  total_payroll: string
  paid_amount: string
  pending_amount: string
  avg_per_instructor: string
  period_breakdown: PayrollPeriod[]
  instructor_breakdown: InstructorPayrollSummary[]
}

export interface PayrollPeriod {
  period: string
  amount: string
}

export interface InstructorPayrollSummary {
  instructor_id: number
  instructor_name: string
  invoice_count: number
  total_amount: string
  status: string
}

export interface ClassViabilityReport {
  class_type_id: number
  class_type_name: string
  total_classes: number
  avg_attendance: number
  viability_percentage: number
  red_count: number
  amber_count: number
  green_count: number
  purple_count: number
}

export interface ClassesReport {
  class_type_id: number
  class_type_name: string
  total_classes: number
  avg_attendance: number
  viability_percentage: number
  cancellation_percentage: number
  color: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface AppNotification {
  id: number
  title: string
  body: string
  notification_type: string
  is_read: boolean
  read_at: string | null
  related_object_type: string
  related_object_id: string
  action_type: string
  action_payload: Record<string, unknown>
  created_at: string
}

// ─── Imports ─────────────────────────────────────────────────────────────────

export type ImportType = 'staff' | 'timetable' | 'attendance'
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ImportJob {
  id: number
  import_type: ImportType
  status: ImportStatus
  total_rows: number
  success_rows: number
  failed_rows: number
  errors: ImportError[]
  created_at: string
  completed_at: string | null
}

export interface ImportError {
  row: number
  field: string
  message: string
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: UserRole
  is_active: boolean
  date_joined: string
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  total_active_staff: number
  classes_this_week: number
  pending_covers: number
  pending_invoices: number
}

// ─── Signup / SaaS onboarding ────────────────────────────────────────────────

export interface SignupPayload {
  business_name: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  password: string
  payment_method_id: string
}

export interface SignupResponse {
  access: string
  refresh: string
  tenant_slug: string
  tenant_name: string
  setup_completed: boolean
  trial_ends_at: string | null
}

export interface SetupStatus {
  setup_completed: boolean
  has_location: boolean
  has_class_type: boolean
  trial_ends_at: string | null
  subscription_status: string
}
