// Export utility functions for reports
import { downloadPDF } from "@food/utils/pdfExportHelper"

export const exportReportsToCSV = (data, headers, filename = "report") => {
  const rows = data.map((item, index) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : value
    })
  })
  
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label).join(",")
  const csvContent = [
    headerRow,
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n")
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToExcel = (data, headers, filename = "report") => {
  const headerLabels = headers.map(h => typeof h === 'string' ? h : h.label)
  const rows = data.map((item) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    })
  })
  
  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              ${headerLabels.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `
  
  const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToPDF = (data, headers, filename = "report", title = "Report", orientation = "portrait") => {
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label)
  const bodyRows = data.map(item => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    })
  })
  
  downloadPDF(title, headerRow, bodyRows, filename, orientation)
}

export const exportReportsToJSON = (data, filename = "report") => {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Specific export functions for Transaction Report
const getTransactionDiscountBreakdown = (transaction = {}) => {
  const platformCouponDiscount = Number(transaction.platformCouponDiscount ?? transaction.pricing?.platformCouponDiscount ?? 0)
  const restaurantCouponDiscount = Number(transaction.restaurantCouponDiscount ?? transaction.pricing?.restaurantCouponDiscount ?? 0)
  const restaurantOfferDiscount = Number(
    transaction.restaurantOfferDiscount ??
    transaction.restaurantDiscount ??
    transaction.pricing?.restaurantOfferDiscount ??
    transaction.pricing?.restaurantDiscount ??
    0
  )
  const totalDiscount = Number(
    transaction.couponDiscount ??
    transaction.pricing?.couponDiscount ??
    transaction.pricing?.discount ??
    (platformCouponDiscount + restaurantCouponDiscount + restaurantOfferDiscount)
  )

  return {
    platformCouponDiscount,
    restaurantCouponDiscount,
    restaurantOfferDiscount,
    totalDiscount,
  }
}

export const exportTransactionReportToCSV = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Total Discount", "Platform Coupon", "Restaurant Coupon", "Restaurant Offer", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => {
    const discountBreakdown = getTransactionDiscountBreakdown(transaction)
    return [
      index + 1,
      transaction.orderId,
      transaction.restaurant,
      transaction.customerName,
      transaction.totalItemAmount.toFixed(2),
      discountBreakdown.totalDiscount.toFixed(2),
      discountBreakdown.platformCouponDiscount.toFixed(2),
      discountBreakdown.restaurantCouponDiscount.toFixed(2),
      discountBreakdown.restaurantOfferDiscount.toFixed(2),
      transaction.vatTax.toFixed(2),
      transaction.deliveryCharge.toFixed(2),
      Number(transaction.platformFee || 0).toFixed(2),
      transaction.orderAmount.toFixed(2),
    ]
  })
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n")
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToExcel = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Total Discount", "Platform Coupon", "Restaurant Coupon", "Restaurant Offer", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => {
    const discountBreakdown = getTransactionDiscountBreakdown(transaction)
    return [
      index + 1,
      transaction.orderId,
      transaction.restaurant,
      transaction.customerName,
      `₹${transaction.totalItemAmount.toFixed(2)}`,
      `₹${discountBreakdown.totalDiscount.toFixed(2)}`,
      `₹${discountBreakdown.platformCouponDiscount.toFixed(2)}`,
      `₹${discountBreakdown.restaurantCouponDiscount.toFixed(2)}`,
      `₹${discountBreakdown.restaurantOfferDiscount.toFixed(2)}`,
      `₹${transaction.vatTax.toFixed(2)}`,
      `₹${transaction.deliveryCharge.toFixed(2)}`,
      `₹${Number(transaction.platformFee || 0).toFixed(2)}`,
      `₹${transaction.orderAmount.toFixed(2)}`,
    ]
  })
  
  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `
  
  const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToPDF = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Total Discount", "Platform Coupon", "Restaurant Coupon", "Restaurant Offer", "VAT/Tax", "Platform Fee", "Order Amount"]
  
  const bodyRows = transactions.map((transaction, index) => {
    const discountBreakdown = getTransactionDiscountBreakdown(transaction)
    return [
      index + 1,
      transaction.orderId,
      transaction.restaurant,
      transaction.customerName,
      `Rs. ${transaction.totalItemAmount.toFixed(2)}`,
      `Rs. ${discountBreakdown.totalDiscount.toFixed(2)}`,
      `Rs. ${discountBreakdown.platformCouponDiscount.toFixed(2)}`,
      `Rs. ${discountBreakdown.restaurantCouponDiscount.toFixed(2)}`,
      `Rs. ${discountBreakdown.restaurantOfferDiscount.toFixed(2)}`,
      `Rs. ${transaction.vatTax.toFixed(2)}`,
      `Rs. ${Number(transaction.platformFee || 0).toFixed(2)}`,
      `Rs. ${transaction.orderAmount.toFixed(2)}`,
    ]
  })
  
  downloadPDF("Transaction Report", headers, bodyRows, filename, "landscape")
}

export const exportTransactionReportToJSON = (transactions, filename = "transaction_report") => {
  const jsonContent = JSON.stringify(transactions, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
