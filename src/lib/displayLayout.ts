/**
 * Layout rules for the shared waiting-room TV.
 *
 * The screen is deliberately not configured with a fixed number of pages. The
 * doctor list is already filtered to active doctors and ordered by reception
 * (`display_order`, then name), so the display can derive everything it needs
 * from the count. Adding a seventh doctor starts rotation; deactivating one
 * takes the screen back to a single page.
 */

/** At most this many doctors fit comfortably on one 16:9 screen. */
export const DISPLAY_SINGLE_PAGE_LIMIT = 6

/** Pages larger than the single-page limit hold five cards. */
export const DISPLAY_PAGE_SIZE = 5

/** How long each page stays on screen before the next one. */
export const DISPLAY_ROTATION_MS = 12_000

/**
 * Split an ordered doctor list into TV pages.
 *
 * 1–6 doctors stay together: with six cards, a 3×2 grid still reads from the
 * far side of a waiting room. Above that, five is the largest count that keeps
 * the token numerals legible, so the list is chunked into pages of five.
 */
export function buildDoctorPages<T>(doctors: readonly T[]): T[][] {
  if (doctors.length === 0) return []
  if (doctors.length <= DISPLAY_SINGLE_PAGE_LIMIT) return [doctors.slice()]

  const pages: T[][] = []
  for (let index = 0; index < doctors.length; index += DISPLAY_PAGE_SIZE) {
    pages.push(doctors.slice(index, index + DISPLAY_PAGE_SIZE))
  }
  return pages
}

/** Whether a TV with this many pages should rotate at all. */
export function shouldRotatePages(pageCount: number): boolean {
  return pageCount > 1
}

/** Advance a page index, wrapping at the end. */
export function nextPageIndex(current: number, pageCount: number): number {
  if (pageCount <= 1) return 0
  const safeCurrent = current < 0 || current >= pageCount ? 0 : current
  return (safeCurrent + 1) % pageCount
}

/** A stable key for "the doctor list changed", not merely "a token changed". */
export function displaySignature<T>(items: readonly T[], getId: (item: T) => string): string {
  return items.map(getId).join('|')
}

/**
 * Grid classes for one page.
 *
 * Five gets a six-column track so three cards sit on top and the final two can
 * be centred beneath them. Everything else uses at most three columns.
 */
export function gridClassFor(count: number): string {
  switch (count) {
    case 1:
      return 'max-w-5xl grid-cols-1'
    case 2:
      return 'max-w-7xl grid-cols-1 sm:grid-cols-2'
    case 3:
      return 'max-w-7xl grid-cols-1 sm:grid-cols-3'
    case 4:
      return 'max-w-7xl grid-cols-2'
    case 5:
      return 'max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-6'
    default:
      return 'max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  }
}

/**
 * Extra class for a card inside a five-card page.
 *
 * The fourth card starts in the second column of the six-column track, leaving
 * the two bottom cards centred under the top row.
 */
export function cardClassFor(index: number, count: number): string {
  if (count !== 5) return ''

  if (index < 3) return 'lg:col-span-2'
  if (index === 3) return 'lg:col-span-2 lg:col-start-2'
  return 'lg:col-span-2'
}
