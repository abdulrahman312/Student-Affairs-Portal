# Middle East International School (MEIS) — Smart School Portal Architecture (`AGENT.md`)

> **MANDATORY RULE FOR ALL AI AGENTS:**
> Any AI agent modifying this repository **must read `AGENT.md` (and `INSTRUCTIONS.md`) first**, **never hardcode school data in frontend arrays**, **always query Supabase tables dynamically**, and **preserve bilingual Arabic RTL / English LTR support and strictly English-only PDF generation**.

---

## 1. Directory & Component Structure

```text
/
├── AGENT.md                          # Primary architecture & schema reference (read first)
├── INSTRUCTIONS.md                   # Operational rules & development checklist
├── vercel.json                       # Vercel SPA rewrite rules (/* -> /index.html)
├── index.html                        # Entry HTML (default lang="ar" dir="rtl", Cairo + Plus Jakarta Sans)
├── src/
│   ├── main.tsx                      # React 19 root mount
│   ├── App.tsx                       # Root routing between Auth, Onboarding, and App Shell
│   ├── index.css                     # Tailwind CSS v4 + MEIS glassmorphism & mesh theme
│   ├── assets/images/                # Generated MEIS school crest emblem
│   ├── lib/
│   │   └── supabase.ts               # Live Supabase client (@supabase/supabase-js)
│   ├── types/
│   │   └── database.ts               # TypeScript models matching live PostgreSQL tables
│   ├── utils/
│   │   ├── i18n.ts                   # Bilingual AR/EN dictionary & localized field resolver
│   │   ├── riyadhTime.ts             # Asia/Riyadh (UTC+3) clock, Sun–Thu calendar & active bell helper
│   │   ├── schoolRules.ts            # Pure business logic (conflicts, watchlist, Excel parser, WhatsApp)
│   │   ├── schoolRules.test.ts       # Deterministic unit tests (node:test)
│   │   └── pdfExport.ts              # Strictly English-only PDF exports (jspdf + jspdf-autotable)
│   ├── context/
│   │   └── AppContext.tsx            # Auth, dummy login/impersonation, role switching, dynamic master data
│   └── components/
│       ├── AuthScreen.tsx            # Google OAuth, @meis.sch.sa email login/signup, dummy login
│       ├── OnboardingWizard.tsx      # 3-step onboarding (role, AR/EN names, subject/classes/division)
│       ├── LayoutShell.tsx           # Sidebar + Mobile drawer/bottom nav + Riyadh clock header
│       ├── NoticeBoardSection.tsx    # Active notice banner/carousel + Notice CRUD modal
│       ├── DashboardHome.tsx         # Role-adapted overview & live alerts
│       ├── BehaviorModule.tsx        # Recording, feed, watchlist, student profile, WhatsApp & PDF
│       ├── PerformanceModule.tsx     # Report requests, teacher comments, tracker, 2-col English PDF
│       ├── TimetableSubstitutionModule.tsx # Sun-Thu P1-7 grid, period-only conflict check, substitutions
│       ├── DutyModule.tsx            # Single/range duty assignments with location_text
│       └── AdminSuite.tsx            # Users/Dummy, Students/.xlsx UPSERT, Master Data, Global Records
```

---

## 2. Live Supabase Database Schema & Zero-Hardcoding Rule

All structural, academic, schedule, and lookup data lives in Supabase PostgreSQL (`https://bmyewtkobcnmnkhodeyd.supabase.co`). Frontend components **never** hardcode grades, sections, subjects, bell times, behavior categories, or duty types.

### Core Configuration & Academic Structure
- `school_settings` (`id, school_name_en, school_name_ar, school_logo_url, allowed_email_domain, max_monthly_substitutions, high_behavior_threshold, default_language, timezone, updated_at`)
- `divisions` (`id, code, name_en, name_ar, sort_order, is_active`) — e.g., `LOWER` (Grades 4–6), `UPPER` (Grades 7–12)
- `grades` (`id, division_id -> divisions.id, grade_number, name_en, name_ar, sort_order`)
- `sections` (`id, code, name_en, name_ar, sort_order`)
- `class_sections` (`id, grade_id -> grades.id, section_id -> sections.id, display_name_en, display_name_ar, is_active`)
- `subjects` (`id, code, name_en, name_ar, in_lower_grades, in_upper_grades, sort_order`)
- `timeslots` (`id, division_id -> divisions.id, period_number, name_en, name_ar, start_time, end_time, is_break, sort_order`)
- `behavior_categories` (`id, name_en, name_ar, severity_points, sort_order, is_active`)
- `duty_types` (`id, name_en, name_ar, sort_order`)

### Users, Assignments & Students
- `profiles` (`id, email, name_en, name_ar, roles: UserRole[], active_role: UserRole, primary_subject_id -> subjects.id, division_id -> divisions.id, is_onboarded, is_dummy, dummy_password, created_at`)
- `staff_class_assignments` (`id, user_id -> profiles.id, class_section_id -> class_sections.id, subject_id -> subjects.id | null, assignment_type ['teacher' | 'supervisor']`)
- `students` (`id, iqama_id [UNIQUE], name_ar, name_en, father_mobile, grade_id -> grades.id, section_id -> sections.id, class_section_id -> class_sections.id, created_at, updated_at`)

### Operational Modules
- `notices` (`id, title_en, title_ar, content_en, content_ar, priority ['normal'|'important'|'urgent'], target_division_id -> divisions.id | null, start_date, end_date, published_by -> profiles.id, created_at`)
- `behavior_logs` (`id, student_id -> students.id, teacher_id -> profiles.id, class_section_id -> class_sections.id, subject_id -> subjects.id, behavior_category_id -> behavior_categories.id, period_number, notes, created_at`)
- `performance_requests` (`id, student_id -> students.id, requested_by -> profiles.id, request_date, status ['pending' | 'completed'], created_at`)
- `performance_comments` (`id, request_id -> performance_requests.id, subject_id -> subjects.id, teacher_id -> profiles.id, comment_text, is_submitted, submitted_at`)
- `timetable_slots` (`id, teacher_id -> profiles.id, class_section_id -> class_sections.id, subject_id -> subjects.id, day_of_week [0=Sun..4=Thu], period_number [1..7], created_at`)
- `teacher_absences` (`id, teacher_id -> profiles.id, absence_date, reason, marked_by -> profiles.id, created_at`)
- `substitutions` (`id, absence_id -> teacher_absences.id, absence_date, period_number, class_section_id -> class_sections.id, original_teacher_id -> profiles.id, substitute_teacher_id -> profiles.id, assigned_by -> profiles.id, created_at`)
- `duty_assignments` (`id, teacher_id -> profiles.id, duty_type_id -> duty_types.id, start_date, end_date, location_text, assigned_by -> profiles.id, created_at`)

---

## 3. Roles & Multi-Role Switching Logic

The platform defines 5 roles:
1. `teacher` — Records student behaviors, submits pending performance comments, manages own Sun–Thu P1–7 timetable, marks own absences, views assigned substitutions and active duties.
2. `supervisor` — Oversees assigned `class_sections` across Lower/Upper grades; monitors Today's Behavior Feed & High-Risk Watchlist, exports English PDFs, sends WhatsApp parent alerts, marks teacher absences, assigns period-based substitutes, assigns teacher duties.
3. `academic_supervisor` — Division-level (`Lower` or `Upper`) academic & behavior oversight, requests/deletes performance reports, publishes/edits notices, assigns substitutes & duties, exports PDFs.
4. `principal` — Full division-level (`Lower` or `Upper`) leadership across behavior, performance reports, notices, absences, substitutions, and duties.
5. `admin` — 100% system control: manages users & multi-roles, creates & impersonates dummy test accounts, imports `.xlsx` students (6-column UPSERT on `iqama_id`), edits all master data tables, and manages global operational records.

**Special Rules:**
- **Onboarding Security:** `admin` is **never** selectable during self-service onboarding. Only an existing `admin` may grant the `admin` role.
- **Root Super-Admin Email:** Any session with `abdulrahman@meis.sch.sa` automatically receives all 5 roles (`['admin', 'teacher', 'supervisor', 'academic_supervisor', 'principal']`).
- **Multi-Role Switching:** `profiles.roles` holds an array of roles; `profiles.active_role` controls the active dashboard view. When `roles.length > 1`, the top header exposes an instant Role Switcher dropdown.
- **Period-Only Conflict Logic:** Timetable conflicts and substitution availability check **only** `day_of_week` (0–4) and `period_number` (1–7), deliberately ignoring clock-time differences between Lower and Upper divisions.
- **English-Only PDFs:** All `jspdf` exports must render strictly in English with the MEIS school crest and `"Middle East International School"` header.
