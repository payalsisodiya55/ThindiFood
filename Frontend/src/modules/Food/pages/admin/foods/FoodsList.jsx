import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, Save, ChevronDown, ChevronLeft, ChevronRight, Upload, Download, FileSpreadsheet, AlertCircle } from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { getFoodDisplayPrice, getFoodVariants } from "@food/utils/foodVariants"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const createFoodForm = () => ({
  restaurantId: "",
  categoryId: "",
  categoryName: "",
  name: "",
  price: "",
  variants: [],
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
})

const createVariantDraft = (variant = {}) => ({
  id: String(variant?.id || variant?._id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  name: String(variant?.name || ""),
  price: variant?.price != null ? String(variant.price) : "",
})

const BULK_IMPORT_COLUMNS = [
  "restaurant_name",
  "restaurant_id",
  "category_name",
  "category_id",
  "food_name",
  "base_price",
  "variants",
  "food_type",
  "preparation_time",
  "is_available",
  "description",
  "image_url",
]

const BULK_IMPORT_DEMO_ROWS = [
  {
    restaurant_name: "Hotel Green Leaf",
    restaurant_id: "",
    category_name: "Biryani",
    category_id: "",
    food_name: "Chicken Dum Biryani",
    base_price: "249",
    variants: "",
    food_type: "Non-Veg",
    preparation_time: "25-35 mins",
    is_available: "TRUE",
    description: "Classic dum biryani with tender chicken and basmati rice",
    image_url: "https://example.com/foods/chicken-dum-biryani.jpg",
  },
  {
    restaurant_name: "Hotel Green Leaf",
    restaurant_id: "",
    category_name: "Starters",
    category_id: "",
    food_name: "Paneer 65",
    base_price: "",
    variants: "Half:159|Full:289",
    food_type: "Veg",
    preparation_time: "20-25 mins",
    is_available: "TRUE",
    description: "Crispy paneer starter with house masala",
    image_url: "https://example.com/foods/paneer-65.jpg",
  },
]

const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase()

const escapeCsvValue = (value) => {
  const text = String(value ?? "")
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const buildCsvContent = (rows = []) => {
  const header = BULK_IMPORT_COLUMNS.join(",")
  const body = rows.map((row) => BULK_IMPORT_COLUMNS.map((column) => escapeCsvValue(row?.[column] ?? "")).join(","))
  return [header, ...body].join("\n")
}

const triggerFileDownload = (filename, content, mimeType = "text/csv;charset=utf-8;") => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const parseCsvLine = (line = "") => {
  const values = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === "," && !inQuotes) {
      values.push(current)
      current = ""
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

const parseCsvContent = (content = "") => {
  const normalized = String(content || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    const nextCharacter = normalized[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === "\n" && !inQuotes) {
      lines.push(current)
      current = ""
      continue
    }

    current += character
  }

  if (current || lines.length === 0) {
    lines.push(current)
  }

  return lines.map((line) => parseCsvLine(line))
}

const parseBulkVariants = (value = "") =>
  String(value || "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf(":")
      if (separatorIndex === -1) {
        return { error: `Invalid variant "${entry}". Use Name:Price format.` }
      }

      const name = entry.slice(0, separatorIndex).trim()
      const price = Number(entry.slice(separatorIndex + 1).trim())

      if (!name) {
        return { error: `Variant "${entry}" is missing a name.` }
      }

      if (!Number.isFinite(price) || price <= 0) {
        return { error: `Variant "${entry}" must have a price greater than 0.` }
      }

      return { name, price }
    })

const parseAvailabilityValue = (value) => {
  const normalized = normalizeLookupValue(value)
  if (!normalized) return true
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return null
}

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [foods, setFoods] = useState([])
  const [restaurantsForFilter, setRestaurantsForFilter] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFoodFormModal, setShowFoodFormModal] = useState(false)
  const [foodFormMode, setFoodFormMode] = useState("add")
  const [foodForm, setFoodForm] = useState(createFoodForm())
  const [editingFood, setEditingFood] = useState(null)
  const [submittingFood, setSubmittingFood] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [imageVersion, setImageVersion] = useState(Date.now())
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [bulkImportFile, setBulkImportFile] = useState(null)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkImportSummary, setBulkImportSummary] = useState(null)
  const [bulkImportInputKey, setBulkImportInputKey] = useState(0)

  const getItemCreatedMs = (item = {}) => {
    const direct = [item.createdAt, item.addedAt, item.requestedAt, item.updatedAt]
      .map((v) => new Date(v).getTime())
      .find((ms) => Number.isFinite(ms) && ms > 0)
    if (direct) return direct

    const rawId = String(item.id || "")
    const match = rawId.match(/\d{10,}/)
    if (match) {
      const fromId = Number(match[0])
      if (Number.isFinite(fromId) && fromId > 0) return fromId
    }
    return 0
  }

  const toArray = (value) => (Array.isArray(value) ? value : [])
  const withImageVersion = (url) => {
    if (!url || typeof url !== "string") return "https://via.placeholder.com/40"
    return `${url}${url.includes("?") ? "&" : "?"}v=${imageVersion}`
  }

  const fetchAllFoods = useCallback(async () => {
    try {
      setLoading(true)

      const [activeRestaurantsResponse, inactiveRestaurantsResponse] = await Promise.all([
        adminAPI.getRestaurants({ limit: 1000 }),
        adminAPI.getRestaurants({ limit: 1000, status: "inactive" }),
      ])

      const activeRestaurants = activeRestaurantsResponse?.data?.data?.restaurants ||
        activeRestaurantsResponse?.data?.restaurants ||
        []
      const inactiveRestaurants = inactiveRestaurantsResponse?.data?.data?.restaurants ||
        inactiveRestaurantsResponse?.data?.restaurants ||
        []

      const restaurantsMap = new Map()
      ;[...activeRestaurants, ...inactiveRestaurants].forEach((restaurant) => {
        const restaurantId = String(restaurant?._id || restaurant?.id || "")
        if (!restaurantId) return
        if (!restaurantsMap.has(restaurantId)) {
          restaurantsMap.set(restaurantId, restaurant)
        }
      })
      const restaurants = Array.from(restaurantsMap.values())
      setRestaurantsForFilter(
        restaurants
          .map((restaurant) => ({
            id: String(restaurant?._id || restaurant?.id || ""),
            name: restaurant?.name || restaurant?.restaurantName || "Unknown Restaurant",
          }))
          .filter((restaurant) => restaurant.id)
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      if (restaurants.length === 0) {
        setFoods([])
        return
      }

      const foodsRes = await adminAPI.getFoods({ limit: 1000 })
      const list = foodsRes?.data?.data?.foods || []
      const approvedOnly = Array.isArray(list)
        ? list.filter((f) => String(f?.approvalStatus || "").toLowerCase() === "approved")
        : []
      setFoods(
        Array.isArray(approvedOnly)
          ? approvedOnly.map((f) => ({
              id: String(f.id || f._id || ""),
              _id: f._id || f.id,
              name: f.name || "Unnamed Item",
              image: f.image || "https://via.placeholder.com/40",
              status: f.isAvailable !== false && String(f.approvalStatus || "").toLowerCase() !== "rejected",
              restaurantId: String(f.restaurantId || ""),
              restaurantName: f.restaurantName || "Unknown Restaurant",
              categoryId: String(f.categoryId || ""),
              categoryName: f.categoryName || "",
              price: getFoodDisplayPrice(f),
              variants: getFoodVariants(f),
              foodType: f.foodType || "Non-Veg",
              approvalStatus: f.approvalStatus || "approved",
              description: f.description || "",
              preparationTime: f.preparationTime || "",
              isAvailable: f.isAvailable !== false,
              createdAt: f.createdAt,
              updatedAt: f.updatedAt,
            }))
          : []
      )
      setImageVersion(Date.now())
    } catch (error) {
      debugError("Error fetching foods:", error)
      toast.error("Failed to load foods")
      setFoods([])
      setRestaurantsForFilter([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCategoryOptions = useCallback(async () => {
    try {
      const res = await adminAPI.getCategories({ limit: 1000 })
      const list = res?.data?.data?.categories || []
      const options = Array.isArray(list)
        ? list
            .map((c) => ({ id: String(c.id || c._id || c.name), name: String(c.name || "").trim() }))
            .filter((c) => c.name)
        : []
      setCategoryOptions(options)
    } catch (error) {
      setCategoryOptions([])
    }
  }, [])

  useEffect(() => {
    fetchAllFoods()
  }, [fetchAllFoods])

  useEffect(() => {
    loadCategoryOptions()
  }, [loadCategoryOptions])

  const [searchParams] = useSearchParams()
  const productIdFromUrl = searchParams.get("productId")

  useEffect(() => {
    if (productIdFromUrl && foods.length > 0) {
      const food = foods.find(f => f.id === productIdFromUrl || f._id === productIdFromUrl)
      if (food) {
        handleViewDetails(food)
      }
    }
  }, [productIdFromUrl, foods])

  // Format ID to FOOD format (e.g., FOOD519399)
  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "1768285554154-0.703896654519399" or "item-1768285554154-0.703896654519399"
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    // Get the last part and extract digits
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      // Extract only digits from the last part
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        // Get last 6 digits from all digits found
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `FOOD${lastDigits}`
  }

  const filteredFoods = useMemo(() => {
    let result = [...foods]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(food =>
        food.name.toLowerCase().includes(query) ||
        food.id.toString().includes(query) ||
        food.restaurantName?.toLowerCase().includes(query) ||
        food.categoryName?.toLowerCase().includes(query)
      )
    }

    if (selectedRestaurant !== "all") {
      result = result.filter((food) => String(food.restaurantId) === selectedRestaurant)
    }

    result.sort((a, b) => getItemCreatedMs(b) - getItemCreatedMs(a))
    return result
  }, [foods, searchQuery, selectedRestaurant])

  const totalPages = useMemo(() => {
    if (filteredFoods.length === 0) return 1
    return Math.ceil(filteredFoods.length / pageSize)
  }, [filteredFoods.length, pageSize])

  const paginatedFoods = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredFoods.slice(start, start + pageSize)
  }, [filteredFoods, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedRestaurant, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const restaurantOptions = useMemo(() => {
    return restaurantsForFilter
  }, [restaurantsForFilter])

  const openAddFoodModal = () => {
    setFoodFormMode("add")
    setEditingFood(null)
    setFoodForm({
      ...createFoodForm(),
      restaurantId: selectedRestaurant !== "all" ? selectedRestaurant : "",
    })
    setSelectedImageFile(null)
    setImagePreviewUrl("")
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  const openEditFoodModal = (food) => {
    setFoodFormMode("edit")
    setEditingFood(food)
    setFoodForm({
      restaurantId: String(food.restaurantId || ""),
      categoryId: String(food.categoryId || ""),
      categoryName: String(food.categoryName || ""),
      name: String(food.name || ""),
      price: String(food.price || ""),
      variants: getFoodVariants(food).map(createVariantDraft),
      description: String(food.description || ""),
      image: String(food.image || ""),
      foodType: String(food.foodType || "Non-Veg"),
      isAvailable: food.isAvailable !== false,
      preparationTime: String(food.preparationTime || ""),
    })
    setSelectedImageFile(null)
    setImagePreviewUrl(String(food.image || ""))
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  useEffect(() => {
    if (!showFoodFormModal) {
      return
    }

    let cancelled = false

    const loadCategoryOptions = async () => {
      try {
        const res = await adminAPI.getCategories({ limit: 1000 })
        const list = res?.data?.data?.categories || []
        const options = Array.isArray(list)
          ? list
              .map((c) => ({ id: String(c.id || c._id || c.name), name: String(c.name || "").trim() }))
              .filter((c) => c.name)
          : []
        if (!cancelled) setCategoryOptions(options)
      } catch (error) {
        if (!cancelled) setCategoryOptions([])
      }
    }

    loadCategoryOptions()

    return () => {
      cancelled = true
    }
  }, [showFoodFormModal])

  const restaurantsById = useMemo(() => {
    const next = new Map()
    restaurantOptions.forEach((restaurant) => {
      const id = String(restaurant?.id || "").trim()
      if (id) next.set(id, restaurant)
    })
    return next
  }, [restaurantOptions])

  const restaurantsByName = useMemo(() => {
    const next = new Map()
    restaurantOptions.forEach((restaurant) => {
      const name = normalizeLookupValue(restaurant?.name)
      if (name && !next.has(name)) next.set(name, restaurant)
    })
    return next
  }, [restaurantOptions])

  const categoriesById = useMemo(() => {
    const next = new Map()
    categoryOptions.forEach((category) => {
      const id = String(category?.id || "").trim()
      if (id) next.set(id, category)
    })
    return next
  }, [categoryOptions])

  const categoriesByName = useMemo(() => {
    const next = new Map()
    categoryOptions.forEach((category) => {
      const name = normalizeLookupValue(category?.name)
      if (name && !next.has(name)) next.set(name, category)
    })
    return next
  }, [categoryOptions])

  const handleVariantChange = (variantId, field, value) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant,
      ),
    }))
  }

  const handleAddVariant = () => {
    setFoodForm((prev) => ({
      ...prev,
      variants: [...(Array.isArray(prev.variants) ? prev.variants : []), createVariantDraft()],
    }))
  }

  const handleRemoveVariant = (variantId) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).filter((variant) => variant.id !== variantId),
    }))
  }

  const handleFoodFormSubmit = async () => {
    if (!foodForm.restaurantId) {
      toast.error("Please select a restaurant")
      return
    }
    if (!String(foodForm.categoryName || "").trim()) {
      toast.error("Please select or enter a category")
      return
    }
    if (!foodForm.name.trim()) {
      toast.error("Food name is required")
      return
    }

    const normalizedVariants = (Array.isArray(foodForm.variants) ? foodForm.variants : [])
      .map((variant) => ({
        id: String(variant?.id || variant?._id || "").trim(),
        name: String(variant?.name || "").trim(),
        price: Number(variant?.price),
      }))
      .filter((variant) => variant.id || variant.name || variant.price)

    const hasVariants = normalizedVariants.length > 0
    const parsedPrice = Number(foodForm.price)

    if (normalizedVariants.some((variant) => !variant.name)) {
      toast.error("Each variant must have a name")
      return
    }

    if (normalizedVariants.some((variant) => !Number.isFinite(variant.price) || variant.price <= 0)) {
      toast.error("Each variant price must be greater than 0")
      return
    }

    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Base price must be greater than 0")
      return
    }

    try {
      setSubmittingFood(true)
      let imageUrl = foodForm.image.trim()

      if (selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "foods",
        })
        imageUrl =
          uploadResponse?.data?.data?.url ||
          uploadResponse?.data?.url ||
          imageUrl
      }

      const payload = {
        restaurantId: foodForm.restaurantId,
        categoryId: foodForm.categoryId || undefined,
        categoryName: String(foodForm.categoryName || "").trim(),
        name: foodForm.name.trim(),
        price: hasVariants ? undefined : parsedPrice,
        variants: normalizedVariants.map((variant) => ({
          ...(variant.id && !variant.id.startsWith("variant-") ? { _id: variant.id } : {}),
          name: variant.name,
          price: variant.price,
        })),
        description: foodForm.description.trim(),
        image: imageUrl,
        foodType: foodForm.foodType === "Veg" ? "Veg" : "Non-Veg",
        isAvailable: foodForm.isAvailable !== false,
        preparationTime: String(foodForm.preparationTime || "").trim(),
      }

      if (foodFormMode === "edit") {
        await adminAPI.updateFood(editingFood?._id || editingFood?.id, payload)
      } else {
        await adminAPI.createFood(payload)
      }
      toast.success(foodFormMode === "edit" ? "Food updated successfully" : "Food added successfully")
      setShowFoodFormModal(false)
      setEditingFood(null)
      setFoodForm(createFoodForm())
      setSelectedImageFile(null)
      setImagePreviewUrl("")
      await fetchAllFoods()
    } catch (error) {
      debugError("Error saving food:", error)
      toast.error(error?.response?.data?.message || "Failed to save food")
    } finally {
      setSubmittingFood(false)
    }
  }

  const handleDelete = async (id) => {
    const food = foods.find(f => f.id === id)
    if (!food) return

    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      await adminAPI.deleteFood(food?._id || food?.id)
      setFoods((prev) => prev.filter((f) => String(f.id) !== String(id)))
      toast.success("Food item deleted successfully")
    } catch (error) {
      debugError("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  const resetBulkImportState = () => {
    setBulkImportFile(null)
    setBulkImportSummary(null)
    setBulkImportInputKey((prev) => prev + 1)
  }

  const handleDownloadBulkFormat = () => {
    triggerFileDownload("foods-bulk-import-format.csv", buildCsvContent([]))
  }

  const handleDownloadBulkDemo = () => {
    triggerFileDownload("foods-bulk-import-demo.csv", buildCsvContent(BULK_IMPORT_DEMO_ROWS))
  }

  const handleBulkImport = async () => {
    if (!bulkImportFile) {
      toast.error("Please choose a CSV file to import")
      return
    }

    try {
      setBulkImporting(true)
      setBulkImportSummary(null)

      const text = await bulkImportFile.text()
      const rows = parseCsvContent(text).filter((row) => row.some((cell) => String(cell || "").trim()))

      if (rows.length < 2) {
        toast.error("The file is empty. Download the format and fill at least one row.")
        return
      }

      const headers = rows[0].map((header) => String(header || "").trim())
      const missingColumns = BULK_IMPORT_COLUMNS.filter((column) => !headers.includes(column))
      if (missingColumns.length > 0) {
        toast.error(`Missing required columns: ${missingColumns.join(", ")}`)
        return
      }

      const dataRows = rows.slice(1)
      const importQueue = []
      const validationErrors = []

      dataRows.forEach((cells, rowIndex) => {
        const rowNumber = rowIndex + 2
        const rowErrors = []
        const row = headers.reduce((accumulator, header, headerIndex) => {
          accumulator[header] = String(cells[headerIndex] || "").trim()
          return accumulator
        }, {})

        const restaurantId = row.restaurant_id
        const restaurantName = row.restaurant_name
        const categoryId = row.category_id
        const categoryName = row.category_name
        const foodName = row.food_name
        const basePrice = Number(row.base_price)
        const rawVariants = parseBulkVariants(row.variants)
        const variantErrors = rawVariants.filter((entry) => entry?.error)
        const variants = rawVariants.filter((entry) => !entry?.error)
        const hasVariants = variants.length > 0
        const availability = parseAvailabilityValue(row.is_available)
        const restaurant = restaurantId
          ? restaurantsById.get(restaurantId)
          : restaurantsByName.get(normalizeLookupValue(restaurantName))
        const category = categoryId
          ? categoriesById.get(categoryId)
          : categoriesByName.get(normalizeLookupValue(categoryName))

        if (!restaurant) {
          rowErrors.push(`Row ${rowNumber}: restaurant not found. Use a valid restaurant_id or exact restaurant_name.`)
        }

        if (categoryId && !category) {
          rowErrors.push(`Row ${rowNumber}: category_id "${categoryId}" was not found.`)
        }

        if (!categoryName) {
          rowErrors.push(`Row ${rowNumber}: category_name is required.`)
        }

        if (!foodName) {
          rowErrors.push(`Row ${rowNumber}: food_name is required.`)
        }

        if (variantErrors.length > 0) {
          variantErrors.forEach((entry) => {
            rowErrors.push(`Row ${rowNumber}: ${entry.error}`)
          })
        }

        if (!hasVariants && (!Number.isFinite(basePrice) || basePrice <= 0)) {
          rowErrors.push(`Row ${rowNumber}: base_price must be greater than 0 when variants are empty.`)
        }

        if (availability === null) {
          rowErrors.push(`Row ${rowNumber}: is_available must be TRUE/FALSE, YES/NO, or 1/0.`)
        }

        if (row.food_type && !["veg", "non-veg", "non veg"].includes(normalizeLookupValue(row.food_type))) {
          rowErrors.push(`Row ${rowNumber}: food_type must be Veg or Non-Veg.`)
        }

        if (rowErrors.length > 0) {
          validationErrors.push(...rowErrors)
          return
        }

        importQueue.push({
          rowNumber,
          payload: {
            restaurantId: restaurant.id,
            categoryId: category?.id || undefined,
            categoryName: category?.name || categoryName,
            name: foodName,
            price: hasVariants ? undefined : basePrice,
            variants,
            description: row.description,
            image: row.image_url,
            foodType: normalizeLookupValue(row.food_type) === "veg" ? "Veg" : "Non-Veg",
            isAvailable: availability !== false,
            preparationTime: row.preparation_time,
          },
        })
      })

      if (validationErrors.length > 0) {
        setBulkImportSummary({
          totalRows: dataRows.length,
          successCount: 0,
          failureCount: validationErrors.length,
          errors: validationErrors,
        })
        toast.error("Please fix the import file errors and try again")
        return
      }

      let successCount = 0
      const importErrors = []

      for (const entry of importQueue) {
        try {
          await adminAPI.createFood(entry.payload)
          successCount += 1
        } catch (error) {
          importErrors.push(`Row ${entry.rowNumber}: ${error?.response?.data?.message || "Failed to create food"}`)
        }
      }

      setBulkImportSummary({
        totalRows: dataRows.length,
        successCount,
        failureCount: importErrors.length,
        errors: importErrors,
      })

      if (successCount > 0) {
        toast.success(`${successCount} food item${successCount > 1 ? "s" : ""} imported successfully`)
        await fetchAllFoods()
      }

      if (importErrors.length === 0) {
        setBulkImportFile(null)
        setBulkImportInputKey((prev) => prev + 1)
      } else {
        toast.error("Some rows could not be imported")
      }
    } catch (error) {
      debugError("Error importing foods:", error)
      toast.error("Failed to read the import file")
    } finally {
      setBulkImporting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredFoods.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowBulkImportModal(true)}
              className="px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Bulk Import</span>
            </button>
            <button
              type="button"
              onClick={openAddFoodModal}
              className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="px-4 py-2.5 min-w-[220px] text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Restaurants</option>
              {restaurantOptions.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Restaurant
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading foods...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No food items match your search or restaurant filter</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedFoods.map((food, index) => (
                  <tr
                    key={food.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * pageSize + index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={withImageVersion(food.image)}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          key={`${food.id}-${imageVersion}`}
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/40"
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{food.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.restaurantName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.categoryName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(food)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditFoodModal(food)}
                          className="p-1.5 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(food.id)}
                          disabled={deleting}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredFoods.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-600">
              Showing{" "}
              <span className="font-semibold text-slate-800">{(currentPage - 1) * pageSize + 1}</span>
              {" "}to{" "}
              <span className="font-semibold text-slate-800">
                {Math.min(currentPage * pageSize, filteredFoods.length)}
              </span>
              {" "}of{" "}
              <span className="font-semibold text-slate-800">{filteredFoods.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>

              <span className="px-3 py-1.5 text-sm font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Food Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img
                          src={withImageVersion(selectedFood.image)}
                          alt={selectedFood.name}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/64"
                  }}
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatFoodId(selectedFood.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedFood.restaurantName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">{selectedFood.variants?.length ? `Starting from \u20B9${selectedFood.price}` : `\u20B9${selectedFood.price}`}</span></p>
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.categoryName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Approval:</span> <span className="text-slate-900 capitalize">{selectedFood.approvalStatus || "-"}</span></p>
              </div>
              {selectedFood.variants?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Variants</p>
                  <div className="space-y-2">
                    {selectedFood.variants.map((variant) => (
                      <div key={variant.id || variant._id} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{variant.name}</span>
                        <span className="font-semibold text-slate-900">{"\u20B9"}{variant.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedFood.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-800">Description:</span> {selectedFood.description}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showFoodFormModal}
        onOpenChange={(open) => {
          setShowFoodFormModal(open)
          if (!open) {
            setEditingFood(null)
            setFoodForm(createFoodForm())
            setCategorySearch("")
            setCategoryPopoverOpen(false)
            setSelectedImageFile(null)
            setImagePreviewUrl("")
          }
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {foodFormMode === "edit" ? "Edit Food" : "Add Food"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Restaurant</label>
                <select
                  value={foodForm.restaurantId}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, restaurantId: e.target.value, categoryId: "", categoryName: "" }))}
                  disabled={foodFormMode === "edit"}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
                >
                  <option value="">Select restaurant</option>
                  {restaurantOptions.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-left flex items-center justify-between"
                    >
                      <span className={foodForm.categoryName ? "text-slate-900" : "text-slate-400"}>
                        {foodForm.categoryName || "Select category"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white mb-2"
                      placeholder="Search category..."
                      autoFocus
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {categoryOptions
                        .filter((c) => {
                          const q = String(categorySearch || "").trim().toLowerCase()
                          if (!q) return true
                          return String(c.name || "").toLowerCase().includes(q)
                        })
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFoodForm((prev) => ({ ...prev, categoryId: c.id, categoryName: c.name }))
                              setCategoryPopoverOpen(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-slate-100 ${
                              String(foodForm.categoryName || "") === String(c.name) ? "bg-slate-100 font-medium" : ""
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      {categoryOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No categories found</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Name</label>
                <input
                  type="text"
                  value={foodForm.name}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={foodForm.price}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, price: e.target.value }))}
                  disabled={(foodForm.variants || []).length > 0}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
                {(foodForm.variants || []).length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Variants are active, so customers will see the lowest variant price as the starting price.</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Type</label>
                <select
                  value={foodForm.foodType}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, foodType: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setSelectedImageFile(file)
                    if (file) {
                      setImagePreviewUrl(URL.createObjectURL(file))
                    } else {
                      setImagePreviewUrl(foodForm.image.trim())
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timing</label>
                <div className="relative">
                  <select
                  value={foodForm.preparationTime}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, preparationTime: e.target.value }))}
                    className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm bg-white appearance-none"
                  >
                    <option value="">Select timing</option>
                    <option value="10-20 mins">10-20 mins</option>
                    <option value="20-25 mins">20-25 mins</option>
                    <option value="25-35 mins">25-35 mins</option>
                    <option value="35-45 mins">35-45 mins</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
              {imagePreviewUrl ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Image Preview</label>
                  <div className="w-28 h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={imagePreviewUrl}
                      alt="Food preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-6 pt-7">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={foodForm.isAvailable}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                  />
                  Available
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={4}
                value={foodForm.description}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white resize-none"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Variants</p>
                  <p className="text-xs text-slate-500">Optional. Add multiple names and prices such as Half, Full, Small, or Large.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add variant
                </button>
              </div>
              {(foodForm.variants || []).length ? (
                <div className="space-y-3">
                  {(foodForm.variants || []).map((variant, index) => (
                    <div key={variant.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Variant name</label>
                          <input
                            type="text"
                            value={variant.name}
                            onChange={(e) => handleVariantChange(variant.id, "name", e.target.value)}
                            placeholder={index === 0 ? "Full" : "Half"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Variant price</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.price}
                            onChange={(e) => handleVariantChange(variant.id, "price", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(variant.id)}
                        className="self-start rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                        aria-label="Remove variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No variants added. This food will use the single base price.</p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFoodFormSubmit}
                disabled={submittingFood}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {submittingFood ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{submittingFood ? "Saving..." : foodFormMode === "edit" ? "Update Food" : "Add Food"}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBulkImportModal}
        onOpenChange={(open) => {
          setShowBulkImportModal(open)
          if (!open) {
            resetBulkImportState()
          }
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Bulk Import Foods</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-6 space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Excel-friendly template</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Download the CSV template, open it in Excel, fill your rows, then upload it here.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadBulkFormat}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="w-4 h-4" />
                    Download format
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadBulkDemo}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Download demo
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div className="space-y-2 text-sm text-amber-900">
                    <p className="font-semibold">Sheet rules</p>
                    <p>`variants` format: `Half:149|Full:259`</p>
                    <p>Use either `restaurant_id` or exact `restaurant_name`.</p>
                    <p>`base_price` is required only when `variants` is empty.</p>
                    <p>`image_url` should be a ready-to-use image link. File upload is not supported in bulk import.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-900">Supported columns</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {BULK_IMPORT_COLUMNS.map((column) => (
                  <span
                    key={column}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {column}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Upload filled sheet</label>
                <input
                  key={bulkImportInputKey}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setBulkImportFile(event.target.files?.[0] || null)
                    setBulkImportSummary(null)
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Use the downloaded CSV in Excel, then save and upload it back here.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={resetBulkImportState}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={bulkImporting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {bulkImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{bulkImporting ? "Importing..." : "Start Import"}</span>
                </button>
              </div>
            </div>

            {bulkImportSummary ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                    Total rows: {bulkImportSummary.totalRows}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                    Success: {bulkImportSummary.successCount}
                  </span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700">
                    Failed: {bulkImportSummary.failureCount}
                  </span>
                </div>

                {bulkImportSummary.errors?.length ? (
                  <div className="rounded-xl border border-rose-200 bg-white p-4">
                    <p className="text-sm font-semibold text-rose-700">Import errors</p>
                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto text-sm text-slate-700">
                      {bulkImportSummary.errors.map((error, index) => (
                        <p key={`${error}-${index}`}>{error}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700">All rows were imported successfully.</p>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

