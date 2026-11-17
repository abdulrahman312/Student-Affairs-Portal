import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  BehaviorCategory,
  BehaviorLog,
  ClassSection,
  PerformanceComment,
  PerformanceRequest,
  Profile,
  SchoolSettings,
  Student,
  Subject,
  Substitution,
  TeacherAbsence,
  TimetableSlot,
} from '../types/database';
import { DAY_NAMES } from './i18n';
import { getIsoWeekdayFromDateStr, getRiyadhParts } from './riyadhTime';
import { getBehaviorLevel } from './schoolRules';

const MEIS_CREST_PATH = '/src/assets/images/meis_school_crest_1794849576691.jpg';

// Print-friendly institutional MEIS palette (crisp, light-ink colors for easy office printing)
const COLORS = {
  royalNavy: [30, 58, 138] as [number, number, number], // #1e3a8a
  royalBlue: [37, 99, 235] as [number, number, number], // #2563eb
  emeraldDark: [4, 120, 87] as [number, number, number], // #047857
  emeraldMid: [16, 185, 129] as [number, number, number], // #10b981
  headerBg: [240, 247, 255] as [number, number, number], // soft sky tint
  headerBorder: [191, 219, 254] as [number, number, number], // blue-200
  tableHeadBg: [219, 234, 254] as [number, number, number], // blue-100
  tableHeadBorder: [147, 197, 253] as [number, number, number], // blue-300
  cardBg: [248, 250, 252] as [number, number, number], // slate-50
  cardBorder: [203, 213, 225] as [number, number, number], // slate-300
  bodyText: [30, 41, 59] as [number, number, number], // slate-800
  mutedText: [71, 85, 105] as [number, number, number], // slate-600
  subtleText: [100, 116, 139] as [number, number, number], // slate-500
  zebraBg: [248, 250, 252] as [number, number, number], // slate-50
};

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 256;
    canvas.height = img.naturalHeight || 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  }
}

async function drawMeisHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  settings: SchoolSettings | null
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Light print-friendly header background card with royal blue + emerald accent stripes
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 35, 'F');

  // Top Royal Blue + Emerald dual accent lines
  doc.setFillColor(...COLORS.royalNavy);
  doc.rect(0, 0, pageWidth, 2.5, 'F');
  doc.setFillColor(...COLORS.emeraldMid);
  doc.rect(0, 35, pageWidth, 1.2, 'F');

  doc.setDrawColor(...COLORS.headerBorder);
  doc.setLineWidth(0.3);
  doc.line(0, 34.8, pageWidth, 34.8);

  // School crest logo framed in white
  const logoData =
    (await loadImageAsDataUrl(MEIS_CREST_PATH)) ||
    (settings?.school_logo_url ? await loadImageAsDataUrl(settings.school_logo_url) : null);

  if (logoData) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLORS.headerBorder);
    doc.roundedRect(14, 6, 24, 24, 3, 3, 'FD');
    doc.addImage(logoData, 'JPEG', 15, 7, 22, 22);
  }

  const textX = logoData ? 44 : 14;
  doc.setTextColor(...COLORS.royalNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings?.school_name_en || 'Middle East International School', textX, 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLORS.mutedText);
  doc.text('Riyadh, Kingdom of Saudi Arabia  |  Official Academic & Student Affairs Record', textX, 20.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.emeraldDark);
  doc.text(title.toUpperCase(), textX, 28.5);

  const todayStr = getRiyadhParts(new Date()).dateStr;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.mutedText);
  doc.text(`Generated: ${todayStr} (Riyadh)`, pageWidth - 14, 14.5, { align: 'right' });
  doc.text(subtitle, pageWidth - 14, 20.8, { align: 'right' });

  return 44;
}

function drawFooter(doc: jsPDF, settings: SchoolSettings | null): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const schoolName = settings?.school_name_en || 'Middle East International School';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.cardBorder);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.subtleText);
    doc.text(`${schoolName} · Riyadh · Official School Document`, 14, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

export async function exportBehaviorReportPdf(params: {
  student: Student;
  classSection: ClassSection | undefined;
  logs: BehaviorLog[];
  categories: BehaviorCategory[];
  subjects: Subject[];
  profiles: Profile[];
  settings: SchoolSettings | null;
}): Promise<void> {
  const { student, classSection, logs, categories, subjects, profiles, settings } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const subMap = new Map(subjects.map((s) => [s.id, s]));
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  let y = await drawMeisHeader(
    doc,
    'Student Behavior Report',
    'Student Affairs Office',
    settings
  );

  // Student info card with clean blue left accent stripe
  doc.setFillColor(...COLORS.cardBg);
  doc.setDrawColor(...COLORS.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, 'FD');

  doc.setFillColor(...COLORS.royalBlue);
  doc.rect(14, y + 2, 2, 20, 'F');

  doc.setTextColor(...COLORS.royalNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(student.name_en || 'Student', 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.mutedText);
  doc.text(`ID / Iqama: ${student.iqama_id}`, 20, y + 14.5);
  doc.text(`Class & Section: ${classSection?.display_name_en || '-'}`, 20, y + 20);
  doc.text(`Father Mobile: +${student.father_mobile || '-'}`, pageWidth - 18, y + 14.5, {
    align: 'right',
  });

  y += 30;

  // Summary statistics badges with crisp borders for clear B&W or color printing
  const totalIncidents = logs.length;
  const totalSeverity = logs.reduce(
    (sum, l) => sum + (catMap.get(l.behavior_category_id)?.severity_points || 1),
    0
  );
  const freqMap = new Map<string, number>();
  for (const l of logs) {
    const name = catMap.get(l.behavior_category_id)?.name_en || 'Other';
    freqMap.set(name, (freqMap.get(name) || 0) + 1);
  }
  const topBehavior =
    [...freqMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None recorded';

  const cardWidth = (pageWidth - 36) / 3;
  const badges = [
    {
      label: 'TOTAL INCIDENTS',
      value: String(totalIncidents),
      bg: [239, 246, 255],
      border: [191, 219, 254],
      fg: [29, 78, 216],
    },
    {
      label: 'SEVERITY POINTS',
      value: String(totalSeverity),
      bg: [254, 242, 242],
      border: [254, 202, 202],
      fg: [185, 28, 28],
    },
    {
      label: 'MOST FREQUENT',
      value: topBehavior.slice(0, 26),
      bg: [236, 253, 245],
      border: [167, 243, 208],
      fg: [4, 120, 87],
    },
  ];

  badges.forEach((b, idx) => {
    const bx = 14 + idx * (cardWidth + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
    doc.roundedRect(bx, y, cardWidth, 16, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.label, bx + 4, y + 5.5);
    doc.setFontSize(10.5);
    doc.text(b.value, bx + 4, y + 12.5);
  });

  y += 22;

  const sortedLogs = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const rows = sortedLogs.map((log, i) => {
    const dt = new Date(log.created_at);
    const riyadhDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt);
    const riyadhTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(dt);

    return [
      String(i + 1),
      riyadhDate,
      riyadhTime,
      log.period_number ? `P${log.period_number}` : '-',
      catMap.get(log.behavior_category_id)?.name_en || '-',
      log.subject_id ? subMap.get(log.subject_id)?.name_en || '-' : '-',
      profMap.get(log.teacher_id)?.name_en || '-',
      log.notes || '-',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Date', 'Time', 'Per.', 'Behavior Category', 'Subject', 'Recorded By', 'Notes']],
    body: rows.length
      ? rows
      : [['-', '-', '-', '-', 'No behavior incidents recorded', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.bodyText,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 21 },
      2: { cellWidth: 18 },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 40 },
      5: { cellWidth: 24 },
      6: { cellWidth: 28 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  drawFooter(doc, settings);

  const safeName = (student.name_en || student.iqama_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MEIS_Behavior_Report_${safeName}.pdf`);
}

export async function exportPerformanceReportPdf(params: {
  request: PerformanceRequest;
  student: Student;
  classSection: ClassSection | undefined;
  comments: PerformanceComment[];
  subjects: Subject[];
  profiles: Profile[];
  settings: SchoolSettings | null;
}): Promise<void> {
  const { request, student, classSection, comments, subjects, profiles, settings } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const subMap = new Map(subjects.map((s) => [s.id, s]));
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  let y = await drawMeisHeader(
    doc,
    'Academic Performance Report',
    `Request Date: ${request.request_date}`,
    settings
  );

  // Student summary box with clean blue left accent stripe
  doc.setFillColor(...COLORS.cardBg);
  doc.setDrawColor(...COLORS.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, 'FD');

  doc.setFillColor(...COLORS.emeraldMid);
  doc.rect(14, y + 2, 2, 20, 'F');

  doc.setTextColor(...COLORS.royalNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(student.name_en || 'Student', 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.mutedText);
  doc.text(`ID / Iqama: ${student.iqama_id}`, 20, y + 14.5);
  doc.text(`Grade & Section: ${classSection?.display_name_en || '-'}`, 20, y + 20);
  doc.text(`Father Mobile: +${student.father_mobile || '-'}`, pageWidth - 18, y + 14.5, {
    align: 'right',
  });
  doc.text(`Report Date: ${request.request_date}`, pageWidth - 18, y + 20, { align: 'right' });

  y += 30;

  const sortedComments = [...comments].sort((a, b) => {
    const sA = subMap.get(a.subject_id)?.sort_order ?? 99;
    const sB = subMap.get(b.subject_id)?.sort_order ?? 99;
    return sA - sB;
  });

  // Strictly 2-Column Table: Left = Subject Name (English) | Right = Teacher's Comment (with Teacher's English Name)
  const rows = sortedComments.map((c) => {
    const subjectName = subMap.get(c.subject_id)?.name_en || 'Subject';
    const teacherName = c.teacher_id
      ? profMap.get(c.teacher_id)?.name_en || 'Teacher'
      : 'Assigned Teacher';
    const commentBlock =
      c.is_submitted && c.comment_text
        ? `${c.comment_text}\n\n— Teacher: ${teacherName}`
        : `Pending evaluation\n\n— Assigned Teacher: ${teacherName}`;
    return [subjectName, commentBlock];
  });

  autoTable(doc, {
    startY: y,
    head: [['Subject Name', "Teacher's Academic Performance Comment"]],
    body: rows.length ? rows : [['No subjects assigned', 'No teacher evaluations requested yet.']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: 3.5,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: COLORS.bodyText,
      cellPadding: 4,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', textColor: COLORS.emeraldDark },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  drawFooter(doc, settings);

  const safeName = (student.name_en || student.iqama_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MEIS_Performance_Report_${safeName}_${request.request_date}.pdf`);
}

export async function exportDailyAbsencesPdf(params: {
  targetDate: string;
  absences: TeacherAbsence[];
  substitutions: Substitution[];
  timetableSlots: TimetableSlot[];
  classSections: ClassSection[];
  subjects: Subject[];
  profiles: Profile[];
  settings: SchoolSettings | null;
}): Promise<void> {
  const {
    targetDate,
    absences,
    substitutions,
    timetableSlots,
    classSections,
    subjects,
    profiles,
    settings,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const classMap = new Map(classSections.map((c) => [c.id, c]));
  const subMap = new Map(subjects.map((s) => [s.id, s]));
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  const weekday = getIsoWeekdayFromDateStr(targetDate);
  const weekdayEn = DAY_NAMES[weekday]?.en || 'Weekend';

  let y = await drawMeisHeader(
    doc,
    'Daily Teacher Absences & Substitutions Report',
    `Date: ${targetDate} (${weekdayEn})`,
    settings
  );

  // Build rows & summary totals
  const sortedAbsences = [...absences].sort((a, b) => {
    const nameA = profMap.get(a.teacher_id)?.name_en || '';
    const nameB = profMap.get(b.teacher_id)?.name_en || '';
    return nameA.localeCompare(nameB);
  });

  let totalScheduledPeriods = 0;
  let coveredPeriods = 0;
  let uncoveredPeriods = 0;

  const tableRows: { cells: string[]; needsSubstitute: boolean }[] = [];

  sortedAbsences.forEach((abs, idx) => {
    const teacherName = profMap.get(abs.teacher_id)?.name_en || 'Teacher';
    const reasonText = abs.reason || '-';
    const teacherDaySlots = timetableSlots
      .filter((s) => s.teacher_id === abs.teacher_id && s.day_of_week === weekday)
      .sort((a, b) => a.period_number - b.period_number);

    if (teacherDaySlots.length === 0) {
      tableRows.push({
        cells: [
          String(idx + 1),
          teacherName,
          reasonText,
          '-',
          'No scheduled periods on this weekday',
          'N/A',
        ],
        needsSubstitute: false,
      });
      return;
    }

    teacherDaySlots.forEach((slot, sIdx) => {
      totalScheduledPeriods += 1;
      const cs = classMap.get(slot.class_section_id);
      const sub = subMap.get(slot.subject_id);
      const assignedSub = substitutions.find(
        (s) =>
          s.absence_date === targetDate &&
          s.period_number === slot.period_number &&
          s.class_section_id === slot.class_section_id
      );
      const subTeacher = assignedSub
        ? profMap.get(assignedSub.substitute_teacher_id)?.name_en || 'Assigned Teacher'
        : null;

      if (subTeacher) {
        coveredPeriods += 1;
      } else {
        uncoveredPeriods += 1;
      }

      const classLabel = `${cs?.display_name_en || '-'}${sub?.name_en ? ` (${sub.name_en})` : ''}`;
      tableRows.push({
        cells: [
          sIdx === 0 ? String(idx + 1) : '',
          sIdx === 0 ? teacherName : '',
          sIdx === 0 ? reasonText : '',
          `Period ${slot.period_number}`,
          classLabel,
          subTeacher || 'Needs Substitute',
        ],
        needsSubstitute: !subTeacher,
      });
    });
  });

  // Summary cards
  const cardWidth = (pageWidth - 36) / 3;
  const badges = [
    {
      label: 'ABSENT TEACHERS',
      value: String(sortedAbsences.length),
      bg: [239, 246, 255],
      border: [191, 219, 254],
      fg: [29, 78, 216],
    },
    {
      label: 'COVERED PERIODS',
      value: `${coveredPeriods} / ${totalScheduledPeriods}`,
      bg: [236, 253, 245],
      border: [167, 243, 208],
      fg: [4, 120, 87],
    },
    {
      label: 'NEEDS SUBSTITUTE',
      value: String(uncoveredPeriods),
      bg: uncoveredPeriods > 0 ? [254, 242, 242] : [248, 250, 252],
      border: uncoveredPeriods > 0 ? [254, 202, 202] : [203, 213, 225],
      fg: uncoveredPeriods > 0 ? [185, 28, 28] : [71, 85, 105],
    },
  ];

  badges.forEach((b, idx) => {
    const bx = 14 + idx * (cardWidth + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, cardWidth, 16, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.label, bx + 4, y + 5.5);
    doc.setFontSize(11);
    doc.text(b.value, bx + 4, y + 12.5);
  });

  y += 22;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Absent Teacher', 'Reason', 'Period', 'Class & Subject', 'Substitute Teacher']],
    body: tableRows.length
      ? tableRows.map((r) => r.cells)
      : [['-', 'No teacher absences recorded for this date', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 3,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: COLORS.bodyText,
      cellPadding: 3,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 30 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 44 },
      5: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const rowMeta = tableRows[hookData.row.index];
        if (rowMeta?.needsSubstitute) {
          hookData.cell.styles.textColor = [180, 83, 9]; // amber-700
        } else if (hookData.cell.text[0] && hookData.cell.text[0] !== 'N/A' && hookData.cell.text[0] !== '-') {
          hookData.cell.styles.textColor = COLORS.emeraldDark;
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  drawFooter(doc, settings);

  doc.save(`MEIS_Daily_Absences_Substitutions_${targetDate}.pdf`);
}

export async function exportTeacherBehaviorRangePdf(params: {
  teacher: Profile;
  fromDate: string;
  toDate: string;
  classFilterLabel?: string;
  logs: BehaviorLog[];
  students: Student[];
  classSections: ClassSection[];
  categories: BehaviorCategory[];
  subjects: Subject[];
  settings: SchoolSettings | null;
}): Promise<void> {
  const {
    teacher,
    fromDate,
    toDate,
    classFilterLabel,
    logs,
    students,
    classSections,
    categories,
    subjects,
    settings,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const classMap = new Map(classSections.map((c) => [c.id, c]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const subMap = new Map(subjects.map((s) => [s.id, s]));

  let y = await drawMeisHeader(
    doc,
    'Teacher Behavior Log Report',
    `Range: ${fromDate} to ${toDate}`,
    settings
  );

  // Teacher Metadata Box
  doc.setFillColor(...COLORS.cardBg);
  doc.setDrawColor(...COLORS.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 22, 3, 3, 'FD');

  doc.setFillColor(...COLORS.royalBlue);
  doc.rect(14, y + 2, 2, 18, 'F');

  doc.setTextColor(...COLORS.royalNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(teacher.name_en || teacher.email, 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.mutedText);
  const subjectName = teacher.primary_subject_id
    ? subMap.get(teacher.primary_subject_id)?.name_en || '-'
    : 'All Subjects';
  doc.text(`Subject: ${subjectName}  |  Scope: ${classFilterLabel || 'All Assigned Classes'}`, 20, y + 14);
  doc.text(`Recorded Exclusively By: ${teacher.name_en || teacher.email}`, 20, y + 19.2);
  doc.text(`From ${fromDate} to ${toDate}`, pageWidth - 18, y + 14, { align: 'right' });

  y += 28;

  // Summary Cards
  const uniqueStudents = new Set(logs.map((l) => l.student_id)).size;
  const catFreq = new Map<string, number>();
  for (const l of logs) {
    const label = catMap.get(l.behavior_category_id)?.name_en || 'Other';
    catFreq.set(label, (catFreq.get(label) || 0) + 1);
  }
  const topCat = [...catFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  const cardWidth = (pageWidth - 36) / 3;
  const summaryCards = [
    {
      label: 'TOTAL RECORDED',
      value: String(logs.length),
      bg: [239, 246, 255],
      border: [191, 219, 254],
      fg: [29, 78, 216],
    },
    {
      label: 'STUDENTS INVOLVED',
      value: String(uniqueStudents),
      bg: [236, 253, 245],
      border: [167, 243, 208],
      fg: [4, 120, 87],
    },
    {
      label: 'MOST FREQUENT TYPE',
      value: topCat.slice(0, 24),
      bg: [255, 247, 237],
      border: [254, 215, 170],
      fg: [194, 65, 12],
    },
  ];

  summaryCards.forEach((b, idx) => {
    const bx = 14 + idx * (cardWidth + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
    doc.roundedRect(bx, y, cardWidth, 16, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.label, bx + 4, y + 5.5);
    doc.setFontSize(10.5);
    doc.text(b.value, bx + 4, y + 12.5);
  });

  y += 22;

  const sortedLogs = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const rows = sortedLogs.map((log, idx) => {
    const dt = new Date(log.created_at);
    const riyadhDate = getRiyadhParts(dt).dateStr;
    const riyadhTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(dt);
    const st = studentMap.get(log.student_id);
    const cs = classMap.get(log.class_section_id || st?.class_section_id || '');
    return [
      String(idx + 1),
      riyadhDate,
      riyadhTime,
      cs?.display_name_en || '-',
      st?.name_en || '-',
      log.period_number ? `P${log.period_number}` : '-',
      catMap.get(log.behavior_category_id)?.name_en || '-',
      log.notes || '-',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Date', 'Time', 'Class', 'Student Name', 'Per.', 'Behavior Category', 'Notes']],
    body: rows.length
      ? rows
      : [['-', '-', '-', '-', 'No behavior incidents recorded in this date range', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.bodyText,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 17 },
      3: { cellWidth: 23 },
      4: { cellWidth: 34, fontStyle: 'bold' },
      5: { cellWidth: 10, halign: 'center' },
      6: { cellWidth: 36 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  drawFooter(doc, settings);

  const safeName = (teacher.name_en || 'Teacher').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MEIS_Teacher_Behavior_${safeName}_${fromDate}_to_${toDate}.pdf`);
}

export async function exportClassBehaviorRangePdf(params: {
  classSection: ClassSection;
  fromDate: string;
  toDate: string;
  generatedBy: Profile;
  classStudents: Student[];
  logs: BehaviorLog[];
  categories: BehaviorCategory[];
  subjects: Subject[];
  profiles: Profile[];
  settings: SchoolSettings | null;
}): Promise<void> {
  const {
    classSection,
    fromDate,
    toDate,
    generatedBy,
    classStudents,
    logs,
    categories,
    subjects,
    profiles,
    settings,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const studentMap = new Map(classStudents.map((s) => [s.id, s]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const subMap = new Map(subjects.map((s) => [s.id, s]));
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  let y = await drawMeisHeader(
    doc,
    'Class Behavior Report',
    `${classSection.display_name_en} | ${fromDate} to ${toDate}`,
    settings
  );

  // Class Info Card
  doc.setFillColor(...COLORS.cardBg);
  doc.setDrawColor(...COLORS.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 22, 3, 3, 'FD');

  doc.setFillColor(...COLORS.emeraldMid);
  doc.rect(14, y + 2, 2, 18, 'F');

  doc.setTextColor(...COLORS.royalNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Class: ${classSection.display_name_en}`, 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.mutedText);
  doc.text(`Date Range: ${fromDate} to ${toDate}  |  Students in Class: ${classStudents.length}`, 20, y + 14);
  doc.text(`Prepared By: ${generatedBy.name_en || generatedBy.email}`, 20, y + 19.2);

  y += 28;

  // Build Student-by-Student Breakdown across different teachers
  const logsByStudent = new Map<string, BehaviorLog[]>();
  for (const log of logs) {
    const arr = logsByStudent.get(log.student_id) || [];
    arr.push(log);
    logsByStudent.set(log.student_id, arr);
  }

  let redCount = 0;
  let orangeCount = 0;
  let greenCount = 0;

  const sortedStudents = [...classStudents].sort((a, b) =>
    (a.name_en || a.name_ar).localeCompare(b.name_en || b.name_ar)
  );

  const studentSummaryRows = sortedStudents.map((st, idx) => {
    const stLogs = logsByStudent.get(st.id) || [];
    const count = stLogs.length;
    const level = getBehaviorLevel(count);
    if (level === 'red') redCount += 1;
    else if (level === 'orange') orangeCount += 1;
    else greenCount += 1;

    const teacherCounts = new Map<string, number>();
    for (const l of stLogs) {
      const tName = profMap.get(l.teacher_id)?.name_en || 'Staff';
      teacherCounts.set(tName, (teacherCounts.get(tName) || 0) + 1);
    }
    const teacherSummary =
      teacherCounts.size > 0
        ? [...teacherCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tName, c]) => `${tName} (${c})`)
            .join(', ')
        : 'No incidents';

    const levelLabel =
      level === 'green' ? 'Green (Clear)' : level === 'orange' ? 'Orange (1-5)' : 'Red (>5)';

    return {
      level,
      cells: [
        String(idx + 1),
        st.iqama_id,
        st.name_en || st.name_ar,
        String(count),
        levelLabel,
        teacherSummary,
      ],
    };
  });

  // Summary KPI Cards
  const cardWidth = (pageWidth - 36) / 3;
  const cards = [
    {
      label: 'TOTAL CLASS INCIDENTS',
      value: String(logs.length),
      bg: [239, 246, 255],
      border: [191, 219, 254],
      fg: [29, 78, 216],
    },
    {
      label: 'CLEAR (0) / ATTENTION (1-5)',
      value: `${greenCount} Green / ${orangeCount} Orange`,
      bg: [236, 253, 245],
      border: [167, 243, 208],
      fg: [4, 120, 87],
    },
    {
      label: 'CRITICAL LEVEL (>5)',
      value: `${redCount} Students`,
      bg: redCount > 0 ? [254, 242, 242] : [248, 250, 252],
      border: redCount > 0 ? [254, 202, 202] : [203, 213, 225],
      fg: redCount > 0 ? [185, 28, 28] : [71, 85, 105],
    },
  ];

  cards.forEach((b, idx) => {
    const bx = 14 + idx * (cardWidth + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.setDrawColor(b.border[0], b.border[1], b.border[2]);
    doc.roundedRect(bx, y, cardWidth, 16, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.label, bx + 4, y + 5.5);
    doc.setFontSize(10);
    doc.text(b.value, bx + 4, y + 12.5);
  });

  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.royalNavy);
  doc.text('1. Student Summary & Recording Teachers', 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['#', 'ID / Iqama', 'Student Name', 'Count', 'Level', 'Recorded By (Teachers)']],
    body: studentSummaryRows.length
      ? studentSummaryRows.map((r) => r.cells)
      : [['-', '-', 'No students found in this class', '0', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 8.2,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.bodyText,
      cellPadding: 2.5,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 23 },
      2: { cellWidth: 42, fontStyle: 'bold' },
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const meta = studentSummaryRows[hookData.row.index];
        if (meta?.level === 'green') {
          hookData.cell.styles.textColor = COLORS.emeraldDark;
        } else if (meta?.level === 'orange') {
          hookData.cell.styles.textColor = [194, 65, 12];
        } else if (meta?.level === 'red') {
          hookData.cell.styles.textColor = [185, 28, 28];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  // Section 2: Detailed Incident Log across Teachers
  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 20;
  let nextY = finalY + 9;
  if (nextY > doc.internal.pageSize.getHeight() - 45) {
    doc.addPage();
    nextY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.royalNavy);
  doc.text('2. Detailed Chronological Behavior Log', 14, nextY);

  const sortedLogs = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const detailRows = sortedLogs.map((log, idx) => {
    const dt = new Date(log.created_at);
    const riyadhDate = getRiyadhParts(dt).dateStr;
    const riyadhTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(dt);
    const st = studentMap.get(log.student_id);
    return [
      String(idx + 1),
      riyadhDate,
      riyadhTime,
      st?.name_en || '-',
      log.period_number ? `P${log.period_number}` : '-',
      catMap.get(log.behavior_category_id)?.name_en || '-',
      profMap.get(log.teacher_id)?.name_en || '-',
      log.subject_id ? subMap.get(log.subject_id)?.name_en || '-' : '-',
      log.notes || '-',
    ];
  });

  autoTable(doc, {
    startY: nextY + 3,
    head: [['#', 'Date', 'Time', 'Student Name', 'Per.', 'Behavior Category', 'Recorded By', 'Subject', 'Notes']],
    body: detailRows.length
      ? detailRows
      : [['-', '-', '-', 'No behavior incidents recorded in this date range', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.tableHeadBg,
      textColor: COLORS.royalNavy,
      lineColor: COLORS.tableHeadBorder,
      lineWidth: 0.35,
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      lineColor: COLORS.cardBorder,
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: COLORS.bodyText,
      cellPadding: 2.2,
    },
    alternateRowStyles: {
      fillColor: COLORS.zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 19 },
      2: { cellWidth: 16 },
      3: { cellWidth: 32, fontStyle: 'bold' },
      4: { cellWidth: 9, halign: 'center' },
      5: { cellWidth: 30 },
      6: { cellWidth: 26 },
      7: { cellWidth: 20 },
      8: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
  });

  drawFooter(doc, settings);

  const safeClass = classSection.display_name_en.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MEIS_Class_Behavior_${safeClass}_${fromDate}_to_${toDate}.pdf`);
}


