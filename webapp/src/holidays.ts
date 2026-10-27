import octoClient from './octoClient'

export type HolidayInfo = {
    name: string
    offDay: boolean
}

type HolidayCache = {
    fetchedAt: number
    days: Record<string, HolidayInfo>
}

const CACHE_KEY = 'focalboard.holidays'
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000

export function toDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function readHolidayCache(): Record<string, HolidayInfo> {
    try {
        const raw = window.localStorage.getItem(CACHE_KEY)
        if (!raw) {
            return {}
        }
        const cache = JSON.parse(raw) as HolidayCache
        return cache.days || {}
    } catch {
        return {}
    }
}

export async function loadHolidays(force = false): Promise<Record<string, HolidayInfo>> {
    let cache: HolidayCache | undefined
    try {
        const raw = window.localStorage.getItem(CACHE_KEY)
        if (raw) {
            cache = JSON.parse(raw) as HolidayCache
        }
    } catch {
        cache = undefined
    }
    // An empty days map is never a usable cache: it would hide holidays for the whole TTL
    const cacheHasData = Boolean(cache && Object.keys(cache.days || {}).length > 0)
    if (!force && cacheHasData && Date.now() - (cache?.fetchedAt || 0) < CACHE_TTL) {
        return cache!.days
    }

    const calendar = await octoClient.getTopBarCalendar()
    if (!calendar || !Array.isArray(calendar.days) || calendar.days.length === 0) {
        return cacheHasData ? cache!.days : {}
    }
    const days: Record<string, HolidayInfo> = {}
    calendar.days.forEach((day) => {
        days[day.date] = {name: day.name, offDay: day.offDay}
    })
    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({fetchedAt: Date.now(), days}))
    } catch {
        // storage quota is not worth failing the calendar over
    }
    return days
}
