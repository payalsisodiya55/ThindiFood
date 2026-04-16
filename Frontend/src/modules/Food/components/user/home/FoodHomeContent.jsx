import { memo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownUp,
  BadgePercent,
  Bookmark,
  Clock,
  Flame,
  MapPin,
  SlidersHorizontal,
  Star,
  Timer,
} from "lucide-react";
import PromoRow from "@food/components/user/home/PromoRow";
import OptimizedImage from "@food/components/OptimizedImage";
import { Button } from "@food/components/ui/button";
import { Card, CardContent } from "@food/components/ui/card";
import {
  ExploreGridSkeleton,
  LoadingSkeletonRegion,
  RestaurantGridSkeleton,
} from "@food/components/ui/loading-skeletons";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import foodPattern from "@food/assets/food_pattern_background.png";
import discoveryBg from "@food/assets/food_discovery_bg.png";

const PRIMARY_FILTERS = [
  { id: "delivery-under-30", label: "Under 30 mins" },
  { id: "delivery-under-45", label: "Under 45 mins" },
  { id: "distance-under-1km", label: "Under 1km", icon: MapPin },
  { id: "distance-under-2km", label: "Under 2km", icon: MapPin },
];

const FoodRestaurantCard = memo(function FoodRestaurantCard({
  restaurant,
  index,
  isOutOfService,
  availabilityTick,
  isFavorite,
  onFavoriteToggle,
  RestaurantImageCarousel,
  backendOrigin,
}) {
  const nameStr = typeof restaurant?.name === "string" ? restaurant.name.trim() : "";
  const fallbackSlugSource =
    nameStr ||
    (typeof restaurant?.restaurantName === "string" ? restaurant.restaurantName.trim() : "") ||
    String(restaurant?.slug || restaurant?.id || restaurant?._id || `restaurant-${index}`);

  const restaurantSlug =
    typeof restaurant?.slug === "string" && restaurant.slug.trim()
      ? restaurant.slug.trim()
      : fallbackSlugSource.toLowerCase().replace(/\s+/g, "-");

  const availability = getRestaurantAvailabilityStatus(restaurant, new Date(availabilityTick), {
    ignoreOperationalStatus: true,
  });
  const favorite = isFavorite(restaurantSlug);

  return (
    <div
      key={restaurant?.id || restaurant?._id || restaurantSlug || index}
      className="h-full transform transition-all duration-300 hover:-translate-y-3 hover:scale-[1.02]"
      style={{
        perspective: 1000,
        animation: index < 10 ? `fade-in-up 0.5s ease-out ${index * 0.05}s backwards` : "none",
      }}
    >
      <div className="h-full group">
        <Link to={`/user/restaurants/${restaurantSlug}`} className="flex h-full">
          <Card
            className={`relative flex h-[340px] w-full flex-col gap-0 overflow-hidden rounded-[32px] border-0 bg-white shadow-sm transition-all duration-500 hover:shadow-2xl dark:border-gray-800 dark:bg-[#1a1a1a] ${
              isOutOfService || !availability.isOpen ? "grayscale opacity-75" : ""
            }`}
          >
            {/* Background Image Layer */}
            <div className="absolute inset-0 z-0 h-full w-full">
              <RestaurantImageCarousel
                restaurant={restaurant}
                priority={index < 3}
                backendOrigin={backendOrigin}
                className="h-full w-full object-cover"
              />
              {/* Overlay for transparency and depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* Top Badges (Rating & Favorite) */}
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/20 bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-md">
                <Star className="mr-1 h-3 w-3 fill-amber-400 text-amber-400" />
                {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
              </div>
            </div>

            <div className="absolute right-4 top-4 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => onFavoriteToggle(event, restaurant, restaurantSlug, favorite)}
                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-xl transition-all duration-300 ${
                  favorite
                    ? "bg-red-500 text-white"
                    : "bg-black/40 text-white backdrop-blur-md border border-white/10 hover:bg-black/60"
                }`}
              >
                <Bookmark className={`h-5 w-5 transition-all duration-300 ${favorite ? "fill-white" : ""}`} />
              </Button>
            </div>

            {/* Absolute Info Box on Top of Image */}
            <div className="absolute bottom-4 left-4 right-4 z-10">
              <div className="relative overflow-hidden rounded-[24px] bg-black/40 p-4 shadow-2xl backdrop-blur-xl border border-white/5 transition-transform duration-300 group-hover:-translate-y-1">
                <div className="flex items-start gap-3">
                  {/* Restaurant Logo/Initial */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-inner">
                    <span className="text-xl font-black">{restaurant.name.charAt(0)}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="line-clamp-1 text-lg font-black tracking-tight text-white lg:text-xl">
                        {restaurant.name}
                      </h3>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover:bg-white group-hover:text-black">
                        <ArrowDownUp className="h-3 w-3 rotate-[-90deg]" />
                      </div>
                    </div>
                    
                    <p className="line-clamp-1 mt-0.5 text-[11px] font-medium text-white/60 uppercase tracking-wider">
                      {restaurant.featuredDish} • {restaurant.deliveryTime}
                    </p>
                  </div>
                </div>

                {/* Additional Info Row */}
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/80">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>{restaurant.distance}</span>
                    </div>
                    <div className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                      availability.isOpen ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"
                    }`}>
                      {availability.isOpen ? "Open" : "Closed"}
                    </div>
                  </div>
                  
                  {restaurant.offer && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 border border-red-500/20">
                      <BadgePercent className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[80px]">{restaurant.offer}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
});

            <div 
              className="pointer-events-none absolute inset-0 z-0 rounded-md border border-transparent transition-all duration-300 group-hover:border-[var(--hover-border)] group-hover:shadow-[inset_0_0_0_1px_rgba(226,40,27,0.2)]" 
              style={{ '--hover-border': `${RED}4D` }} 
            />
          </Card>
        </Link>
      </div>
    </div>
  );
});

import { RED } from "@food/constants/color";

function FoodHomeContent({
  handleVegModeChange,
  navigate,
  vegMode,
  vegModeToggleRef,
  displayCategories,
  HeroBannerSection,
  activeFilters,
  onOpenFilter,
  onTogglePrimaryFilter,
  recommendedForYouRestaurants,
  exploreMoreHeading,
  showExploreSkeleton,
  finalExploreItems,
  filteredRestaurants,
  showRestaurantSkeleton,
  isLoadingFilterResults,
  loadingRestaurants,
  visibleRestaurants,
  isOutOfService,
  availabilityTick,
  isFavorite,
  onFavoriteToggle,
  BACKEND_ORIGIN,
  RestaurantImageCarousel,
  loadMoreRestaurants,
  hasMoreRestaurants,
  restaurantLoadMoreRef,
}) {
  return (
    <motion.div
      key="food-content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white"
    >
      <div className="relative">
        <PromoRow
          handleVegModeChange={handleVegModeChange}
          navigate={navigate}
          isVegMode={vegMode}
          toggleRef={vegModeToggleRef}
        />
      </div>

      <div className="relative overflow-hidden rounded-[40px] mx-4 mt-2 px-6 py-10 shadow-[inset_0_-10px_40px_rgba(0,0,0,0.02)] border border-gray-100/50">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: `url(${foodPattern})`, backgroundSize: '150px' }} />
        <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-green-50/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex min-w-0 items-center justify-between gap-2 mb-8">
          <h2 className="shrink-0 text-xl font-black italic tracking-tighter text-gray-900 sm:text-2xl uppercase">
            What's on your mind today?
          </h2>
          <div className="hidden h-[1.5px] flex-1 bg-gradient-to-r from-gray-200 to-transparent sm:block mx-4" />
          <Link
            to="/user/categories"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-black sm:text-sm bg-red-600/10 px-4 py-2 rounded-full hover:bg-red-600/20 transition-all"
            style={{ color: RED }}
          >
            Explore <ArrowDownUp className="h-3 w-3 rotate-90" />
          </Link>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-x-2 gap-y-10 relative z-10">
          {displayCategories.slice(0, 8).map((category, index) => (
            <Link
              key={category.id || index}
              to={`/user/category/${category.slug}`}
              className="group flex flex-col items-center gap-4"
            >
              <div 
                className="relative aspect-square w-[76px] sm:w-[88px] overflow-hidden rounded-full border-[3px] border-white ring-1 ring-gray-100 bg-white shadow-lg transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl group-active:scale-95 group-hover:border-[var(--hover-color)]"
                style={{ '--hover-color': `${RED}33` }}
              >
                <OptimizedImage
                  src={category.image}
                  alt={category.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-115"
                />
                 {/* Shiny overlay on hover */}
                 <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-center text-[12px] font-black leading-tight text-gray-800 tracking-tighter opacity-70 group-hover:opacity-100 transition-all"
                style={{ '--hover-color': RED }}
              >
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {HeroBannerSection}

      <motion.section className="py-1 lg:py-2" initial={false} animate={{ opacity: 1, y: 0 }}>
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide sm:gap-2 lg:gap-3 lg:pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              onClick={onOpenFilter}
              className="flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-white dark:hover:bg-gray-800 sm:h-8 sm:px-3"
            >
              <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs font-bold text-black dark:text-white sm:text-sm">Filters</span>
            </Button>
          </motion.div>

          {PRIMARY_FILTERS.map((filter, index) => {
            const Icon = filter.icon;
            const isActive = activeFilters.has(filter.id);

            return (
              <motion.div
                key={filter.id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="outline"
                  onClick={() => onTogglePrimaryFilter(filter.id)}
                  className={`flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 font-medium transition-all sm:h-8 sm:px-3 ${
                    isActive
                      ? "border border-green-600 bg-green-600 text-white hover:bg-green-600/90"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {Icon && <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? "fill-white" : ""}`} />}
                  <span className="text-xs font-bold text-black dark:text-white sm:text-sm">{filter.label}</span>
                </Button>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {recommendedForYouRestaurants.length > 0 && (
        <motion.section className="content-auto pt-1 sm:pt-2" initial={false} animate={{ opacity: 1, y: 0 }}>
          <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 sm:mb-3 sm:text-sm lg:text-base">
            Recommended For You
          </h2>

          <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
            {recommendedForYouRestaurants.map((restaurant, index) => {
              const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-");
              return (
                <motion.div
                  key={`recommended-${restaurant.mongoId || restaurant.id || restaurantSlug}`}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                >
                  <Link
                    to={`/user/restaurants/${restaurantSlug}`}
                    className="block overflow-hidden rounded-[20px] border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-[#1a1a1a]"
                  >
                    <div className="relative h-24 bg-gray-50 sm:h-28 md:h-32">
                      <img
                        src={restaurant.image}
                        alt={restaurant.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div
                        className={`absolute bottom-2 left-2 rounded-lg border border-white/10 px-2 py-0.5 text-[10px] shadow-lg ${
                          Number(restaurant.rating) > 0
                            ? "bg-black/80 font-medium text-white backdrop-blur-md"
                            : "bg-gray-200/90 font-medium text-gray-600"
                        }`}
                      >
                        {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                        {restaurant.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: RED }}>
                        <Flame className="h-3.5 w-3.5" style={{ fill: RED }} />
                        Near & Fast
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      <motion.section className="content-auto px-4 pt-4" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-gray-200/20 via-white to-gray-200/10 py-10 border border-gray-100/50 shadow-sm">
          <div className="absolute inset-0 opacity-05 pointer-events-none" style={{ backgroundImage: `url(${discoveryBg})`, backgroundSize: '350px' }} />
          
          <h2 className="mb-8 px-8 text-sm font-black uppercase tracking-[0.2em] text-gray-500/70 relative z-10">
            {exploreMoreHeading}
          </h2>
          <div
            className="relative z-10 flex min-h-[132px] w-full gap-6 overflow-x-auto px-8 pb-4 scrollbar-hide lg:pb-6"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
          {showExploreSkeleton ? (
            <div className="w-full min-w-full shrink-0">
              <ExploreGridSkeleton />
            </div>
          ) : (
            finalExploreItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link to={item.href} className="flex-shrink-0">
                  <div className="group flex w-24 flex-col items-center gap-3 sm:w-28">
                    <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-gray-100 bg-white p-3 shadow-[0_4px_15px_-3px_rgba(0,0,0,0.08)] transition-all duration-500 group-hover:border-[var(--hover-color)] group-hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.12)] dark:border-gray-800 dark:bg-[#1a1a1a] sm:h-24 sm:w-24" style={{ '--hover-color': `${RED}4D` }}>
                      <div
                        className={`absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-10 bg-gradient-to-br ${
                          index % 3 === 0
                            ? "from-red-500 to-red-600"
                            : index % 3 === 1
                              ? "from-blue-500 to-purple-500"
                              : "from-green-500 to-teal-500"
                        }`}
                      />

                      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                        <motion.div
                          animate={{ x: ["-200%", "200%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 + index * 0.5 }}
                          className="absolute inset-0 w-[150%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent"
                        />
                      </div>

                      <OptimizedImage
                        src={item.image}
                        alt={item.label}
                        className="relative z-10 h-full w-full object-contain transition-transform duration-500 group-hover:scale-110"
                        width={112}
                        height={112}
                      />
                    </div>
                    <span className="text-center text-[11px] font-medium tracking-wide text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
                      {item.label}
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </motion.section>

      <motion.section className="content-auto space-y-0 pb-8 pt-3 sm:pt-4 md:pb-10 lg:pt-6" initial={false} animate={{ opacity: 1 }}>
        <div className="mb-3 px-4 lg:mb-4">
          <div className="flex flex-col gap-0.5 lg:gap-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 sm:text-sm lg:text-base">
              {filteredRestaurants.length} Restaurants Delivering to You
            </h2>
            <span className="text-base font-normal text-gray-500 sm:text-lg lg:text-2xl">Featured</span>
          </div>
        </div>
        <div className={`relative ${showRestaurantSkeleton ? "min-h-[360px] sm:min-h-[420px]" : ""}`}>
          <AnimatePresence>
            {showRestaurantSkeleton && (
              <motion.div
                className="absolute inset-0 z-10 rounded-lg bg-white/94 dark:bg-[#1a1a1a]/94"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <LoadingSkeletonRegion label="Loading restaurants" className="h-full p-1 sm:p-2">
                  <RestaurantGridSkeleton count={3} className="grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" compact />
                </LoadingSkeletonRegion>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className={`grid grid-cols-1 items-stretch gap-5 px-4 pt-1 transition-opacity duration-300 sm:gap-4 sm:pt-1.5 md:grid-cols-2 lg:gap-5 lg:pt-2 lg:grid-cols-3 xl:gap-6 ${
              isLoadingFilterResults || loadingRestaurants ? "opacity-50" : "opacity-100"
            }`}
          >
            {visibleRestaurants.map((restaurant, index) => (
              <FoodRestaurantCard
                key={restaurant?.id || restaurant?._id || restaurant?.slug || index}
                restaurant={restaurant}
                index={index}
                isOutOfService={isOutOfService}
                availabilityTick={availabilityTick}
                isFavorite={isFavorite}
                onFavoriteToggle={onFavoriteToggle}
                RestaurantImageCarousel={RestaurantImageCarousel}
                backendOrigin={BACKEND_ORIGIN}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 px-4 pt-2 sm:pt-3">
          {hasMoreRestaurants && (
            <Button
              variant="outline"
              onClick={loadMoreRestaurants}
              className="border-gray-300 text-sm font-medium hover:border-gray-400"
            >
              Load more restaurants
            </Button>
          )}
          <div ref={restaurantLoadMoreRef} className="h-1 w-full" aria-hidden="true" />
        </div>
      </motion.section>
    </motion.div>
  );
}

export default memo(FoodHomeContent);
