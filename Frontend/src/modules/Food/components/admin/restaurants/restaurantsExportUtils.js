// Export utility functions for restaurants
import { downloadPDF } from "@food/utils/pdfExportHelper"

const formatRestaurantId = (id) => {
  if (!id || id === "N/A") return "N/A"

  const idString = String(id)
  
  // If it's already in the format "RESTxxxxx", extract the xxxxx part
  const restMatch = idString.match(/^#?REST(\d+)$/i)
  if (restMatch) {
    return `REST${restMatch[1]}`
  }

  // Generate a deterministic 5-digit sequence number starting from 10000 using a stable hash
  let hash = 0
  for (let i = 0; i < idString.length; i++) {
    hash = (hash << 5) - hash + idString.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  
  const offset = Math.abs(hash) % 90000 // 0 to 89999
  const sequentialNum = 10000 + offset
  
  return `REST${sequentialNum}`
}

export const exportRestaurantsToExcel = (restaurants, filename = "restaurants") => {
  const headers = [
    "SI",
    "Restaurant ID",
    "Restaurant Name",
    "Owner Name",
    "Owner Phone",
    "Zone",
    "Cuisine",
    "Status",
    "Rating"
  ]
  
  const rows = restaurants.map((restaurant, index) => [
    index + 1,
    formatRestaurantId(restaurant.originalData?.restaurantId || restaurant.originalData?._id || restaurant._id || restaurant.id),
    restaurant.name || "N/A",
    restaurant.ownerName || "N/A",
    restaurant.ownerPhone || "N/A",
    restaurant.zone || "N/A",
    restaurant.cuisine || "N/A",
    restaurant.status ? "Active" : "Inactive",
    restaurant.rating || 0
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

export const exportRestaurantsToPDF = (restaurants, filename = "restaurants") => {
  const headers = [
    "SI",
    "Restaurant ID",
    "Restaurant Name",
    "Owner Name",
    "Owner Phone",
    "Zone",
    "Cuisine",
    "Status",
    "Rating"
  ]
  
  const bodyRows = restaurants.map((restaurant, index) => [
    index + 1,
    formatRestaurantId(restaurant.originalData?.restaurantId || restaurant.originalData?._id || restaurant._id || restaurant.id),
    restaurant.name || "N/A",
    restaurant.ownerName || "N/A",
    restaurant.ownerPhone || "N/A",
    restaurant.zone || "N/A",
    restaurant.cuisine || "N/A",
    restaurant.status ? "Active" : "Inactive",
    restaurant.rating || 0
  ])
  
  downloadPDF("Restaurants List", headers, bodyRows, filename)
}
