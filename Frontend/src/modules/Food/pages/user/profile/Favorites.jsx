import { confirmApp } from "@shared/lib/appDialog";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

import { Heart, Star, Clock, MapPin, ArrowRight, ArrowLeft, Bookmark } from "lucide-react";
import AnimatedPage from "@food/components/user/AnimatedPage";
import ScrollReveal from "@food/components/user/ScrollReveal";
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { useProfile } from "@food/context/ProfileContext";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import { restaurantAPI } from "@food/api";
import { toast } from "sonner";

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Favorites() {
  const { getFavorites, removeFavorite, getDishFavorites, removeDishFavorite } = useProfile();
  const restaurantFavorites = getFavorites();
  const dishFavorites = getDishFavorites();
  const [activeTab, setActiveTab] = useState("restaurants");

  const { location: userLocation } = useLocation();
  const { zoneId } = useZone(userLocation);
  const [liveRestaurants, setLiveRestaurants] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchLiveRestaurants = async () => {
      try {
        const params = { limit: 300, _ts: Date.now() };
        if (zoneId) {
          params.zoneId = zoneId;
        }
        const response = await restaurantAPI.getRestaurants(params, { noCache: true });
        const list = response?.data?.data?.restaurants || response?.data?.restaurants || [];
        if (!cancelled) {
          setLiveRestaurants(list);
        }
      } catch (error) {
        console.error("Error loading live restaurants in favorites:", error);
      }
    };
    fetchLiveRestaurants();
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  // Enrich static favorites with dynamic location-based timing and distance
  const enrichedRestaurants = restaurantFavorites.map(fav => {
    const live = liveRestaurants.find(r => 
      r.slug === fav.slug || 
      (r._id && String(r._id) === String(fav.id)) ||
      (r.restaurantId && String(r.restaurantId) === String(fav.id)) ||
      r.name?.toLowerCase().trim() === fav.name?.toLowerCase().trim()
    );
    if (live) {
      const cuisine = Array.isArray(live.cuisines) && live.cuisines.length > 0
        ? live.cuisines[0]
        : fav.cuisine || "Multi-cuisine";
      const deliveryTime = live.estimatedDeliveryTime || (live.estimatedDeliveryTimeMinutes ? `${live.estimatedDeliveryTimeMinutes} mins` : fav.deliveryTime || "25-30 mins");
      
      // Calculate dynamic location distance
      let distance = fav.distance || "1.2 km";
      const userLat = userLocation?.latitude;
      const userLng = userLocation?.longitude;
      const loc = live.location;
      const rLat = loc?.latitude || loc?.coordinates?.[1];
      const rLng = loc?.longitude || loc?.coordinates?.[0];
      
      if (userLat && userLng && rLat && rLng) {
        const distanceInKm = calcDistance(userLat, userLng, rLat, rLng);
        distance = distanceInKm >= 1 ? `${distanceInKm.toFixed(1)} km` : `${Math.round(distanceInKm * 1000)} m`;
      } else if (live.distance) {
        distance = typeof live.distance === 'number' ? `${live.distance.toFixed(1)} km` : live.distance;
      }

      return {
        ...fav,
        cuisine,
        rating: Number(live.rating || 0) || fav.rating || 4.5,
        deliveryTime,
        distance,
      };
    }
    return fav;
  });

  const handleRemoveFavorite = async (e, slug) => {
    e.preventDefault();
    e.stopPropagation();
    if (await confirmApp("Remove this restaurant from favorites?")) {
      removeFavorite(slug);
      toast.success("Restaurant removed from favorites");
    }
  };

  const handleRemoveDishFavorite = async (e, dishId, restaurantId) => {
    e.preventDefault();
    e.stopPropagation();
    if (await confirmApp("Remove this dish from favorites?")) {
      removeDishFavorite(dishId, restaurantId);
      toast.success("Dish removed from favorites");
    }
  };

  const totalFavorites = restaurantFavorites.length + dishFavorites.length;

  if (totalFavorites === 0) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <ScrollReveal>
            <div className="flex items-center gap-3 sm:gap-4">
              <Link to="/user/profile">
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold dark:text-white">My Favorites</h1>
            </div>
          </ScrollReveal>
          <Card className="dark:bg-zinc-900 border-none dark:border-zinc-800">
            <CardContent className="py-12 text-center">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg mb-4">You haven't added any favorites yet</p>
              <Link to="/user">
                <Button className="bg-gradient-to-r bg-primary-orange hover:opacity-90 text-white">
                  Explore Restaurants
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link to="/user/profile">
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10 dark:text-white dark:hover:bg-zinc-800">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold dark:text-white">My Favorites</h1>
                <p className="text-gray-700 dark:text-gray-300 mt-1 text-sm font-semibold">
                  {dishFavorites.length || 0} {dishFavorites.length === 1 ? "dish" : "dishes"} • {restaurantFavorites.length || 0} {restaurantFavorites.length === 1 ? "restaurant" : "restaurants"}
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab("restaurants")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "restaurants" ?
                "border-b-2 border-primary-orange text-primary-orange" :
                "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`
            }>
            Restaurants ({restaurantFavorites.length})
          </button>
          <button
            onClick={() => setActiveTab("dishes")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "dishes" ?
                "border-b-2 border-primary-orange text-primary-orange" :
                "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`
            }>
            Dishes ({dishFavorites.length})
          </button>
        </div>

        {/* Restaurants Tab */}
        {activeTab === "restaurants" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {restaurantFavorites.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-4">No restaurants saved yet</p>
                <Link to="/user">
                  <Button className="bg-gradient-to-r bg-primary-orange hover:opacity-90 text-white">
                    Explore Restaurants
                  </Button>
                </Link>
              </div>
            ) : (
              enrichedRestaurants.map((restaurant, index) => (
                <ScrollReveal key={restaurant.slug} delay={index * 0.1} className="h-full">
                  <Link to={`/user/restaurants/${restaurant.slug}`} className="block h-full">
                    <Card className="overflow-hidden h-full p-0 gap-0 border-none shadow-md bg-white dark:bg-[#18181b] border border-gray-100 dark:border-zinc-800/50 flex flex-col justify-between">
                      <div className="h-32 w-full relative overflow-hidden">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80`;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute top-2 right-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-red-500"
                            onClick={(e) => handleRemoveFavorite(e, restaurant.slug)}
                          >
                            <Heart className="h-4 w-4 fill-red-500" />
                          </Button>
                        </div>
                        <div className="absolute bottom-2 left-2">
                          <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className="font-bold text-xs text-gray-900">{restaurant.rating}</span>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4 pt-3 flex flex-col justify-between flex-1 gap-2.5">
                        <div className="flex-1 flex flex-col gap-1.5">
                          <CardTitle className="text-[16px] font-extrabold text-gray-900 dark:text-neutral-100 tracking-tight line-clamp-1">
                            {restaurant.name}
                          </CardTitle>
                          <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium line-clamp-1">
                            {restaurant.cuisine}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[13px] text-gray-600 dark:text-gray-400 font-medium pt-1 border-t border-gray-100 dark:border-zinc-800/40">
                          <div className="flex items-center gap-1 text-muted-foreground dark:text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium">{restaurant.deliveryTime}</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground dark:text-gray-400">
                            <MapPin className="h-3 w-3" />
                            <span className="font-medium">{restaurant.distance}</span>
                          </div>
                        </div>
                        <Button className="w-full mt-1 bg-green-600 hover:bg-green-700 text-white text-[13px] font-bold h-9 rounded-xl shadow-sm transition-all active:scale-[0.98]">
                          View Restaurant
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </CardContent>
                    </Card>
                  </Link>
                </ScrollReveal>
              ))
            )}
          </div>
        )}

        {/* Dishes Tab */}
        {activeTab === "dishes" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {dishFavorites.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Bookmark className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg mb-4">No dishes saved yet</p>
                <Link to="/user">
                  <Button className="bg-gradient-to-r bg-primary-orange hover:opacity-90 text-white">
                    Explore Dishes
                  </Button>
                </Link>
              </div>
            ) : (
              dishFavorites.map((dish, index) => {
                const restaurantSlug = dish.restaurantSlug || "";
                return (
                  <ScrollReveal key={`${dish.id}-${dish.restaurantId}`} delay={index * 0.1} className="h-full">
                    <Link to={`/food/user/restaurants/${restaurantSlug}?dish=${dish.id}`} className="block h-full">
                      <Card className="overflow-hidden h-full p-0 gap-0 border-none cursor-pointer shadow-md hover:shadow-xl transition-shadow bg-white dark:bg-[#18181b] border border-gray-100 dark:border-zinc-800/50 flex flex-col justify-between">
                        <div className="h-32 w-full relative overflow-hidden">
                          <img
                            src={dish.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80"}
                            alt={dish.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute top-2 right-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-red-500"
                              onClick={(e) => handleRemoveDishFavorite(e, dish.id, dish.restaurantId)}
                            >
                              <Bookmark className="h-4 w-4 fill-red-500" />
                            </Button>
                          </div>
                        </div>
                        <CardContent className="p-4 pt-3 flex flex-col justify-between flex-1 gap-2.5">
                          <div className="flex-1 flex flex-col gap-1.5">
                            <CardTitle className="text-[16px] font-extrabold text-gray-900 dark:text-neutral-100 tracking-tight line-clamp-1">
                              {dish.name}
                            </CardTitle>
                            <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium line-clamp-1">
                              {dish.restaurantName || "Restaurant"}
                            </p>
                          </div>
                          <div className="flex items-center justify-between text-[13px] text-gray-600 dark:text-gray-400 font-medium pt-1 border-t border-gray-100 dark:border-zinc-800/40">
                            <div className="flex items-center gap-1">
                              {dish.foodType === "Veg" ? (
                                <div className="w-3 h-3 border-2 border-green-600 flex items-center justify-center rounded-sm">
                                  <div className="w-1.5 h-1.5 bg-green-600 rounded-full"></div>
                                </div>
                              ) : (
                                <div className="w-3 h-3 border-2 border-orange-600 flex items-center justify-center rounded-sm">
                                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full"></div>
                                </div>
                              )}
                              <span className="text-muted-foreground dark:text-gray-400 font-medium text-xs">{dish.foodType || "N/A"}</span>
                            </div>
                            <div className="text-sm font-bold text-primary-orange">
                              {"\u20B9"}{Math.round(dish.price || 0)}
                            </div>
                          </div>
                          <Button className="w-full mt-1 bg-green-600 hover:bg-green-700 text-white text-[13px] font-bold h-9 rounded-xl shadow-sm transition-all active:scale-[0.98]">
                            View Dish
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </CardContent>
                      </Card>
                    </Link>
                  </ScrollReveal>
                );
              })
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}