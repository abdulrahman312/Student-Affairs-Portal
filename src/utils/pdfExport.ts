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
} from '../types/database';
import { getRiyadhParts } from './riyadhTime';

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
