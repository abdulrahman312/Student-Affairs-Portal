# MEIS Smart School Portal — Developer & AI Agent Instructions (`INSTRUCTIONS.md`)

> Read `AGENT.md` first before making any edits to this repository.

## Non-Negotiable Engineering Invariants

1. **Zero-Hardcoding Rule**
   - Never hardcode grades, sections, class lists, subjects, bell schedule times, behavior categories, duty types, email domains, or thresholds.
   - Always load master data from Supabase via `AppContext` (`useApp()`) and call `refreshMasterData()` after any Admin mutation so the entire app updates immediately.

2. **Bilingual RTL / LTR Engine**
   - Default language is **Arabic (`dir="rtl"`)**, toggleable instantly from the top header to **English (`dir="ltr"`)**.
   - Always display database records using `getLocalizedName(item, lang)` (`name_ar` vs `name_en`, `title_ar` vs `title_en`, `display_name_ar` vs `display_name_en`).
   - Use logical Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`) or explicit `dir` awareness so layouts mirror cleanly between RTL and LTR.

3. **Strictly English-Only PDF Generation**
   - Behavior Reports and Student Performance Reports generated via `src/utils/pdfExport.ts` (`jspdf` + `jspdf-autotable`) **must remain 100% English** regardless of the active UI language (`ar` or `en`), because `jsPDF` standard fonts render Latin script cleanly and school official exports are English.

4. **Period-Number-Based Timetable & Substitution Rules**
   - Never compare Lower vs Upper bell clock times (`start_time` / `end_time`) when checking timetable conflicts or substitution availability.
   - Validate conflicts exclusively by `(day_of_week, period_number)`:
     - A teacher cannot teach two classes in the same `(day_of_week, period_number)`.
     - Two teachers cannot claim the same `class_section_id` in the same `(day_of_week, period_number)`.
   - Substitute candidates must not have a `timetable_slots` entry in that `(day_of_week, period_number)` and must not have a `teacher_absences` entry on `absence_date`.

5. **Excel (`.xlsx`) Student Importer Contract**
   - Column order is strictly fixed to 6 columns:
     1. `Arabic Name`
     2. `English Name`
     3. `ID/Iqama`
     4. `Father Mobile`
     5. `Grade`
     6. `Section`
   - Perform UPSERT on `students` using `iqama_id` as the unique conflict key.

6. **Riyadh Timezone (`Asia/Riyadh`)**
   - All live clocks, today-date filters, notice active ranges, duty active ranges, and absence/substitution dates use `Asia/Riyadh` (UTC+3).

7. **5-Theme UI System (`src/utils/themes.ts` & `src/index.css`)**
   - Default theme is `ocean-blue` (Light Blue Gradient), controlled via CSS custom properties under `[data-theme="..."]` on `<html>` and persisted in `localStorage` (`meis_ui_theme`).
   - All 5 presets (`ocean-blue`, `royal-navy`, `forest-emerald`, `regal-maroon`, `royal-amethyst`) are switchable live from the Admin Suite (`AdminSuite.tsx`) and must retain high-contrast readability across both RTL Arabic and LTR English views.
