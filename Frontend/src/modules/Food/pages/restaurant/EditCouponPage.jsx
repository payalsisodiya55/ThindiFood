import { useParams, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import AddCouponPage from "./AddCouponPage"

export default function EditCouponPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) {
      navigate("/restaurant/coupons", { replace: true })
    }
  }, [id, navigate])

  if (!id) return null

  return <AddCouponPage mode="edit" couponId={id} />
}
