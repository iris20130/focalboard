// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Card} from '../../blocks/card'
import {IPropertyTemplate} from '../../blocks/board'
import {getDueDatePropertyOverride, getDueReminderLeadDays} from '../../dueReminder'

export type DueStatusId = 'overdue' | 'today' | 'soon' | 'normal' | 'none'

type StoredDate = {
    from?: number
    includeTime?: boolean
}

// Date properties are stored either as a millisecond timestamp or as a JSON
// value with from/to/includeTime. Parsing locally keeps this module free of
// the heavier date editor imports (which would create a store import cycle).
function parseStoredDate(value: string): StoredDate {
    const trimmed = value.trim()
    if (!trimmed) {
        return {}
    }
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed)
            const from = Number(parsed.from) || Number(parsed.to) || 0
            return {from: from > 0 ? from : undefined, includeTime: Boolean(parsed.includeTime)}
        } catch {
            return {}
        }
    }
    const millis = Number(trimmed)
    return Number.isFinite(millis) && millis > 0 ? {from: millis} : {}
}

export type DueStatusInfo = {
    id: DueStatusId
    days: number
}

export function getDueDateTemplate(templates: readonly IPropertyTemplate[] | undefined, preferredID = ''): IPropertyTemplate | undefined {
    if (!templates) {
        return undefined
    }
    const dateTemplates = templates.filter((template) => template.type === 'date')
    if (preferredID) {
        const preferred = dateTemplates.find((template) => template.id === preferredID)
        if (preferred) {
            return preferred
        }
    }
    return dateTemplates.find((template) => (/due|deadline|截止|到期/i).test(template.name)) || dateTemplates[0]
}

export function getDueStatusInfo(value: string | string[] | undefined, leadDays = getDueReminderLeadDays(), today = new Date()): DueStatusInfo {
    if (typeof value !== 'string' || !value) {
        return {id: 'none', days: 0}
    }

    const dateProperty = parseStoredDate(value)
    if (!dateProperty.from) {
        return {id: 'none', days: 0}
    }

    // Dates without a time are stored at 12:00 UTC; convert to the local day.
    const timeZoneOffset = new Date(dateProperty.from).getTimezoneOffset() * 60 * 1000
    const due = new Date(dateProperty.from + (dateProperty.includeTime ? 0 : timeZoneOffset))
    due.setHours(0, 0, 0, 0)

    const start = new Date(today)
    start.setHours(0, 0, 0, 0)

    const days = Math.round((due.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))

    // workdays remaining (Mon-Fri), matching the server-side soon/overdue math
    let workdays = 0
    if (days > 0) {
        const cursor = new Date(start.getTime())
        const target = new Date(due.getTime())
        while (cursor.getTime() < target.getTime()) {
            cursor.setDate(cursor.getDate() + 1)
            const weekday = cursor.getDay()
            if (weekday !== 0 && weekday !== 6) {
                workdays++
            }
        }
    }
    if (days < 0) {
        return {id: 'overdue', days: -days}
    }
    if (days === 0) {
        return {id: 'today', days: 0}
    }
    if (workdays <= leadDays) {
        return {id: 'soon', days: workdays}
    }
    return {id: 'normal', days: workdays}
}

export function getCardDueStatus(card: Card, templates: readonly IPropertyTemplate[]): DueStatusInfo {
    const dateTemplate = getDueDateTemplate(templates, getDueDatePropertyOverride(card.boardId))
    if (!dateTemplate) {
        return {id: 'none', days: 0}
    }
    return getDueStatusInfo(card.fields.properties[dateTemplate.id])
}
