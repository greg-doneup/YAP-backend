/**
 * Cache Client for Dynamic Lesson Generation
 * Handles caching of generated lessons to improve performance
 */

interface CachedLessonData {
  lesson: any;
  generatedAt: string;
  metadata: any;
}

// In-memory cache for development
// In production, this would use Redis or another caching solution
const lessonCache = new Map<string, CachedLessonData>();

/**
 * Cache a generated lesson
 */
export async function cacheGeneratedLesson(key: string, lessonData: CachedLessonData): Promise<void> {
  try {
    // Set cache expiration (24 hours for generated lessons)
    const expirationTime = Date.now() + (24 * 60 * 60 * 1000);
    
    const cacheEntry = {
      ...lessonData,
      expiresAt: expirationTime
    };

    lessonCache.set(key, cacheEntry);
    
    console.log(`[CACHE] Lesson cached with key: ${key}`);
    
    // Clean up expired entries periodically
    cleanupExpiredEntries();
    
  } catch (error) {
    console.error("Error caching lesson:", error);
    // Don't throw - caching failures shouldn't break lesson generation
  }
}

/**
 * Retrieve a cached lesson
 */
export async function getCachedLesson(key: string): Promise<CachedLessonData | null> {
  try {
    const cachedEntry = lessonCache.get(key);
    
    if (!cachedEntry) {
      return null;
    }

    // Check if cached entry has expired
    if ((cachedEntry as any).expiresAt && Date.now() > (cachedEntry as any).expiresAt) {
      lessonCache.delete(key);
      console.log(`[CACHE] Expired lesson removed: ${key}`);
      return null;
    }

    console.log(`[CACHE] Lesson cache hit: ${key}`);
    return cachedEntry;
    
  } catch (error) {
    console.error("Error retrieving cached lesson:", error);
    return null;
  }
}

/**
 * Clear cached lessons for a specific user
 */
export async function clearUserLessonCache(userId: string): Promise<void> {
  try {
    const keysToDelete: string[] = [];
    
    lessonCache.forEach((value, key) => {
      if (key.includes(`lesson_${userId}_`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      lessonCache.delete(key);
    });

    console.log(`[CACHE] Cleared ${keysToDelete.length} cached lessons for user ${userId}`);
    
  } catch (error) {
    console.error("Error clearing user lesson cache:", error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
  cacheSize: string;
}> {
  const totalEntries = lessonCache.size;
  let expiredEntries = 0;
  
  const now = Date.now();
  lessonCache.forEach((value) => {
    if ((value as any).expiresAt && now > (value as any).expiresAt) {
      expiredEntries++;
    }
  });

  // Estimate cache size
  const cacheSize = `${Math.round(JSON.stringify(Array.from(lessonCache.entries())).length / 1024)}KB`;

  return {
    totalEntries,
    expiredEntries,
    cacheSize
  };
}

/**
 * Clean up expired cache entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  lessonCache.forEach((value, key) => {
    if ((value as any).expiresAt && now > (value as any).expiresAt) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => {
    lessonCache.delete(key);
  });

  if (keysToDelete.length > 0) {
    console.log(`[CACHE] Cleaned up ${keysToDelete.length} expired lesson entries`);
  }
}
