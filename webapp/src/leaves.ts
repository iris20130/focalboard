// 假勤（年假/调休）前端类型与缓存工具。数据按账号存于服务端偏好。

import octoClient from './octoClient'

export type LeaveRecord = {
    id: string
    kind: 'annual' | 'comp'
    action: 'grant' | 'add' | 'use' | 'void'
    date: string
    days: number
    note?: string
    expires?: string
    createdAt?: number
}

export type LeaveSettings = {
    workStartDate: string
    annualExpireYears: number
    annualExpireMonth: number
    annualExpireDay: number
    compExpireYears: number
    compExpireMonth: number
    compExpireDay: number
    colors?: Record<string, string>
}

export type LeaveBalance = {
    kind: 'annual' | 'comp'
    total: number
    used: number
    available: number
    expired: number
    nextExpire?: string
    expireWorkdays?: number
}

export type LeaveSummary = {
    settings: LeaveSettings
    balances: LeaveBalance[]
    records: LeaveRecord[]
}

export type LunarDay = {
    date: string
    lunar: string
    term?: string
}

export const leaveDefaults = {
    colors: {
        overtime: '#d9480f',
        compLeave: '#2f9e44',
        annualLeave: '#1971c2',
        term: '#868e96',
    } as Record<string, string>,
}

export function leaveColor(settings: LeaveSettings | undefined, key: string): string {
    return settings?.colors?.[key] || leaveDefaults.colors[key] || '#666'
}

// leaveDayMarks 把流水按日期归组，供月历与看板日历渲染。void 行不进日历。
export function leaveDayMarks(records: LeaveRecord[]): Record<string, LeaveRecord[]> {
    const map: Record<string, LeaveRecord[]> = {}
    records.forEach((record) => {
        if (record.action === 'void') {
            return
        }
        if (!map[record.date]) {
            map[record.date] = []
        }
        map[record.date].push(record)
    })
    return map
}

export function leaveMarkLabel(record: LeaveRecord): {text: string, colorKey: string} {
    const half = record.days % 1 !== 0 ? '½' : ''
    if (record.kind === 'comp' && record.action === 'add') {
        return {text: `加班${half}`, colorKey: 'overtime'}
    }
    if (record.kind === 'comp' && record.action === 'use') {
        return {text: `调休假${half}`, colorKey: 'compLeave'}
    }
    if (record.kind === 'annual' && record.action === 'use') {
        return {text: `年假${half}`, colorKey: 'annualLeave'}
    }
    if (record.kind === 'annual' && record.action === 'grant') {
        return {text: `年假+${record.days}`, colorKey: 'annualLeave'}
    }
    return {text: '', colorKey: 'term'}
}

const LUNAR_CACHE_PREFIX = 'focalboard.lunar.'

// getLunarYear 取某年逐日农历/节气表，农历数据恒定可长期缓存。
export async function getLunarYear(year: number): Promise<Record<string, LunarDay>> {
    const cacheKey = LUNAR_CACHE_PREFIX + year
    try {
        const raw = window.localStorage.getItem(cacheKey)
        if (raw) {
            const parsed = JSON.parse(raw) as Record<string, LunarDay>
            if (Object.keys(parsed).length > 300) {
                return parsed
            }
        }
    } catch {
        // fall through to fetch
    }
    const days = await octoClient.getTopBarLunar(year)
    if (!days || days.length === 0) {
        return {}
    }
    const map: Record<string, LunarDay> = {}
    days.forEach((day) => {
        map[day.date] = day
    })
    try {
        window.localStorage.setItem(cacheKey, JSON.stringify(map))
    } catch {
        // quota is not worth failing the calendar over
    }
    return map
}
