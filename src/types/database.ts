export type Language = 'ar' | 'en';

export type UserRole =
  | 'teacher'
  | 'supervisor'
  | 'academic_supervisor'
  | 'principal'
  | 'admin';

export type NoticePriority = 'normal' | 'important' | 'urgent';

export interface SchoolSettings {
  id: string;
  school_name_en: string;
  school_name_ar: string;
  school_logo_url: string;
  allowed_email_domain: string;
  max_monthly_substitutions: number;
  high_behavior_threshold: number;
  default_language: Language;
  timezone: string;
  updated_at?: string;
}

export interface Division {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  is_active: boolean;
}

export interface Grade {
  id: string;
  division_id: string;
  grade_number: number;
  name_en: string;
  name_ar: string;
  sort_order: number;
}

export interface Section {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
}

export interface ClassSection {
  id: string;
  grade_id: string;
  section_id: string;
  display_name_en: string;
  display_name_ar: string;
  is_active: boolean;
}

export interface Subject {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  in_lower_grades: boolean;
  in_upper_grades: boolean;
  sort_order: number;
}

export interface Timeslot {
  id: string;
  division_id: string;
  period_number: number | null;
  name_en: string;
  name_ar: string;
  start_time: string;
  end_time: string | null;
  is_break: boolean;
  sort_order: number;
}

export interface BehaviorCategory {
  id: string;
  name_en: string;
  name_ar: string;
  severity_points: number;
  sort_order: number;
  is_active: boolean;
}

export interface DutyType {
  id: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
}

export interface Profile {
  id: string;
  email: string;
  name_en: string;
  name_ar: string;
  roles: UserRole[];
  active_role: UserRole;
  primary_subject_id: string | null;
  division_id: string | null;
  is_onboarded: boolean;
  is_dummy: boolean;
  dummy_password: string | null;
  created_at?: string;
}

export interface StaffClassAssignment {
  id: string;
  user_id: string;
  class_section_id: string;
  subject_id: string | null;
  assignment_type: 'teacher' | 'supervisor';
}

export interface Student {
  id: string;
  iqama_id: string;
  name_ar: string;
  name_en: string;
  father_mobile: string;
  grade_id: string;
  section_id: string;
  class_section_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface BehaviorLog {
  id: string;
  student_id: string;
  teacher_id: string;
  class_section_id: string;
  subject_id: string | null;
  behavior_category_id: string;
  period_number: number | null;
  notes: string | null;
  created_at: string;
}

export interface PerformanceRequest {
  id: string;
  student_id: string;
  requested_by: string;
  request_date: string;
  status: string;
  created_at?: string;
}

export interface PerformanceComment {
  id: string;
  request_id: string;
  subject_id: string;
  teacher_id: string | null;
  comment_text: string | null;
  is_submitted: boolean;
  submitted_at: string | null;
}

export interface TimetableSlot {
  id: string;
  teacher_id: string;
  class_section_id: string;
  subject_id: string;
  day_of_week: number;
  period_number: number;
  created_at?: string;
}

export interface TeacherAbsence {
  id: string;
  teacher_id: string;
  absence_date: string;
  reason: string | null;
  marked_by: string | null;
  created_at?: string;
}

export interface Substitution {
  id: string;
  absence_id: string | null;
  absence_date: string;
  period_number: number;
  class_section_id: string;
  substitute_teacher_id: string;
  assigned_by: string | null;
  created_at?: string;
}

export interface DutyAssignment {
  id: string;
  teacher_id: string;
  duty_type_id: string;
  start_date: string;
  end_date: string;
  location_text: string;
  assigned_by: string | null;
  created_at?: string;
}

export interface Notice {
  id: string;
  title_en: string;
  title_ar: string;
  content_en: string;
  content_ar: string;
  priority: NoticePriority;
  target_division_id: string | null;
  start_date: string;
  end_date: string;
  published_by: string | null;
  created_at?: string;
}
