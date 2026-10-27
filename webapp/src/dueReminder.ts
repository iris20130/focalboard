// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type DueCard = {
    teamId: string
    boardId: string
    boardTitle: string
    boardIcon?: string
    cardId: string
    cardTitle: string
    duePropertyName: string
    dueAt: number
    daysUntilDue: number
    status: 'overdue' | 'today' | 'soon' | 'pending'
    properties?: Record<string, string>
}

export type DueReminderSettings = {
    enabled: boolean
    leadDays: number
    intervalMinutes: number
    webhook: string
    secretConfigured: boolean
    usingDefaultWebhook: boolean
    defaultEnabled: boolean
    defaultLeadDays: number
    defaultInterval: number
    defaultHasWebhook: boolean
    days: string
    windowStart: number
    windowEnd: number
    mode: string
    dailyTime: string
    linkUrl: string
    channel: string
    pushOverdue: boolean
    pushSoon: boolean
    pushPending: boolean
    pendingLeadDays: number
    dateProperties?: Record<string, string>
    pendingProperties?: Record<string, string>
}

export type TopBarGreeting = {
    enabled: boolean
    idle: string[]
    busy: string[]
}

export type TopBarHoliday = {
    date: string
    name: string
    offDay: boolean
}

export type TopBarCalendar = {
    date: string
    dayOfYear: number
    daysInYear: number
    weekday: string
    lunar: string
    todayHoliday?: TopBarHoliday
    nextHoliday?: {date: string; name: string; daysUntil: number}
    days: TopBarHoliday[]
}

export const DUE_REMINDER_PREF_ENABLED = 'dueReminderEnabled'
export const DUE_REMINDER_PREF_LEAD_DAYS = 'dueReminderLeadDays'
export const DUE_REMINDER_PREF_INTERVAL = 'dueReminderIntervalMinutes'
export const DUE_REMINDER_PREF_WEBHOOK = 'dueReminderFeishuWebhook'
export const DUE_REMINDER_PREF_SECRET = 'dueReminderFeishuSecret'
export const DUE_REMINDER_PREF_DAYS = 'dueReminderDays'
export const DUE_REMINDER_PREF_WINDOW_START = 'dueReminderWindowStartHour'
export const DUE_REMINDER_PREF_WINDOW_END = 'dueReminderWindowEndHour'
export const DUE_REMINDER_PREF_MODE = 'dueReminderMode'
export const DUE_REMINDER_PREF_DAILY_TIME = 'dueReminderDailyTime'
export const DUE_REMINDER_PREF_LINK_URL = 'dueReminderLinkUrl'
export const DUE_REMINDER_PREF_CHANNEL = 'dueReminderChannel'
export const DUE_REMINDER_PREF_PUSH_OVERDUE = 'dueReminderPushOverdue'
export const DUE_REMINDER_PREF_PUSH_SOON = 'dueReminderPushSoon'
export const DUE_REMINDER_PREF_PUSH_PENDING = 'dueReminderPushPending'
export const DUE_REMINDER_PREF_PENDING_LEAD = 'dueReminderPendingLeadDays'

export const DUE_REMINDER_LEAD_DAYS_KEY = 'dueReminderLeadDays'
export const DEFAULT_DUE_SOON_DAYS = 7
export const DUE_DATE_PROPERTIES_KEY = 'focalboard.dueDateProperties'

export function readDueDatePropertyOverrides(): Record<string, string> {
    try {
        const raw = window.localStorage.getItem(DUE_DATE_PROPERTIES_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

export function writeDueDatePropertyOverrides(overrides: Record<string, string>) {
    try {
        window.localStorage.setItem(DUE_DATE_PROPERTIES_KEY, JSON.stringify(overrides))
    } catch {
        // localStorage may be unavailable
    }
}

export function getDueDatePropertyOverride(boardId: string): string {
    return readDueDatePropertyOverrides()[boardId] || ''
}

export function getDueReminderLeadDays(): number {
    try {
        const raw = window.localStorage.getItem(DUE_REMINDER_LEAD_DAYS_KEY)
        const days = raw ? parseInt(raw, 10) : DEFAULT_DUE_SOON_DAYS
        return Number.isFinite(days) && days >= 0 ? days : DEFAULT_DUE_SOON_DAYS
    } catch {
        return DEFAULT_DUE_SOON_DAYS
    }
}

export function setDueReminderLeadDays(days: number): void {
    const value = Number.isFinite(days) && days >= 0 ? Math.floor(days) : DEFAULT_DUE_SOON_DAYS
    try {
        window.localStorage.setItem(DUE_REMINDER_LEAD_DAYS_KEY, value.toString())
    } catch {
        // localStorage may be unavailable in private browsing
    }
}
