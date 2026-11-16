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

  // Top navy header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Emerald accent bar
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 34, pageWidth, 2, 'F');

  // School crest logo
  const logoData =
    (await loadImageAsDataUrl(MEIS_CREST_PATH)) ||
    (settings?.school_logo_url ? await loadImageAsDataUrl(settings.school_logo_url) : null);

  if (logoData) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 5, 24, 24, 3, 3, 'F');
    doc.addImage(logoData, 'JPEG', 13, 6, 22, 22);
  }

  const textX = logoData ? 42 : 14;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings?.school_name_en || 'Middle East International School', textX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('Riyadh, Kingdom of Saudi Arabia  |  Official Academic & Student Affairs Record', textX, 20.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(title.toUpperCase(), textX, 28);

  const todayStr = getRiyadhParts(new Date()).dateStr;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${todayStr} (Riyadh)`, pageWidth - 14, 14, { align: 'right' });
  doc.text(subtitle, pageWidth - 14, 20.5, { align: 'right' });

  return 44;
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

  // Student info card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(student.name_en || 'Student', 18, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`ID / Iqama: ${student.iqama_id}`, 18, y + 14.5);
  doc.text(`Class & Section: ${classSection?.display_name_en || '-'}`, 18, y + 20);
  doc.text(`Father Mobile: +${student.father_mobile || '-'}`, pageWidth - 18, y + 14.5, {
    align: 'right',
  });

  y += 30;

  // Summary statistics badges
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
    { label: 'TOTAL INCIDENTS', value: String(totalIncidents), bg: [239, 246, 255], fg: [29, 78, 216] },
    { label: 'SEVERITY POINTS', value: String(totalSeverity), bg: [254, 242, 242], fg: [185, 28, 28] },
    { label: 'MOST FREQUENT', value: topBehavior.slice(0, 26), bg: [236, 253, 245], fg: [4, 120, 87] },
  ];

  badges.forEach((b, idx) => {
    const bx = 14 + idx * (cardWidth + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.roundedRect(bx, y, cardWidth, 16, 2.5, 2.5, 'F');
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
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
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
    margin: { left: 14, right: 14 },
  });

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

  // Student summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(student.name_en || 'Student', 18, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`ID / Iqama: ${student.iqama_id}`, 18, y + 14.5);
  doc.text(`Grade & Section: ${classSection?.display_name_en || '-'}`, 18, y + 20);
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
    const teacherName = c.teacher_id ? profMap.get(c.teacher_id)?.name_en || 'Teacher' : 'Assigned Teacher';
    const commentBlock = c.is_submitted && c.comment_text
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
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: 3.5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
      cellPadding: 4,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', textColor: [15, 23, 42] },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  const safeName = (student.name_en || student.iqama_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MEIS_Performance_Report_${safeName}_${request.request_date}.pdf`);
}
