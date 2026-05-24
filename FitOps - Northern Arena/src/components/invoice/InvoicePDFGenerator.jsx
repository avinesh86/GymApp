import jsPDF from "jspdf";
import moment from "moment";

export function generateInvoicePDF(invoice, staffProfile, options = {}) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  const primary = [67, 56, 202]; // indigo
  const dark = [15, 23, 42];
  const gray = [100, 116, 139];
  const lightGray = [241, 245, 249];

  // ── Header bar ──
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 36, "F");

  // Logo placeholder or business name
  const bizName = staffProfile?.business_name || staffProfile?.name || "Instructor";
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(bizName, margin, 23);

  // INVOICE label
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("INVOICE", pageW - margin, 23, { align: "right" });

  y = 50;

  // Invoice meta
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text("Invoice Number:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number || `INV-${invoice.id?.slice(-6).toUpperCase()}`, margin + 40, y);

  doc.setFont("helvetica", "bold");
  doc.text("Date Issued:", pageW - margin - 70, y);
  doc.setFont("helvetica", "normal");
  doc.text(moment(invoice.created_date || new Date()).format("DD MMM YYYY"), pageW - margin - 30, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Period:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${moment(invoice.period_start).format("DD MMM YYYY")} – ${moment(invoice.period_end).format("DD MMM YYYY")}`,
    margin + 40, y
  );

  // Status badge area
  doc.setFont("helvetica", "bold");
  doc.text("Status:", pageW - margin - 70, y);
  doc.setFont("helvetica", "normal");
  doc.text((invoice.status || "draft").toUpperCase(), pageW - margin - 30, y);

  y += 16;

  // ── From / To columns ──
  const colW = (pageW - margin * 2 - 10) / 2;

  doc.setFillColor(...lightGray);
  doc.roundedRect(margin, y, colW, 50, 2, 2, "F");
  doc.roundedRect(margin + colW + 10, y, colW, 50, 2, 2, "F");

  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.setFont("helvetica", "bold");
  doc.text("FROM", margin + 6, y + 9);
  doc.text("TO", margin + colW + 16, y + 9);

  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.text(bizName, margin + 6, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (staffProfile?.email) doc.text(staffProfile.email, margin + 6, y + 26);
  if (staffProfile?.phone) doc.text(staffProfile.phone, margin + 6, y + 33);

  // Payment info
  const pi = staffProfile?.payment_info;
  if (pi) {
    let piY = y + 18;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Payment Details", margin + colW + 16, piY);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    if (pi.bank_name)     { piY += 8; doc.text(`Bank: ${pi.bank_name}`, margin + colW + 16, piY); }
    if (pi.account_name)  { piY += 6; doc.text(`Account: ${pi.account_name}`, margin + colW + 16, piY); }
    if (pi.account_number){ piY += 6; doc.text(`Acc #: ${pi.account_number}`, margin + colW + 16, piY); }
    if (pi.sort_code)     { piY += 6; doc.text(`Sort: ${pi.sort_code}`, margin + colW + 16, piY); }
    if (pi.payment_reference) { piY += 6; doc.text(`Ref: ${pi.payment_reference}`, margin + colW + 16, piY); }
  }

  y += 58;

  // ── Line Items Table ──
  const headers = ["Date", "Class", "Location", "Att.", "Rate", "Bonus", "Amount"];
  const colWidths = [22, 52, 32, 12, 18, 16, 22];
  const rowH = 9;

  // Table header
  doc.setFillColor(...primary);
  doc.rect(margin, y, pageW - margin * 2, rowH, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);

  let x = margin + 3;
  headers.forEach((h, i) => {
    const align = i >= 3 ? "right" : "left";
    if (align === "right") {
      doc.text(h, x + colWidths[i] - 3, y + 6, { align: "right" });
    } else {
      doc.text(h, x, y + 6);
    }
    x += colWidths[i];
  });

  y += rowH;

  // Rows
  doc.setFont("helvetica", "normal");
  (invoice.line_items || []).forEach((item, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...lightGray);
      doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    }
    doc.setTextColor(...dark);
    x = margin + 3;
    const cells = [
      item.date || "",
      item.class_type_name + (item.is_cover ? " ★" : ""),
      item.location || "",
      String(item.attendance_count ?? "-"),
      `£${(item.rate || 0).toFixed(2)}`,
      item.bonus_amount > 0 ? `£${item.bonus_amount.toFixed(2)}` : "-",
      `£${(item.amount || 0).toFixed(2)}`
    ];
    cells.forEach((cell, i) => {
      const align = i >= 3 ? "right" : "left";
      if (align === "right") {
        doc.text(cell, x + colWidths[i] - 3, y + 6, { align: "right" });
      } else {
        // Truncate long text
        const maxW = colWidths[i] - 4;
        const truncated = doc.splitTextToSize(cell, maxW)[0];
        doc.text(truncated, x, y + 6);
      }
      x += colWidths[i];
    });
    y += rowH;
    // New page if needed
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
  });

  // ── Total ──
  y += 6;
  doc.setFillColor(...primary);
  doc.roundedRect(pageW - margin - 70, y, 70, 16, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", pageW - margin - 62, y + 10);
  doc.text(`£${(invoice.total_amount || 0).toFixed(2)}`, pageW - margin - 4, y + 10, { align: "right" });

  // ── Approval history ──
  y += 26;
  if (invoice.manager_approved_at || invoice.payroll_approved_at || invoice.paid_at) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dark);
    doc.text("Approval History", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    if (invoice.manager_approved_at) {
      doc.text(
        `✓ Manager approved by ${invoice.manager_approver_name} on ${moment(invoice.manager_approved_at).format("DD MMM YYYY")}`,
        margin, y
      );
      y += 6;
    }
    if (invoice.payroll_approved_at) {
      doc.text(
        `✓ Payroll approved by ${invoice.payroll_approver_name} on ${moment(invoice.payroll_approved_at).format("DD MMM YYYY")}`,
        margin, y
      );
      y += 6;
    }
    if (invoice.paid_at) {
      doc.text(
        `✓ Paid on ${moment(invoice.paid_at).format("DD MMM YYYY")}${invoice.payment_reference ? ` — Ref: ${invoice.payment_reference}` : ""}`,
        margin, y
      );
      y += 6;
    }
  }

  // ── Notes ──
  if (invoice.notes) {
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dark);
    doc.text("Notes:", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    const noteLines = doc.splitTextToSize(invoice.notes, pageW - margin * 2);
    doc.text(noteLines, margin, y);
  }

  // ── Footer ──
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text("Generated by FitOps", pageW / 2, 290, { align: "center" });

  const filename = `${(invoice.invoice_number || "invoice").replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;

  if (options.print) {
    // Open in new tab so user can print
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        setTimeout(() => { win.print(); }, 500);
      };
    }
  } else {
    doc.save(filename);
  }
}