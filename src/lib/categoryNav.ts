import { CATEGORY_GROUPS, type Category } from './types'

/**
 * "Show me more like this" navigation: tapping the category noun in a
 * byline ("…recommended a [spot]") lands on Discover filtered to that
 * category. Two delivery paths: a window event for when Discover is
 * already mounted, and a sessionStorage stash for when the tap happens
 * on another page and Discover mounts fresh after navigating home.
 */
export interface CategoryNav {
  group: string
  sub: Category | 'all'
}

export const CATEGORY_NAV_EVENT = 'peak:filter-category'
const STASH_KEY = 'tally-category-nav'

export function navForCategory(category: Category): CategoryNav {
  const g = CATEGORY_GROUPS.find((x) => x.categories.includes(category))
  return { group: g?.id ?? 'all', sub: category }
}

/** Stash + signal. The caller navigates home afterwards. */
export function goToCategory(category: Category): void {
  const nav = navForCategory(category)
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(nav))
  } catch {
    /* private mode — the event path may still land it */
  }
  window.dispatchEvent(new CustomEvent<CategoryNav>(CATEGORY_NAV_EVENT, { detail: nav }))
}

/** Read and clear the stash (Discover calls this on mount / on event). */
export function takeCategoryNavStash(): CategoryNav | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STASH_KEY)
    return JSON.parse(raw) as CategoryNav
  } catch {
    return null
  }
}
