// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board, IPropertyTemplate} from './blocks/board'

export type WorkdaysSetting = {
    startPropertyId: string
    endPropertyId: string
}

const SETTINGS_KEY = 'focalboard.workdays.settings'
const START_RE = /开始|起始|start/i
const END_RE = /结束|截止|end|due|完成/i

export function readWorkdaysSettings(): Record<string, Partial<WorkdaysSetting>> {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

export function saveWorkdaysSettings(settings: Record<string, Partial<WorkdaysSetting>>) {
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // localStorage may be unavailable
    }
}

function dateTemplates(board: Board): IPropertyTemplate[] {
    return board.cardProperties.filter((p) => p.type === 'date')
}

export function detectWorkdaysSetting(board: Board): WorkdaysSetting {
    const dates = dateTemplates(board)
    const start = dates.find((p) => START_RE.test(p.name))
    const end = dates.find((p) => END_RE.test(p.name)) || dates.find((p) => p.id !== start?.id)
    return {
        startPropertyId: start?.id || '',
        endPropertyId: end?.id || '',
    }
}

export function resolveWorkdaysSetting(board: Board, saved?: Partial<WorkdaysSetting>): WorkdaysSetting {
    const valid = (id?: string) => board.cardProperties.some((p) => p.id === id && p.type === 'date')
    const fallback = detectWorkdaysSetting(board)
    return {
        startPropertyId: valid(saved?.startPropertyId) ? saved?.startPropertyId || '' : fallback.startPropertyId,
        endPropertyId: valid(saved?.endPropertyId) ? saved?.endPropertyId || '' : fallback.endPropertyId,
    }
}

export function getWorkdaysSetting(board: Board): WorkdaysSetting {
    return resolveWorkdaysSetting(board, readWorkdaysSettings()[board.id])
}

// Inclusive count of Mon-Fri days between two dates; weekends are skipped.
export function workdaysBetween(start: Date, end: Date): number {
    let from = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    let to = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    if (to.getTime() < from.getTime()) {
        const swap = from
        from = to
        to = swap
    }
    let count = 0
    const cursor = new Date(from)
    let guard = 0
    while (cursor.getTime() <= to.getTime() && guard < 20000) {
        const day = cursor.getDay()
        if (day !== 0 && day !== 6) {
            count++
        }
        cursor.setDate(cursor.getDate() + 1)
        guard++
    }
    return count
}
