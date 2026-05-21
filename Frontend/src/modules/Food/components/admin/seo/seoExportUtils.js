// Export utility functions for SEO pages
import { downloadPDF } from "@food/utils/pdfExportHelper"

export const exportSEOPagesToCSV = (pages, filename = "seo_pages") => {
  const headers = ["SI", "Page Name"]
  const rows = pages.map((page, index) => [
    index + 1,
    page.name
  ])
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportSEOPagesToExcel = (pages, filename = "seo_pages") => {
  const headers = ["SI", "Page Name"]
  const rows = pages.map((page, index) => [
    index + 1,
    page.name
  ])
  
  const csvContent = [
    headers.join("\t"),
    ...rows.map(row => row.join("\t"))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "application/vnd.ms-excel" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportSEOPagesToPDF = (pages, filename = "seo_pages") => {
  const headers = ["SI", "Page Name"]
  const bodyRows = pages.map((page, index) => [
    index + 1,
    page.name
  ])
  
  downloadPDF("SEO Pages Report", headers, bodyRows, filename)
}

export const exportSEOPagesToJSON = (pages, filename = "seo_pages") => {
  const jsonContent = JSON.stringify(pages, null, 2)
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

