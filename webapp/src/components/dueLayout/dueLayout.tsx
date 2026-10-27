// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {useIntl} from 'react-intl'
import {generatePath, useHistory, useRouteMatch} from 'react-router-dom'

import octoClient from '../../octoClient'
import {
    DueCard,
    getDueReminderLeadDays,
    readDueDatePropertyOverrides,
    TopBarCalendar,
    TopBarGreeting,
    writeDueDatePropertyOverrides,
    DUE_REMINDER_PREF_ENABLED,
    DUE_REMINDER_PREF_INTERVAL,
    DUE_REMINDER_PREF_LEAD_DAYS,
    DUE_REMINDER_PREF_SECRET,
    DUE_REMINDER_PREF_WEBHOOK,
    DUE_REMINDER_PREF_DAYS,
    DUE_REMINDER_PREF_WINDOW_START,
    DUE_REMINDER_PREF_WINDOW_END,
    DUE_REMINDER_PREF_MODE,
    DUE_REMINDER_PREF_DAILY_TIME,
    DUE_REMINDER_PREF_LINK_URL,
    DUE_REMINDER_PREF_CHANNEL,
    DUE_REMINDER_PREF_PUSH_OVERDUE,
    DUE_REMINDER_PREF_PUSH_SOON,
    DUE_REMINDER_PREF_PUSH_PENDING,
    DUE_REMINDER_PREF_PENDING_LEAD,
} from '../../dueReminder'
import {Utils, IDType} from '../../utils'
import LeaveCalendar from '../leaveCalendar/leaveCalendar'
import {LeaveSummary} from '../../leaves'
import {useAppDispatch, useAppSelector} from '../../store/hooks'
import {getMe, patchProps} from '../../store/users'
import {getBoards, getCurrentBoard} from '../../store/boards'
import {IUser, UserConfigPatch} from '../../user'
import {IPropertyTemplate} from '../../blocks/board'
import mutator from '../../mutator'
import {
    ACTUAL_COMPLETION_DATE_PROPERTY,
    ActualCompletionOverrides,
    detectCompletedOption,
    readActualCompletionSettings,
    resolveActualCompletionSetting,
    saveActualCompletionSettings,
} from '../../actualCompletion'
import {
    WorkdaysSetting,
    readWorkdaysSettings,
    resolveWorkdaysSetting,
    saveWorkdaysSettings,
} from '../../workdays'
import {LocateCardEvent} from '../cardLocator/cardLocator'
import CompassIcon from '../../widgets/icons/compassIcon'
import ChevronDown from '../../widgets/icons/chevronDown'
import ChevronRight from '../../widgets/icons/chevronRight'
import SettingsIcon from '../../widgets/icons/settings'

import './dueLayout.scss'

const REFRESH_INTERVAL = 5 * 60 * 1000
const MIN_PANEL_WIDTH = 220
const MAX_PANEL_WIDTH = 600
const MIN_BOARD_WIDTH = 320

const COLORS_KEY = 'focalboard.floatingReminder.colors'
const METRICS_KEY = 'focalboard.floatingReminder.metrics'
const COUNT_PROPERTY_KEY = 'focalboard.floatingReminder.countProperty'
const PANEL_WIDTH_KEY = 'focalboard.duePanel.width'
const PANEL_OPEN_KEY = 'focalboard.duePanel.open'
const EXPANDED_BOARDS_KEY = 'focalboard.duePanel.expandedBoards'
const SETTINGS_OPEN_KEY = 'focalboard.duePanel.settingsOpen'
const TOP_BAR_HIDDEN_KEY = 'focalboard.topBar.hidden'

const formatChineseDate = (isoDate: string): string => {
    const [year, month, day] = isoDate.split('-')
    if (!year || !month || !day) {
        return isoDate
    }
    return `${Number(year)}年${Number(month)}月${Number(day)}日`
}

type Metric = 'overdue' | 'soon' | 'pending'
type Colors = {overdue: string, soon: string, pending: string, borderOverdue: string, borderSoon: string, borderPending: string}
type CountProperties = Record<string, string>

const DEFAULT_COLORS: Colors = {
    overdue: '#d24b4e',
    soon: '#d9822b',
    pending: '#8e5bd6',
    borderOverdue: '#f3c2c3',
    borderSoon: '#f6d8b8',
    borderPending: '#ddd0f5',
}

function readJSON<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function writeJSON(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // localStorage may be unavailable
    }
}

function metricOf(card: DueCard): Metric {
    if (card.status === 'pending') {
        return 'pending'
    }
    return card.status === 'overdue' ? 'overdue' : 'soon'
}

function webhookPlaceholder(channel: string): string {
    switch (channel) {
    case 'ftqq': return 'https://sctapi.ftqq.com/SENDKEY.send'
    case 'wecom': return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…'
    case 'dingtalk': return 'https://oapi.dingtalk.com/robot/send?access_token=…'
    case 'custom': return 'https://your.endpoint/hook'
    default: return 'https://open.feishu.cn/open-apis/bot/v2/hook/…'
    }
}

type Props = {
    children: React.ReactNode
}

const DueLayout = ({children}: Props): JSX.Element => {
    const intl = useIntl()
    const history = useHistory()
    const match = useRouteMatch<{boardId: string, viewId?: string, cardId?: string}>()
    const dispatch = useAppDispatch()
    const me = useAppSelector<IUser|null>(getMe)
    const boards = useAppSelector(getBoards)
    const currentBoard = useAppSelector(getCurrentBoard)

    const [cards, setCards] = useState<DueCard[]>([])
    const [pendingCards, setPendingCards] = useState<DueCard[]>([])
    const [cardsLoaded, setCardsLoaded] = useState(false)
    const [leadDays, setLeadDays] = useState(getDueReminderLeadDays())
    const [enabled, setEnabled] = useState(false)
    const [webhook, setWebhook] = useState('')
    const [secret, setSecret] = useState('')
    const [secretConfigured, setSecretConfigured] = useState(false)
    const [intervalMinutes, setIntervalMinutes] = useState(60)
    const [pushDays, setPushDays] = useState('1,2,3,4,5')
    const [windowStart, setWindowStart] = useState(9)
    const [windowEnd, setWindowEnd] = useState(17)
    const [pushMode, setPushMode] = useState('interval')
    const [dailyTime, setDailyTime] = useState('09:00')
    const [linkUrl, setLinkUrl] = useState('')
    const [channel, setChannel] = useState('feishu')
    const [pushOverdue, setPushOverdue] = useState(true)
    const [pushSoon, setPushSoon] = useState(true)
    const [pushPending, setPushPending] = useState(false)
    const [pendingLeadDays, setPendingLeadDays] = useState(3)
    const [settingsOpen, setSettingsOpen] = useState(() => readJSON<boolean>(SETTINGS_OPEN_KEY, false))
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [notice, setNotice] = useState('')

    const [metrics, setMetrics] = useState<Metric[]>(() => {
        const saved = readJSON<Metric[]>(METRICS_KEY, ['overdue', 'soon'])
        return saved.length > 0 ? saved : ['overdue', 'soon']
    })
    const [colors, setColors] = useState<Colors>(() => ({...DEFAULT_COLORS, ...readJSON<Partial<Colors>>(COLORS_KEY, {})}))
    const [countProperties, setCountProperties] = useState<CountProperties>(() => {
        const saved = readJSON<CountProperties | null>(COUNT_PROPERTY_KEY, null)
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    })
    const [actualSettings, setActualSettings] = useState<Record<string, ActualCompletionOverrides>>(() => readActualCompletionSettings())
    const [workdaysSettings, setWorkdaysSettings] = useState<Record<string, Partial<WorkdaysSetting>>>(() => readWorkdaysSettings())
    const [dueDateProperties, setDueDateProperties] = useState<Record<string, string>>(() => readDueDatePropertyOverrides())
    const [pendingProperties, setPendingProperties] = useState<Record<string, string>>(() => {
        try {
            const raw = window.localStorage.getItem('focalboard.pendingDateProperties')
            const parsed = raw ? JSON.parse(raw) : {}
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
            return {}
        }
    })
    const [cardsRefreshKey, setCardsRefreshKey] = useState(0)
    const [expandedBoardIds, setExpandedBoardIds] = useState<string[]>(() => readJSON<string[]>(EXPANDED_BOARDS_KEY, []))

    const savedOpenPrefRef = useRef<boolean | null>(readJSON<boolean | null>(PANEL_OPEN_KEY, null))
    const [sidebarOpen, setSidebarOpen] = useState(() => savedOpenPrefRef.current ?? true)
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = readJSON<number>(PANEL_WIDTH_KEY, 300)
        if (!Number.isFinite(saved)) {
            return 300
        }
        return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, saved))
    })
    const [resizing, setResizing] = useState(false)
    const [topBarHidden, setTopBarHidden] = useState(() => readJSON<boolean>(TOP_BAR_HIDDEN_KEY, false))
    const [greeting, setGreeting] = useState<TopBarGreeting | undefined>(undefined)
    const [calendar, setCalendar] = useState<TopBarCalendar | undefined>(undefined)
    const [quote, setQuote] = useState('')
    const [marquee, setMarquee] = useState(false)
    const [leaveSummary, setLeaveSummary] = useState<LeaveSummary | undefined>(undefined)
    const [leavePopup, setLeavePopup] = useState<{top: number, left: number, bottom: number} | null>(null)
    const [leavePinned, setLeavePinned] = useState(false)

    const layoutRef = useRef<HTMLDivElement>(null)
    const sidebarRef = useRef<HTMLElement>(null)
    const dividerDragRef = useRef<{startX: number, startWidth: number, max: number} | null>(null)
    const quoteViewportRef = useRef<HTMLSpanElement>(null)
    const quoteChunkRef = useRef<HTMLSpanElement>(null)
    const topBarRef = useRef<HTMLDivElement>(null)
    const calendarStripRef = useRef<HTMLDivElement>(null)
    const toggleRef = useRef<HTMLButtonElement>(null)
    const prefixRef = useRef<HTMLSpanElement>(null)
    const [calendarCentered, setCalendarCentered] = useState(false)
    const prevBusyRef = useRef<boolean | null>(null)
    const ensuredDatePropertyRef = useRef<Set<string>>(new Set())

    const isCardCompleted = useCallback((card: DueCard) => {
        const board = boards[card.boardId]
        if (!board) {
            return false
        }
        const setting = resolveActualCompletionSetting(board, actualSettings[board.id])
        if (!setting.enabled || !setting.statusPropertyId || !setting.completedOptionId) {
            return false
        }
        return card.properties?.[setting.statusPropertyId] === setting.completedOptionId
    }, [boards, actualSettings])

    const activeCards = useMemo(() => cards.filter((card) => !isCardCompleted(card)), [cards, isCardCompleted])
    const activePendingCards = useMemo(() => pendingCards.filter((card) => !isCardCompleted(card)), [pendingCards, isCardCompleted])
    const hasSidebarItems = activeCards.length > 0 || activePendingCards.length > 0

    const authenticated = Boolean(octoClient.token)
    const busy = activeCards.length > 0
    const showMessage = authenticated && greeting?.enabled === true && !topBarHidden

    const applySettings = useCallback((settings: Awaited<ReturnType<typeof octoClient.getDueReminderSettings>>) => {
        if (!settings) {
            return
        }
        setLeadDays(settings.leadDays)
        setEnabled(settings.enabled)
        setWebhook(settings.webhook)
        setSecretConfigured(settings.secretConfigured)
        setIntervalMinutes(settings.intervalMinutes)
        if (settings.days) {
            setPushDays(settings.days)
        }
        if (Number.isFinite(settings.windowStart)) {
            setWindowStart(settings.windowStart)
        }
        if (Number.isFinite(settings.windowEnd)) {
            setWindowEnd(settings.windowEnd)
        }
        if (settings.mode === 'interval' || settings.mode === 'daily') {
            setPushMode(settings.mode)
        }
        if (settings.dailyTime) {
            setDailyTime(settings.dailyTime)
        }
        setLinkUrl(settings.linkUrl || '')
        if (settings.channel) {
            setChannel(settings.channel)
        }
        setPushOverdue(settings.pushOverdue !== false)
        setPushSoon(settings.pushSoon !== false)
        setPushPending(settings.pushPending === true)
        if (Number.isFinite(settings.pendingLeadDays)) {
            setPendingLeadDays(Math.max(0, Math.min(365, settings.pendingLeadDays)))
        }
    }, [])

    useEffect(() => {
        if (!authenticated) {
            return () => {}
        }
        let cancelled = false
        octoClient.getDueReminderSettings().then((settings) => {
            if (!cancelled) {
                applySettings(settings)
                if (settings?.dateProperties) {
                    setDueDateProperties(settings.dateProperties)
                    writeDueDatePropertyOverrides(settings.dateProperties)
                }
                if (settings?.pendingProperties) {
                    setPendingProperties(settings.pendingProperties)
                    try {
                        window.localStorage.setItem('focalboard.pendingDateProperties', JSON.stringify(settings.pendingProperties))
                    } catch {
                        // ignore
                    }
                }
            }
        })
        octoClient.getTopBarGreeting().then((data) => {
            if (!cancelled) {
                setGreeting(data)
            }
        })
        octoClient.getTopBarCalendar().then((data) => {
            if (!cancelled) {
                setCalendar(data)
            }
        })
        octoClient.getLeaveSummary().then((data) => {
            if (!cancelled && data) {
                setLeaveSummary(data)
            }
        })
        return () => {
            cancelled = true
        }
    }, [authenticated, applySettings])

    useEffect(() => {
        if (!authenticated) {
            return () => {}
        }
        let cancelled = false
        const load = async () => {
            const [dueCards, pending] = await Promise.all([
                octoClient.getDueReminders(leadDays),
                octoClient.getPendingDueCards(),
            ])
            if (!cancelled) {
                setCards(dueCards)
                setPendingCards(pending)
                setCardsLoaded(true)
            }
        }
        load()
        const timer = window.setInterval(load, REFRESH_INTERVAL)
        return () => {
            cancelled = true
            window.clearInterval(timer)
        }
    }, [authenticated, leadDays, cardsRefreshKey])

    useEffect(() => {
        writeJSON(METRICS_KEY, metrics)
    }, [metrics])

    useEffect(() => {
        writeJSON(COLORS_KEY, colors)
    }, [colors])

    useEffect(() => {
        writeJSON(COUNT_PROPERTY_KEY, countProperties)
    }, [countProperties])

    useEffect(() => {
        writeJSON(PANEL_WIDTH_KEY, panelWidth)
    }, [panelWidth])

    useEffect(() => {
        writeJSON(EXPANDED_BOARDS_KEY, expandedBoardIds)
    }, [expandedBoardIds])

    useEffect(() => {
        writeJSON(SETTINGS_OPEN_KEY, settingsOpen)
    }, [settingsOpen])

    useEffect(() => {
        writeJSON(TOP_BAR_HIDDEN_KEY, topBarHidden)
    }, [topBarHidden])

    useEffect(() => {
        if (!cardsLoaded) {
            return
        }
        const busyNow = hasSidebarItems
        if (prevBusyRef.current === null) {
            // first load only: collapse when idle, follow preference when busy
            setSidebarOpen(busyNow ? (savedOpenPrefRef.current ?? true) : false)
            prevBusyRef.current = busyNow
            return
        }
        if (prevBusyRef.current === busyNow) {
            return
        }

        // state transition: auto-open when items appear, auto-close when none left
        if (busyNow) {
            setSidebarOpen(savedOpenPrefRef.current ?? true)
        } else {
            setSidebarOpen(false)
        }
        prevBusyRef.current = busyNow
    }, [hasSidebarItems, cardsLoaded])

    useEffect(() => {
        if (!authenticated || !currentBoard) {
            return
        }
        const setting = resolveActualCompletionSetting(currentBoard, actualSettings[currentBoard.id])
        if (!setting.enabled || !setting.statusPropertyId) {
            return
        }
        const hasDateProperty = currentBoard.cardProperties.some((p) => (
            p.type === 'date' && (p.id === setting.datePropertyId || p.name === ACTUAL_COMPLETION_DATE_PROPERTY)
        ))
        if (hasDateProperty || ensuredDatePropertyRef.current.has(currentBoard.id)) {
            return
        }
        ensuredDatePropertyRef.current.add(currentBoard.id)
        const template: IPropertyTemplate = {
            id: Utils.createGuid(IDType.BlockID),
            name: ACTUAL_COMPLETION_DATE_PROPERTY,
            type: 'date',
            options: [],
        }
        mutator.updateBoardCardProperties(
            currentBoard.id,
            currentBoard.cardProperties,
            [...currentBoard.cardProperties, template],
            'add actual completion date',
        ).catch(() => {})
    }, [authenticated, currentBoard, actualSettings])

    useEffect(() => {
        let pool: string[] = []
        if (greeting?.enabled) {
            pool = busy ? greeting.busy : greeting.idle
        }
        if (pool.length === 0) {
            setQuote('')
            return
        }
        setQuote(pool[Math.floor(Math.random() * pool.length)])
    }, [greeting, busy])

    useLayoutEffect(() => {
        const check = () => {
            const viewport = quoteViewportRef.current
            const chunk = quoteChunkRef.current
            setMarquee(Boolean(viewport && chunk && chunk.scrollWidth > viewport.clientWidth + 2))
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [quote, busy, greeting, topBarHidden, panelWidth, showMessage])

    // 日期条优先顶栏居中；与前文（问候/语录）或右侧开关干涉时退回原位
    useLayoutEffect(() => {
        const check = () => {
            const bar = topBarRef.current
            const cal = calendarStripRef.current
            const toggle = toggleRef.current
            if (!bar || !cal || !toggle) {
                setCalendarCentered(false)
                return
            }
            const barW = bar.clientWidth
            const calW = cal.offsetWidth
            const prefixW = prefixRef.current?.offsetWidth || 0
            const chunk = quoteChunkRef.current
            const quoteW = chunk ? Math.max(0, chunk.offsetWidth - 56) : 0
            const msgW = showMessage ? prefixW + (quoteW > 0 ? quoteW + 8 : 0) : 0
            const gap = 12
            const centerLeft = barW / 2 - calW / 2
            const fits = 16 + msgW + gap <= centerLeft && centerLeft + calW + gap <= barW - 10 - toggle.offsetWidth
            setCalendarCentered(fits)
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [calendar, quote, showMessage, busy, panelWidth, authenticated])

    useEffect(() => {
        const onUpdate = (e: Event) => setLeaveSummary((e as CustomEvent<LeaveSummary>).detail)
        window.addEventListener('focalboard-leaves-updated', onUpdate)
        return () => window.removeEventListener('focalboard-leaves-updated', onUpdate)
    }, [])

    useEffect(() => {
        if (!leavePopup) {
            return () => {}
        }
        const onDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!target.closest('.LeaveCalendar')) {
                setLeavePopup(null)
            }
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [leavePopup])

    const openLeavePopup = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setLeavePopup({top: rect.top, left: rect.left, bottom: rect.bottom})
    }, [])

    const openLeavePinned = useCallback((e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault()
        setLeavePinned(true)
    }, [])

    const onDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) {
            return
        }
        e.preventDefault()
        const layoutWidth = layoutRef.current?.getBoundingClientRect().width || 0
        dividerDragRef.current = {
            startX: e.clientX,
            startWidth: sidebarRef.current?.offsetWidth || panelWidth,
            max: Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, layoutWidth - MIN_BOARD_WIDTH)),
        }
        setResizing(true)
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [panelWidth])

    const onDividerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dividerDragRef.current
        if (!drag) {
            return
        }
        const next = Math.max(MIN_PANEL_WIDTH, Math.min(drag.max, drag.startWidth - (e.clientX - drag.startX)))
        setPanelWidth(Math.round(next))
    }, [])

    const onDividerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dividerDragRef.current) {
            return
        }
        dividerDragRef.current = null
        setResizing(false)
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
            // capture may already be released
        }
    }, [])

    const openCard = useCallback((card: DueCard) => {
        const params = {
            ...match.params,
            boardId: card.boardId,
            cardId: undefined,
            viewId: card.boardId === match.params.boardId ? match.params.viewId : undefined,
        }
        history.push(generatePath(Utils.getBoardPagePath(match.path), params))
        window.dispatchEvent(new CustomEvent(LocateCardEvent, {detail: {cardId: card.cardId}}))
    }, [match, history])

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((current) => {
            const next = !current
            savedOpenPrefRef.current = next
            writeJSON(PANEL_OPEN_KEY, next)
            return next
        })
    }, [])

    const updateActualSetting = useCallback((boardId: string, patch: ActualCompletionOverrides) => {
        const board = boards[boardId]
        if (!board) {
            return
        }
        setActualSettings((current) => {
            const resolved = resolveActualCompletionSetting(board, current[boardId])
            const next = {...current, [boardId]: {...resolved, ...patch}}
            saveActualCompletionSettings(next)
            return next
        })
    }, [boards])

    const saveWorkdaysSetting = useCallback((boardId: string, patch: Partial<WorkdaysSetting>) => {
        const board = boards[boardId]
        if (!board) {
            return
        }
        setWorkdaysSettings((current) => {
            const resolved = resolveWorkdaysSetting(board, current[boardId])
            const next = {...current, [boardId]: {...resolved, ...patch}}
            saveWorkdaysSettings(next)
            return next
        })
    }, [boards])

    const saveDueDateProperty = useCallback(async (boardId: string, propertyId: string) => {
        setDueDateProperties((current) => {
            const next = {...current}
            if (propertyId) {
                next[boardId] = propertyId
            } else {
                delete next[boardId]
            }
            writeDueDatePropertyOverrides(next)
            return next
        })
        try {
            await octoClient.setDueDateProperty(boardId, propertyId)
            setCardsRefreshKey((key) => key + 1)
        } catch {
            setNotice(intl.formatMessage({id: 'DuePanel.SaveFailed', defaultMessage: '保存失败'}))
            window.setTimeout(() => setNotice(''), 2000)
        }
    }, [intl])

    const savePendingDateProperty = useCallback(async (boardId: string, propertyId: string) => {
        setPendingProperties((current) => {
            const next = {...current}
            if (propertyId) {
                next[boardId] = propertyId
            } else {
                delete next[boardId]
            }
            try {
                window.localStorage.setItem('focalboard.pendingDateProperties', JSON.stringify(next))
            } catch {
                // ignore
            }
            return next
        })
        try {
            await octoClient.setPendingDateProperty(boardId, propertyId)
            setCardsRefreshKey((key) => key + 1)
        } catch {
            setNotice(intl.formatMessage({id: 'DuePanel.SaveFailed', defaultMessage: '保存失败'}))
            window.setTimeout(() => setNotice(''), 2000)
        }
    }, [intl])

    const patchSettings = useCallback(async (fields: Record<string, string>) => {
        if (!me) {
            return
        }
        setSaving(true)
        try {
            const patch: UserConfigPatch = {updatedFields: fields}
            const patched = await octoClient.patchUserConfig(me.id, patch)
            if (patched) {
                await dispatch(patchProps(patched))
            }
            applySettings(await octoClient.getDueReminderSettings())
            setNotice(intl.formatMessage({id: 'FloatingReminder.Saved', defaultMessage: 'Saved'}))
            window.setTimeout(() => setNotice(''), 1500)
        } finally {
            setSaving(false)
        }
    }, [me, dispatch, applySettings, intl])

    const toggleMetric = useCallback((metric: Metric) => {
        setMetrics((current) => {
            if (metric === 'pending') {
                return current.includes('pending') ? ['overdue', 'soon'] : ['pending']
            }
            if (current.includes('pending')) {
                return ['overdue', 'soon']
            }
            if (current.includes(metric)) {
                return current.length === 1 ? current : current.filter((item) => item !== metric)
            }
            return [...current, metric]
        })
    }, [])

    const testWebhook = useCallback(async () => {
        setTesting(true)
        try {
            await octoClient.testDueReminder()
            setNotice(intl.formatMessage({id: 'FloatingReminder.TestSent', defaultMessage: 'Test sent'}))
        } catch (err) {
            setNotice(intl.formatMessage({id: 'FloatingReminder.TestFailed', defaultMessage: 'Test failed'}))
        } finally {
            setTesting(false)
            window.setTimeout(() => setNotice(''), 2000)
        }
    }, [intl])

    const sendNow = useCallback(async () => {
        setTesting(true)
        try {
            const count = await octoClient.sendDueReminderNow()
            setNotice(intl.formatMessage({id: 'DuePanel.SentNow', defaultMessage: '已推送 {count} 条'}, {count}))
        } catch (err) {
            setNotice(intl.formatMessage({id: 'DuePanel.SendNowFailed', defaultMessage: '推送失败（先填 Webhook）'}))
        } finally {
            setTesting(false)
            window.setTimeout(() => setNotice(''), 2500)
        }
    }, [intl])

    const boardGroups = useMemo(() => {
        const groups = new Map<string, {boardId: string, title: string, icon: string, dueCards: DueCard[], pendingCards: DueCard[]}>()
        const ensureGroup = (card: DueCard) => {
            let group = groups.get(card.boardId)
            if (!group) {
                group = {boardId: card.boardId, title: card.boardTitle, icon: card.boardIcon || '🗂', dueCards: [], pendingCards: []}
                groups.set(card.boardId, group)
            }
            return group
        }
        for (const card of activeCards) {
            ensureGroup(card).dueCards.push(card)
        }
        for (const card of activePendingCards) {
            ensureGroup(card).pendingCards.push(card)
        }
        return Array.from(groups.values()).sort((a, b) => {
            const aOverdue = a.dueCards.filter((card) => card.status === 'overdue').length
            const bOverdue = b.dueCards.filter((card) => card.status === 'overdue').length
            if (aOverdue !== bOverdue) {
                return bOverdue - aOverdue
            }
            const aSoon = a.dueCards.length - aOverdue
            const bSoon = b.dueCards.length - bOverdue
            if (aSoon !== bSoon) {
                return bSoon - aSoon
            }
            if (a.pendingCards.length !== b.pendingCards.length) {
                return b.pendingCards.length - a.pendingCards.length
            }
            return a.title.localeCompare(b.title)
        })
    }, [activeCards, activePendingCards])

    const countablePropertiesFor = useCallback((boardId: string) => (
        boards[boardId]?.cardProperties?.filter((property) => property.options.length > 0) || []
    ), [boards])

    const actualSettingBoards = useMemo(() => Object.values(boards).
        filter((board) => board.cardProperties.some((p) => p.type === 'select' || p.type === 'multiSelect')).
        sort((a, b) => a.title.localeCompare(b.title)), [boards])

    const dueDateSettingBoards = useMemo(() => Object.values(boards).
        filter((board) => board.cardProperties.some((p) => p.type === 'date')).
        sort((a, b) => a.title.localeCompare(b.title)), [boards])

    const breakdownFor = useCallback((groupCards: DueCard[], boardId: string): Array<{label: string, count: number}> => {
        const propertyId = countProperties[boardId]
        if (!propertyId) {
            return []
        }
        const template = boards[boardId]?.cardProperties?.find((property) => property.id === propertyId)
        if (!template) {
            return []
        }
        const counts = new Map<string, number>()
        for (const card of groupCards) {
            const optionId = card.properties?.[propertyId] || ''
            counts.set(optionId, (counts.get(optionId) || 0) + 1)
        }
        return Array.from(counts.entries()).map(([optionId, count]) => {
            const option = template.options.find((item) => item.id === optionId)
            return {label: option?.value || '—', count}
        }).sort((a, b) => b.count - a.count)
    }, [countProperties, boards])

    const dueLabel = (card: DueCard): string => {
        if (card.status === 'pending') {
            const overdue = Math.abs(card.daysUntilDue)
            if (overdue <= 0) {
                return intl.formatMessage({id: 'DuePanel.PendingLabel', defaultMessage: '待返'})
            }
            return intl.formatMessage({id: 'DuePanel.PendingOverdueDays', defaultMessage: '待返超时 {days} 天'}, {days: overdue})
        }
        if (card.status === 'overdue') {
            return intl.formatMessage({id: 'FloatingReminder.OverdueDays', defaultMessage: '{days}d overdue'}, {days: Math.abs(card.daysUntilDue)})
        }
        if (card.status === 'today') {
            return intl.formatMessage({id: 'FloatingReminder.DueToday', defaultMessage: 'Due today'})
        }
        return intl.formatMessage({id: 'FloatingReminder.SoonDays', defaultMessage: 'In {days}d'}, {days: card.daysUntilDue})
    }

    const prefix = busy ?
        intl.formatMessage({id: 'DuePanel.Busy', defaultMessage: '最近有点忙'}) :
        intl.formatMessage({id: 'DuePanel.Idle', defaultMessage: '近期无事项'})

    const sidebarStyle = useMemo(() => {
        const style = {width: panelWidth} as React.CSSProperties & Record<string, string | number>
        style['--fr-overdue'] = colors.overdue
        style['--fr-soon'] = colors.soon
        style['--fr-pending'] = colors.pending
        style['--fr-border-overdue'] = colors.borderOverdue
        style['--fr-border-soon'] = colors.borderSoon
        style['--fr-border-pending'] = colors.borderPending
        return style
    }, [panelWidth, colors])

    const quoteChunks = marquee ? [quote, quote] : [quote]

    return (
        <div
            ref={layoutRef}
            className='DueLayout'
        >
            <div ref={topBarRef} className={`DueTopBar ${showMessage ? 'withMessage' : ''}`}>
                {showMessage ?
                    <div
                        className='DueTopBar__message'
                        onClick={() => setTopBarHidden(true)}
                        title={intl.formatMessage({id: 'DuePanel.HideHint', defaultMessage: '点击隐藏提示'})}
                    >
                        <span ref={prefixRef} className='DueTopBar__prefix'>{prefix}</span>
                        {quote &&
                            <span
                                ref={quoteViewportRef}
                                className='DueTopBar__quoteViewport'
                            >
                                <span className={`DueTopBar__quoteTrack ${marquee ? 'scrolling' : ''}`}>
                                    {quoteChunks.map((text, index) => (
                                        <span
                                            key={index}
                                            ref={index === 0 ? quoteChunkRef : undefined}
                                            className='DueTopBar__quoteChunk'
                                        >
                                            {text}
                                        </span>
                                    ))}
                                </span>
                            </span>}
                    </div> :
                    <div
                        className='DueTopBar__placeholder'
                        onClick={() => {
                            if (greeting?.enabled) {
                                setTopBarHidden(false)
                            }
                        }}
                        title={greeting?.enabled ? intl.formatMessage({id: 'DuePanel.ShowHint', defaultMessage: '点击显示提示'}) : undefined}
                    />}
                {authenticated && calendar &&
                    <div
                        ref={calendarStripRef}
                        className={`DueTopBar__calendar ${calendarCentered ? 'is-centered' : ''}`}
                        onClick={openLeavePopup}
                        onContextMenu={openLeavePinned}
                        title={intl.formatMessage({id: 'DuePanel.LeaveHint', defaultMessage: '点击打开假勤日历，右键钉住悬浮窗'})}
                    >
                        <span className='DueTopBar__dayOfYear'>{calendar.dayOfYear}/{calendar.daysInYear}</span>
                        <span className='DueTopBar__dateText'>
                            {formatChineseDate(calendar.date)} {calendar.weekday}
                        </span>
                        {leaveSummary &&
                            <span className='DueTopBar__leave'>
                                {intl.formatMessage({id: 'DuePanel.LeaveBadge', defaultMessage: '调休{comp}·年假{annual}'}, {comp: leaveSummary.balances.find((b) => b.kind === 'comp')?.available ?? 0, annual: leaveSummary.balances.find((b) => b.kind === 'annual')?.available ?? 0})}
                            </span>}
                        <span className='DueTopBar__lunar'>{intl.formatMessage({id: 'DuePanel.Lunar', defaultMessage: '农历'})}{calendar.lunar}</span>
                        {calendar.nextHoliday &&
                            <span className='DueTopBar__holiday'>
                                {calendar.nextHoliday.daysUntil === 0 ?
                                    intl.formatMessage({id: 'DuePanel.HolidayToday', defaultMessage: '今天 {name}'}, {name: calendar.nextHoliday.name}) :
                                    intl.formatMessage({id: 'DuePanel.HolidayCountdown', defaultMessage: '距{name} {days} 天'}, {name: calendar.nextHoliday.name, days: calendar.nextHoliday.daysUntil})}
                            </span>}
                    </div>}
                <button
                    ref={toggleRef}
                    type='button'
                    className={`DueTopBar__toggle ${sidebarOpen ? 'active' : ''}`}
                    onClick={toggleSidebar}
                    title={sidebarOpen ?
                        intl.formatMessage({id: 'DuePanel.CollapseSidebar', defaultMessage: '收起提醒栏'}) :
                        intl.formatMessage({id: 'DuePanel.ExpandSidebar', defaultMessage: '展开提醒栏'})}
                >
                    <CompassIcon icon='calendar-clock-outline'/>
                    <span>{intl.formatMessage({id: 'DuePanel.Toggle', defaultMessage: '提醒'})}</span>
                </button>
            </div>

            <div className='DueLayout__body'>
                <div className='DueLayout__content'>
                    {children}
                </div>
                {authenticated && sidebarOpen &&
                    <>
                        <div
                            className={`DueLayout__divider ${resizing ? 'dragging' : ''}`}
                            onPointerDown={onDividerPointerDown}
                            onPointerMove={onDividerPointerMove}
                            onPointerUp={onDividerPointerUp}
                            title={intl.formatMessage({id: 'DuePanel.ResizeHint', defaultMessage: '拖动调整提醒栏宽度'})}
                        />
                        <aside
                            ref={sidebarRef}
                            className='DueSidebar'
                            style={sidebarStyle}
                        >
                            <div className='DueSidebar__header'>
                                <span className='DueSidebar__toggles'>
                                    <button
                                        type='button'
                                        className={`DueSidebar__toggle ${metrics.includes('overdue') ? 'active' : ''}`}
                                        style={{color: colors.overdue, borderColor: colors.overdue}}
                                        onClick={() => toggleMetric('overdue')}
                                    >
                                        <span className='DueSidebar__box'/>
                                        <span className='DueSidebar__toggleLabel'>
                                            {intl.formatMessage({id: 'FloatingReminder.Overdue', defaultMessage: 'Overdue'})}
                                        </span>
                                    </button>
                                    <button
                                        type='button'
                                        className={`DueSidebar__toggle ${metrics.includes('soon') ? 'active' : ''}`}
                                        style={{color: colors.soon, borderColor: colors.soon}}
                                        onClick={() => toggleMetric('soon')}
                                    >
                                        <span className='DueSidebar__box'/>
                                        <span className='DueSidebar__toggleLabel'>
                                            {intl.formatMessage({id: 'FloatingReminder.Soon', defaultMessage: 'Due soon'})}
                                        </span>
                                    </button>
                                    <button
                                        type='button'
                                        className={`DueSidebar__toggle ${metrics.includes('pending') ? 'active' : ''}`}
                                        style={{color: colors.pending, borderColor: colors.pending}}
                                        onClick={() => toggleMetric('pending')}
                                    >
                                        <span className='DueSidebar__box'/>
                                        <span className='DueSidebar__toggleLabel'>
                                            {intl.formatMessage({id: 'DuePanel.Pending', defaultMessage: '待返'})}
                                        </span>
                                    </button>
                                </span>
                                <button
                                    type='button'
                                    className={`DueSidebar__gear ${settingsOpen ? 'active' : ''}`}
                                    onClick={() => setSettingsOpen(!settingsOpen)}
                                    title={intl.formatMessage({id: 'FloatingReminder.Settings', defaultMessage: 'Settings'})}
                                >
                                    <SettingsIcon/>
                                </button>
                            </div>

                            <div className='DueSidebar__body'>
                                {boardGroups.length === 0 &&
                                    <div className='DueSidebar__empty'>
                                        {intl.formatMessage({id: 'DuePanel.EmptySidebar', defaultMessage: '当前没有逾期或临期事项'})}
                                    </div>}
                                {boardGroups.map((group) => {
                                    const expanded = expandedBoardIds.includes(group.boardId)
                                    const visibleCards = [...group.dueCards, ...group.pendingCards].filter((card) => metrics.includes(metricOf(card)))
                                    const breakdown = breakdownFor(visibleCards, group.boardId)
                                    const overdueCount = group.dueCards.filter((card) => card.status === 'overdue').length
                                    const soonCount = group.dueCards.length - overdueCount
                                    const pendingCount = group.pendingCards.length
                                    return (
                                        <div
                                            className='DueSidebar__board'
                                            key={group.boardId}
                                        >
                                            <div
                                                className={`DueSidebar__boardRow ${expanded ? 'expanded' : ''}`}
                                                onClick={() => setExpandedBoardIds((current) => (
                                                    current.includes(group.boardId) ? current.filter((id) => id !== group.boardId) : [...current, group.boardId]
                                                ))}
                                            >
                                                <span className='DueSidebar__boardIcon'>{group.icon}</span>
                                                <span className='DueSidebar__boardTitle'>{group.title}</span>
                                                <span
                                                    className='DueSidebar__boardCount'
                                                    style={{color: colors.overdue}}
                                                >
                                                    {overdueCount}
                                                </span>
                                                <span
                                                    className='DueSidebar__boardCount'
                                                    style={{color: colors.soon}}
                                                >
                                                    {soonCount}
                                                </span>
                                                <span
                                                    className='DueSidebar__boardCount'
                                                    style={{color: colors.pending}}
                                                >
                                                    {pendingCount}
                                                </span>
                                                <span className='DueSidebar__chevron'>
                                                    {expanded ? <ChevronDown/> : <ChevronRight/>}
                                                </span>
                                            </div>
                                            {breakdown.length > 0 &&
                                                <div className='DueSidebar__breakdown'>
                                                    {breakdown.map((item) => (
                                                        <span key={item.label}>{item.label} {item.count}</span>
                                                    ))}
                                                </div>}
                                            {expanded &&
                                                <div className='DueSidebar__list'>
                                                    {visibleCards.map((card) => (
                                                        <div
                                                            key={`${card.boardId}-${card.cardId}`}
                                                            className={`DueSidebar__item ${metricOf(card)}`}
                                                            onClick={() => openCard(card)}
                                                        >
                                                            <span className='DueSidebar__itemTitle'>{card.cardTitle}</span>
                                                            <span
                                                                className='DueSidebar__itemDue'
                                                                style={{color: colors[metricOf(card)]}}
                                                            >
                                                                {dueLabel(card)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>}
                                        </div>
                                    )
                                })}

                                {settingsOpen &&
                                    <div className='DueSidebar__settings'>
                                        <div className='DueSidebar__settingRow'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushEnabled', defaultMessage: '开启推送'})}</label>
                                            <button
                                                type='button'
                                                className={`DueSidebar__switch ${enabled ? 'on' : ''}`}
                                                onClick={() => patchSettings({[DUE_REMINDER_PREF_ENABLED]: enabled ? 'false' : 'true'})}
                                            >
                                                <span/>
                                            </button>
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushChannel', defaultMessage: '推送渠道'})}</label>
                                            <select
                                                value={channel}
                                                onChange={(e) => {
                                                    setChannel(e.target.value)
                                                    patchSettings({[DUE_REMINDER_PREF_CHANNEL]: e.target.value})
                                                }}
                                            >
                                                <option value='feishu'>{intl.formatMessage({id: 'DuePanel.ChFeishu', defaultMessage: '飞书'})}</option>
                                                <option value='wecom'>{intl.formatMessage({id: 'DuePanel.ChWecom', defaultMessage: '企业微信'})}</option>
                                                <option value='dingtalk'>{intl.formatMessage({id: 'DuePanel.ChDingtalk', defaultMessage: '钉钉'})}</option>
                                                <option value='ftqq'>{intl.formatMessage({id: 'DuePanel.ChFTQQ', defaultMessage: '方糖（Server酱）'})}</option>
                                                <option value='custom'>{intl.formatMessage({id: 'DuePanel.ChCustom', defaultMessage: '自定义 JSON'})}</option>
                                            </select>
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushWhat', defaultMessage: '推送内容（勾选要推送的类别）'})}</label>
                                            <div className='DueSidebar__dayGroup'>
                                                {([['overdue', colors.overdue, pushOverdue], ['soon', colors.soon, pushSoon], ['pending', colors.pending, pushPending]] as const).map(([metric, color, checked]) => {
                                                    const prefs = {overdue: DUE_REMINDER_PREF_PUSH_OVERDUE, soon: DUE_REMINDER_PREF_PUSH_SOON, pending: DUE_REMINDER_PREF_PUSH_PENDING}
                                                    const pref = prefs[metric]
                                                    const labelId = metric === 'overdue' ? 'FloatingReminder.Overdue' : ('FloatingReminder.Soon')
                                                    const labelDefault = metric === 'overdue' ? 'Overdue' : 'Due soon'
                                                    const finalLabelId = metric === 'pending' ? 'DuePanel.Pending' : labelId
                                                    const finalLabelDefault = metric === 'pending' ? '待返' : labelDefault
                                                    return (
                                                        <button
                                                            key={metric}
                                                            type='button'
                                                            className={`DueSidebar__toggle ${checked ? 'active' : ''}`}
                                                            style={{color, borderColor: color}}
                                                            onClick={() => {
                                                                const next = !checked
                                                                if (metric === 'overdue') {
                                                                    setPushOverdue(next)
                                                                } else if (metric === 'soon') {
                                                                    setPushSoon(next)
                                                                } else {
                                                                    setPushPending(next)
                                                                }
                                                                patchSettings({[pref]: next ? 'true' : 'false'})
                                                            }}
                                                        >
                                                            <span className='DueSidebar__box'/>
                                                            <span className='DueSidebar__toggleLabel'>
                                                                {intl.formatMessage({id: finalLabelId, defaultMessage: finalLabelDefault})}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className='DueSidebar__settingRow'>
                                            <label>{intl.formatMessage({id: 'DuePanel.SoonLeadDays', defaultMessage: '临期提醒天数（工作日）'})}</label>
                                            <input
                                                type='number'
                                                min={0}
                                                max={365}
                                                value={leadDays}
                                                onChange={(e) => {
                                                    const value = parseInt(e.target.value, 10)
                                                    if (Number.isFinite(value)) {
                                                        setLeadDays(Math.max(0, Math.min(365, value)))
                                                    }
                                                }}
                                                onBlur={() => patchSettings({[DUE_REMINDER_PREF_LEAD_DAYS]: String(leadDays)})}
                                            />
                                        </div>
                                        <div className='DueSidebar__settingRow'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PendingLeadDays', defaultMessage: '待返提醒天数（工作日）'})}</label>
                                            <input
                                                type='number'
                                                min={0}
                                                max={365}
                                                value={pendingLeadDays}
                                                onChange={(e) => {
                                                    const value = parseInt(e.target.value, 10)
                                                    if (Number.isFinite(value)) {
                                                        setPendingLeadDays(Math.max(0, Math.min(365, value)))
                                                    }
                                                }}
                                                onBlur={() => patchSettings({[DUE_REMINDER_PREF_PENDING_LEAD]: String(pendingLeadDays)})}
                                            />
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushDays', defaultMessage: '推送日（星期）'})}</label>
                                            <div className='DueSidebar__dayGroup'>
                                                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                                                    const active = pushDays.split(',').map((s) => s.trim()).includes(String(day))
                                                    const names = ['一', '二', '三', '四', '五', '六', '日']
                                                    return (
                                                        <button
                                                            key={day}
                                                            type='button'
                                                            className={`DueSidebar__toggle ${active ? 'active' : ''}`}
                                                            style={{color: active ? '#3D5AFE' : undefined, borderColor: active ? '#3D5AFE' : undefined}}
                                                            onClick={() => {
                                                                const set = new Set(pushDays.split(',').map((s) => s.trim()).filter(Boolean))
                                                                if (set.has(String(day))) {
                                                                    set.delete(String(day))
                                                                } else {
                                                                    set.add(String(day))
                                                                }
                                                                const next = [...set].sort().join(',')
                                                                setPushDays(next)
                                                                patchSettings({[DUE_REMINDER_PREF_DAYS]: next})
                                                            }}
                                                        >
                                                            <span className='DueSidebar__toggleLabel'>{names[day - 1]}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className='DueSidebar__settingRow'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushWindow', defaultMessage: '推送时段'})}</label>
                                            <div className='DueSidebar__windowGroup'>
                                                <input
                                                    type='time'
                                                    value={`${String(windowStart).padStart(2, '0')}:00`}
                                                    onChange={(e) => {
                                                        const value = parseInt(e.target.value.split(':')[0] || '0', 10)
                                                        if (Number.isFinite(value)) {
                                                            setWindowStart(Math.max(0, Math.min(23, value)))
                                                            patchSettings({[DUE_REMINDER_PREF_WINDOW_START]: String(Math.max(0, Math.min(23, value)))})
                                                        }
                                                    }}
                                                />
                                                <span>{'–'}</span>
                                                <input
                                                    type='time'
                                                    value={`${String(windowEnd).padStart(2, '0')}:00`}
                                                    onChange={(e) => {
                                                        const value = parseInt(e.target.value.split(':')[0] || '0', 10)
                                                        if (Number.isFinite(value)) {
                                                            setWindowEnd(Math.max(0, Math.min(23, value)))
                                                            patchSettings({[DUE_REMINDER_PREF_WINDOW_END]: String(Math.max(0, Math.min(23, value)))})
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.PushMode', defaultMessage: '检测方式'})}</label>
                                            <div className='DueSidebar__dayGroup'>
                                                <button
                                                    type='button'
                                                    className={`DueSidebar__toggle ${pushMode === 'interval' ? 'active' : ''}`}
                                                    style={{color: pushMode === 'interval' ? '#3D5AFE' : undefined, borderColor: pushMode === 'interval' ? '#3D5AFE' : undefined}}
                                                    onClick={() => {
                                                        setPushMode('interval')
                                                        patchSettings({[DUE_REMINDER_PREF_MODE]: 'interval'})
                                                    }}
                                                >
                                                    <span className='DueSidebar__toggleLabel'>{intl.formatMessage({id: 'DuePanel.ModeInterval', defaultMessage: '间隔检测'})}</span>
                                                </button>
                                                <button
                                                    type='button'
                                                    className={`DueSidebar__toggle ${pushMode === 'daily' ? 'active' : ''}`}
                                                    style={{color: pushMode === 'daily' ? '#3D5AFE' : undefined, borderColor: pushMode === 'daily' ? '#3D5AFE' : undefined}}
                                                    onClick={() => {
                                                        setPushMode('daily')
                                                        patchSettings({[DUE_REMINDER_PREF_MODE]: 'daily'})
                                                    }}
                                                >
                                                    <span className='DueSidebar__toggleLabel'>{intl.formatMessage({id: 'DuePanel.ModeDaily', defaultMessage: '每天定点'})}</span>
                                                </button>
                                            </div>
                                        </div>
                                        {pushMode === 'interval' ? (
                                            <div className='DueSidebar__settingRow'>
                                                <label>{intl.formatMessage({id: 'FloatingReminder.Interval', defaultMessage: 'Interval (min)'})}</label>
                                                <input
                                                    type='number'
                                                    min={1}
                                                    max={1440}
                                                    value={intervalMinutes}
                                                    onChange={(e) => {
                                                        const value = parseInt(e.target.value, 10)
                                                        if (Number.isFinite(value)) {
                                                            setIntervalMinutes(Math.max(1, Math.min(1440, value)))
                                                        }
                                                    }}
                                                    onBlur={() => patchSettings({[DUE_REMINDER_PREF_INTERVAL]: String(intervalMinutes)})}
                                                />
                                            </div>
                                        ) : (
                                            <div className='DueSidebar__settingRow'>
                                                <label>{intl.formatMessage({id: 'DuePanel.DailyTime', defaultMessage: '每天检测时间'})}</label>
                                                <input
                                                    type='time'
                                                    value={dailyTime}
                                                    onChange={(e) => {
                                                        setDailyTime(e.target.value)
                                                        patchSettings({[DUE_REMINDER_PREF_DAILY_TIME]: e.target.value})
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.WebhookAny', defaultMessage: 'Webhook 地址'})}</label>
                                            <input
                                                type='url'
                                                placeholder={webhookPlaceholder(channel)}
                                                value={webhook}
                                                onChange={(e) => setWebhook(e.target.value)}
                                                onBlur={() => patchSettings({[DUE_REMINDER_PREF_WEBHOOK]: webhook.trim()})}
                                            />
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>
                                                {secretConfigured ?
                                                    intl.formatMessage({id: 'FloatingReminder.SecretConfigured', defaultMessage: 'Signing secret (configured)'}) :
                                                    intl.formatMessage({id: 'FloatingReminder.Secret', defaultMessage: 'Signing secret (optional)'})}
                                            </label>
                                            <input
                                                type='password'
                                                placeholder={secretConfigured ? '••••••••' : ''}
                                                value={secret}
                                                onChange={(e) => setSecret(e.target.value)}
                                                onBlur={() => {
                                                    if (secret.trim() !== '') {
                                                        patchSettings({[DUE_REMINDER_PREF_SECRET]: secret.trim()})
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'DuePanel.LinkUrl', defaultMessage: '推送里“打开”链接（反代/公网地址，留空用服务器地址）'})}</label>
                                            <input
                                                type='url'
                                                placeholder='https://boards.example.com/'
                                                value={linkUrl}
                                                onChange={(e) => setLinkUrl(e.target.value)}
                                                onBlur={() => patchSettings({[DUE_REMINDER_PREF_LINK_URL]: linkUrl.trim()})}
                                            />
                                        </div>
                                        <div className='DueSidebar__settingColumn'>
                                            <div className='DueSidebar__dayGroup'>
                                                <button
                                                    type='button'
                                                    className='DueSidebar__testButton'
                                                    onClick={testWebhook}
                                                    disabled={testing}
                                                >
                                                    {testing ?
                                                        intl.formatMessage({id: 'FloatingReminder.Testing', defaultMessage: 'Testing…'}) :
                                                        intl.formatMessage({id: 'FloatingReminder.Test', defaultMessage: 'Send test'})}
                                                </button>
                                                <button
                                                    type='button'
                                                    className='DueSidebar__testButton'
                                                    onClick={sendNow}
                                                    disabled={testing}
                                                    title={intl.formatMessage({id: 'DuePanel.SendNowHint', defaultMessage: '忽略星期/时段/检测方式和当日去重，立即推送当前内容'})}
                                                >
                                                    {intl.formatMessage({id: 'DuePanel.SendNow', defaultMessage: '立即推送'})}
                                                </button>
                                            </div>
                                        </div>
                                        {boardGroups.filter((group) => countablePropertiesFor(group.boardId).length > 0).map((group) => (
                                            <div
                                                className='DueSidebar__settingColumn'
                                                key={group.boardId}
                                            >
                                                <label>{intl.formatMessage({id: 'FloatingReminder.CountByFor', defaultMessage: 'Count by · {board}'}, {board: group.title})}</label>
                                                <select
                                                    value={countProperties[group.boardId] || ''}
                                                    onChange={(e) => {
                                                        const propertyId = e.target.value
                                                        setCountProperties((current) => {
                                                            const next = {...current}
                                                            if (propertyId) {
                                                                next[group.boardId] = propertyId
                                                            } else {
                                                                delete next[group.boardId]
                                                            }
                                                            return next
                                                        })
                                                    }}
                                                >
                                                    <option value=''>{intl.formatMessage({id: 'FloatingReminder.CountByNone', defaultMessage: 'Off'})}</option>
                                                    {countablePropertiesFor(group.boardId).map((property) => (
                                                        <option
                                                            key={property.id}
                                                            value={property.id}
                                                        >
                                                            {property.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                        {dueDateSettingBoards.map((board) => (
                                            <div
                                                className='DueSidebar__settingColumn'
                                                key={`due-date-${board.id}`}
                                            >
                                                <label>{intl.formatMessage({id: 'DuePanel.DueDateFor', defaultMessage: '逾期/临期日期 · {board}'}, {board: board.title})}</label>
                                                <select
                                                    value={dueDateProperties[board.id] || ''}
                                                    onChange={(e) => saveDueDateProperty(board.id, e.target.value)}
                                                >
                                                    <option value=''>{intl.formatMessage({id: 'DuePanel.DueDateAuto', defaultMessage: '自动识别'})}</option>
                                                    {board.cardProperties.filter((property) => property.type === 'date').map((property) => (
                                                        <option
                                                            key={property.id}
                                                            value={property.id}
                                                        >
                                                            {property.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <label>{intl.formatMessage({id: 'DuePanel.PendingDateFor', defaultMessage: '待返日期 · {board}'}, {board: board.title})}</label>
                                                <select
                                                    value={pendingProperties[board.id] || ''}
                                                    onChange={(e) => savePendingDateProperty(board.id, e.target.value)}
                                                >
                                                    <option value=''>{intl.formatMessage({id: 'DuePanel.PendingDateNone', defaultMessage: '不启用'})}</option>
                                                    {board.cardProperties.filter((property) => property.type === 'date').map((property) => (
                                                        <option
                                                            key={property.id}
                                                            value={property.id}
                                                        >
                                                            {property.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                        <div className='DueSidebar__actualHint'>
                                            {intl.formatMessage({id: 'DuePanel.DueDateHint', defaultMessage: '逾期/临期：按所选日期 + 临期提醒天数（工作日）推算；待返：按所选待返日期 + 待返提醒天数（工作日）计算超时。'})}
                                        </div>
                                        {actualSettingBoards.map((board) => {
                                            const setting = resolveActualCompletionSetting(board, actualSettings[board.id])
                                            const statusTemplates = board.cardProperties.filter((p) => p.type === 'select' || p.type === 'multiSelect')
                                            const statusTemplate = statusTemplates.find((p) => p.id === setting.statusPropertyId)
                                            const dateTemplates = board.cardProperties.filter((p) => p.type === 'date')
                                            return (
                                                <details
                                                    className='DueSidebar__actual'
                                                    key={`actual-${board.id}`}
                                                >
                                                    <summary>
                                                        <span>{intl.formatMessage({id: 'DuePanel.ActualDateFor', defaultMessage: '实际完成日期 · {board}'}, {board: board.title})}</span>
                                                        <span className={`DueSidebar__actualState ${setting.enabled ? 'on' : ''}`}>
                                                            {setting.enabled ?
                                                                intl.formatMessage({id: 'DuePanel.ActualEnabled', defaultMessage: '已启用'}) :
                                                                intl.formatMessage({id: 'DuePanel.ActualDisabled', defaultMessage: '未启用'})}
                                                        </span>
                                                    </summary>
                                                    <div className='DueSidebar__settingRow'>
                                                        <label>{intl.formatMessage({id: 'DuePanel.ActualEnable', defaultMessage: '自动填写'})}</label>
                                                        <button
                                                            type='button'
                                                            className={`DueSidebar__switch ${setting.enabled ? 'on' : ''}`}
                                                            onClick={() => updateActualSetting(board.id, {enabled: !setting.enabled})}
                                                        >
                                                            <span/>
                                                        </button>
                                                    </div>
                                                    <div className='DueSidebar__settingColumn'>
                                                        <label>{intl.formatMessage({id: 'DuePanel.ActualStatusProperty', defaultMessage: '状态属性'})}</label>
                                                        <select
                                                            value={setting.statusPropertyId}
                                                            onChange={(e) => {
                                                                const statusPropertyId = e.target.value
                                                                const template = statusTemplates.find((p) => p.id === statusPropertyId)
                                                                updateActualSetting(board.id, {
                                                                    statusPropertyId,
                                                                    completedOptionId: detectCompletedOption(template),
                                                                })
                                                            }}
                                                        >
                                                            <option value=''>{'—'}</option>
                                                            {statusTemplates.map((property) => (
                                                                <option
                                                                    key={property.id}
                                                                    value={property.id}
                                                                >
                                                                    {property.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className='DueSidebar__settingColumn'>
                                                        <label>{intl.formatMessage({id: 'DuePanel.ActualCompletedOption', defaultMessage: '完成选项'})}</label>
                                                        <select
                                                            value={setting.completedOptionId}
                                                            disabled={!statusTemplate}
                                                            onChange={(e) => updateActualSetting(board.id, {completedOptionId: e.target.value})}
                                                        >
                                                            <option value=''>{'—'}</option>
                                                            {statusTemplate?.options.map((option) => (
                                                                <option
                                                                    key={option.id}
                                                                    value={option.id}
                                                                >
                                                                    {option.value}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className='DueSidebar__settingColumn'>
                                                        <label>{intl.formatMessage({id: 'DuePanel.ActualDateProperty', defaultMessage: '日期属性'})}</label>
                                                        <select
                                                            value={setting.datePropertyId}
                                                            disabled={dateTemplates.length === 0}
                                                            onChange={(e) => updateActualSetting(board.id, {datePropertyId: e.target.value})}
                                                        >
                                                            <option value=''>{'—'}</option>
                                                            {dateTemplates.map((property) => (
                                                                <option
                                                                    key={property.id}
                                                                    value={property.id}
                                                                >
                                                                    {property.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className='DueSidebar__actualHint'>
                                                        {intl.formatMessage({id: 'DuePanel.ActualHint', defaultMessage: '状态改为“已完成”时写入当天日期；改为其他状态时清空。'})}
                                                    </div>
                                                </details>
                                            )
                                        })}
                                        {dueDateSettingBoards.map((board) => {
                                            const dateProps = board.cardProperties.filter((p) => p.type === 'date')
                                            if (dateProps.length < 2) {
                                                return null
                                            }
                                            const setting = resolveWorkdaysSetting(board, workdaysSettings[board.id])
                                            return (
                                                <details
                                                    className='DueSidebar__actual'
                                                    key={`workdays-${board.id}`}
                                                >
                                                    <summary>
                                                        <span>{intl.formatMessage({id: 'DuePanel.WorkdaysFor', defaultMessage: '工时 · {board}'}, {board: board.title})}</span>
                                                        <span className='DueSidebar__actualState'>
                                                            {intl.formatMessage({id: 'DuePanel.WorkdaysUnit', defaultMessage: '工作日'})}
                                                        </span>
                                                    </summary>
                                                    <div className='DueSidebar__settingColumn'>
                                                        <label>{intl.formatMessage({id: 'DuePanel.WorkdaysStart', defaultMessage: '开始日期属性'})}</label>
                                                        <select
                                                            value={setting.startPropertyId}
                                                            onChange={(e) => saveWorkdaysSetting(board.id, {startPropertyId: e.target.value})}
                                                        >
                                                            <option value=''>{'—'}</option>
                                                            {dateProps.map((property) => (
                                                                <option
                                                                    key={property.id}
                                                                    value={property.id}
                                                                >
                                                                    {property.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <label>{intl.formatMessage({id: 'DuePanel.WorkdaysEnd', defaultMessage: '结束日期属性'})}</label>
                                                        <select
                                                            value={setting.endPropertyId}
                                                            onChange={(e) => saveWorkdaysSetting(board.id, {endPropertyId: e.target.value})}
                                                        >
                                                            <option value=''>{'—'}</option>
                                                            {dateProps.map((property) => (
                                                                <option
                                                                    key={property.id}
                                                                    value={property.id}
                                                                >
                                                                    {property.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className='DueSidebar__actualHint'>
                                                        {intl.formatMessage({id: 'DuePanel.WorkdaysHint', defaultMessage: '按所选两个日期属性计算工作日跨度（含首尾、跳过周六日）。在表头“添加属性”里选“工时（工作日）”即可在卡片和表格中显示。'})}
                                                    </div>
                                                </details>
                                            )
                                        })}
                                        <div className='DueSidebar__settingColumn'>
                                            <label>{intl.formatMessage({id: 'FloatingReminder.Colors', defaultMessage: 'Colors'})}</label>
                                            <div className='DueSidebar__colorGroup'>
                                                <input
                                                    type='color'
                                                    value={colors.overdue}
                                                    title={intl.formatMessage({id: 'FloatingReminder.OverdueColor', defaultMessage: 'Overdue'})}
                                                    onChange={(e) => setColors({...colors, overdue: e.target.value})}
                                                />
                                                <input
                                                    type='color'
                                                    value={colors.soon}
                                                    title={intl.formatMessage({id: 'FloatingReminder.SoonColor', defaultMessage: 'Due soon'})}
                                                    onChange={(e) => setColors({...colors, soon: e.target.value})}
                                                />
                                                <input
                                                    type='color'
                                                    value={colors.borderOverdue}
                                                    title={intl.formatMessage({id: 'FloatingReminder.BorderOverdue', defaultMessage: 'Overdue card border'})}
                                                    onChange={(e) => setColors({...colors, borderOverdue: e.target.value})}
                                                />
                                                <input
                                                    type='color'
                                                    value={colors.borderSoon}
                                                    title={intl.formatMessage({id: 'FloatingReminder.BorderSoon', defaultMessage: 'Due soon card border'})}
                                                    onChange={(e) => setColors({...colors, borderSoon: e.target.value})}
                                                />
                                                <input
                                                    type='color'
                                                    value={colors.pending}
                                                    title={intl.formatMessage({id: 'DuePanel.PendingColor', defaultMessage: '待返'})}
                                                    onChange={(e) => setColors({...colors, pending: e.target.value})}
                                                />
                                                <input
                                                    type='color'
                                                    value={colors.borderPending}
                                                    title={intl.formatMessage({id: 'DuePanel.BorderPending', defaultMessage: '待返卡片边框'})}
                                                    onChange={(e) => setColors({...colors, borderPending: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div className='DueSidebar__status'>
                                            {saving ?
                                                intl.formatMessage({id: 'FloatingReminder.Saving', defaultMessage: 'Saving…'}) :
                                                notice}
                                        </div>
                                    </div>}
                            </div>
                        </aside>
                    </>}
            </div>
            {leavePopup &&
                <LeaveCalendar
                    mode='popup'
                    anchorRect={leavePopup}
                    onClose={() => setLeavePopup(null)}
                />}
            {leavePinned &&
                <LeaveCalendar
                    mode='pinned'
                    onClose={() => setLeavePinned(false)}
                />}
        </div>
    )
}

export default React.memo(DueLayout)
