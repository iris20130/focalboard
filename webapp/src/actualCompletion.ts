// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Board, IPropertyTemplate} from './blocks/board'

export type ActualCompletionSetting = {
    enabled: boolean
    statusPropertyId: string
    completedOptionId: string
    datePropertyId: string
}

export type ActualCompletionOverrides = Partial<ActualCompletionSetting>

export const ACTUAL_COMPLETION_DATE_PROPERTY = '实际完成日期'

const SETTINGS_KEY = 'focalboard.actualCompletion.settings'
const DONE_OPTION_RE = /^(已完成|完成|done|completed|complete|closed)$/i
const STATUS_NAME_RE = /状态|status/i
const DATE_NAME_RE = /实际完成日期|完成日期|actual.*complet|completion.*date/i

export function readActualCompletionSettings(): Record<string, ActualCompletionOverrides> {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

export function saveActualCompletionSettings(settings: Record<string, ActualCompletionOverrides>) {
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // localStorage may be unavailable
    }
}

export function detectStatusTemplate(board: Board): IPropertyTemplate | undefined {
    const selectable = board.cardProperties.filter((p) => (p.type === 'select' || p.type === 'multiSelect') && p.options.length > 0)
    const withDone = selectable.filter((p) => p.options.some((o) => DONE_OPTION_RE.test(o.value.trim())))
    return withDone.find((p) => STATUS_NAME_RE.test(p.name)) || withDone[0]
}

export function detectCompletedOption(template?: IPropertyTemplate): string {
    if (!template) {
        return ''
    }
    return template.options.find((o) => DONE_OPTION_RE.test(o.value.trim()))?.id || ''
}

export function detectDateTemplate(board: Board): IPropertyTemplate | undefined {
    return board.cardProperties.find((p) => p.type === 'date' && DATE_NAME_RE.test(p.name))
}

export function resolveActualCompletionSetting(board: Board, saved?: ActualCompletionOverrides): ActualCompletionSetting {
    const statusTemplate =
        board.cardProperties.find((p) => p.id === saved?.statusPropertyId && (p.type === 'select' || p.type === 'multiSelect')) ||
        detectStatusTemplate(board)
    const savedCompleted = statusTemplate?.options.find((o) => o.id === saved?.completedOptionId)?.id || ''
    const completedOptionId = savedCompleted || detectCompletedOption(statusTemplate)
    const dateTemplate =
        board.cardProperties.find((p) => p.id === saved?.datePropertyId && p.type === 'date') ||
        detectDateTemplate(board)

    return {
        enabled: saved?.enabled ?? Boolean(statusTemplate && completedOptionId),
        statusPropertyId: statusTemplate?.id || '',
        completedOptionId,
        datePropertyId: dateTemplate?.id || '',
    }
}

export function getActualCompletionSetting(board: Board): ActualCompletionSetting {
    return resolveActualCompletionSetting(board, readActualCompletionSettings()[board.id])
}

export function todayDateValue(): string {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
    return JSON.stringify({from: today.getTime()})
}
