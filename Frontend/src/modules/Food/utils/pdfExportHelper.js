import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// ============================================================================
// Universal patch for Rupee symbol character (₹) in jsPDF standard fonts.
// Standard Helvetica/Times fonts do not contain the ₹ glyph, causing it to
// render as garbage/superscripts (like ¹). This globally replaces ₹ with 'Rs. '.
// ============================================================================
if (jsPDF && jsPDF.prototype && !jsPDF.prototype._hasRupeePatch) {
  const originalText = jsPDF.prototype.text
  jsPDF.prototype.text = function (text, x, y, options) {
    let sanitizedText = text
    if (typeof text === 'string') {
      sanitizedText = text.replace(/₹/g, 'Rs. ')
    } else if (Array.isArray(text)) {
      sanitizedText = text.map(t => typeof t === 'string' ? t.replace(/₹/g, 'Rs. ') : t)
    }
    return originalText.call(this, sanitizedText, x, y, options)
  }
  jsPDF.prototype._hasRupeePatch = true
}

/**
 * Helper to sanitize currency symbols like Rupee (₹) to 'Rs. ' to avoid encoding issues in standard jsPDF fonts.
 */
const sanitizeCurrency = (val) => {
  if (val === null || val === undefined) return ""
  const str = String(val)
  return str.replace(/₹/g, "Rs. ")
}

/**
 * Shared utility to generate and download a beautifully styled PDF report.
 * Uses jsPDF and jspdf-autotable to download the file directly, avoiding print dialogs.
 * 
 * @param {string} title The title displayed on the PDF header.
 * @param {string[]} headers An array of column header labels.
 * @param {Array<Array<any>>} bodyRows The tabular data rows.
 * @param {string} filename The downloaded file prefix.
 * @param {string} orientation "portrait" or "landscape".
 */
export const downloadPDF = (title, headers, bodyRows, filename = "report", orientation = "portrait") => {
  const doc = new jsPDF({
    orientation: orientation === "landscape" ? "l" : "p",
    unit: "mm",
    format: "a4"
  })
  
  // Title styling
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(sanitizeCurrency(title), 14, 15)
  
  // Date subtitle
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22)
  
  // Sanitize headers and table data rows
  const sanitizedHeaders = (headers || []).map(h => sanitizeCurrency(h))
  const sanitizedBodyRows = (bodyRows || []).map(row => {
    if (Array.isArray(row)) {
      return row.map(cell => sanitizeCurrency(cell))
    }
    return sanitizeCurrency(row)
  })

  // Generate Table
  autoTable(doc, {
    startY: 26,
    head: [sanitizedHeaders],
    body: sanitizedBodyRows,
    theme: 'striped',
    headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' }, // Brand red color matching ThindiFood theme
    styles: { fontSize: orientation === "landscape" ? 7 : 8, cellPadding: 3 },
  })
  
  const finalFilename = `${filename}_${new Date().toISOString().split("T")[0]}.pdf`
  doc.save(finalFilename)
}
