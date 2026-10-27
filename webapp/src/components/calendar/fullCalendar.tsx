// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {useIntl} from 'react-intl'

import FullCalendar, {EventChangeArg, EventInput, EventContentArg, DayCellContentArg} from '@fullcalendar/react'

import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'

import {DatePropertyType} from '../../properties/types'

import mutator from '../../mutator'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import {HolidayInfo, loadHolidays, readHolidayCache, toDateKey} from '../../holidays'
import octoClient from '../../octoClient'
import {LeaveRecord, LeaveSettings, LunarDay, getLunarYear, leaveColor, leaveDayMarks, leaveMarkLabel} from '../../leaves'
import {DateProperty} from '../../properties/date/date'
import propsRegistry from '../../properties'
import Tooltip from '../../widgets/tooltip'
import PropertyValueElement from '../propertyValueElement'
import {Constants, Permission} from '../../constants'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import CardBadges from '../cardBadges'
import ConfirmationDialogBox, {ConfirmationDialogBoxProps} from '../confirmationDialogBox'

import './fullcalendar.scss'
import MenuWrapper from '../../widgets/menuWrapper'
import CardActionsMenu from '../cardActionsMenu/cardActionsMenu'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'
import CardActionsMenuIcon from '../cardActionsMenu/cardActionsMenuIcon'

const oneDay = 60 * 60 * 24 * 1000

type Props = {
    board: Board
    cards: Card[]
    activeView: BoardView
    readonly: boolean
    initialDate?: Date
    dateDisplayProperty?: IPropertyTemplate
    dateDisplayProperties?: IPropertyTemplate[]
    showCard: (cardId: string) => void
    addCard: (properties: Record<string, string>) => void
}

function createDatePropertyFromCalendarDates(start: Date, end: Date): DateProperty {
    // save as noon local, expected from the date picker
    start.setHours(12)
    const dateFrom = start.getTime() - timeZoneOffset(start.getTime())
    end.setHours(12)
    const dateTo = end.getTime() - timeZoneOffset(end.getTime()) - oneDay // subtract one day. Calendar is date exclusive

    const dateProperty: DateProperty = {from: dateFrom}
    if (dateTo !== dateFrom) {
        dateProperty.to = dateTo
    }
    return dateProperty
}

function createDatePropertyFromCalendarDate(start: Date): DateProperty {
    // save as noon local, expected from the date picker
    start.setHours(12)
    const dateFrom = start.getTime() - timeZoneOffset(start.getTime())

    const dateProperty: DateProperty = {from: dateFrom}
    return dateProperty
}

const timeZoneOffset = (date: number): number => {
    return new Date(date).getTimezoneOffset() * 60 * 1000
}

const CalendarFullView = (props: Props): JSX.Element|null => {
    const intl = useIntl()
    const {board, cards, activeView, dateDisplayProperty, readonly} = props
    const isSelectable = !readonly
    const canAddCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const [showConfirmationDialogBox, setShowConfirmationDialogBox] = useState<boolean>(false)
    const [cardItem, setCardItem] = useState<Card>()
    const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>(() => readHolidayCache())
    const [lunar, setLunar] = useState<Record<string, LunarDay>>({})
    const [lunarYear, setLunarYear] = useState(new Date().getFullYear())
    const [leaveMarks, setLeaveMarks] = useState<Record<string, LeaveRecord[]>>({})
    const [leaveSettings, setLeaveSettings] = useState<LeaveSettings|undefined>(undefined)

    useEffect(() => {
        let cancelled = false
        loadHolidays().then((days) => {
            if (!cancelled) {
                setHolidays(days)
            }
        }).catch(() => {
            // calendar still works without holiday decorations
        })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        Promise.all([getLunarYear(lunarYear - 1), getLunarYear(lunarYear), getLunarYear(lunarYear + 1)]).then((maps) => {
            if (!cancelled) {
                setLunar(Object.assign({}, maps[0], maps[1], maps[2]))
            }
        })
        return () => {
            cancelled = true
        }
    }, [lunarYear])

    useEffect(() => {
        let cancelled = false
        const reload = () => {
            octoClient.getLeaveSummary().then((summary) => {
                if (!cancelled && summary) {
                    setLeaveMarks(leaveDayMarks(summary.records))
                    setLeaveSettings(summary.settings)
                }
            })
        }
        reload()
        window.addEventListener('focalboard-leaves-updated', reload)
        return () => {
            cancelled = true
            window.removeEventListener('focalboard-leaves-updated', reload)
        }
    }, [])

    const visiblePropertyTemplates = useMemo(() => (
        board.cardProperties.filter((template: IPropertyTemplate) => activeView.fields.visiblePropertyIds.includes(template.id))
    ), [board.cardProperties, activeView.fields.visiblePropertyIds])

    let {initialDate} = props
    if (!initialDate) {
        initialDate = new Date()
    }

    const dateProperties = useMemo(() => {
        if (props.dateDisplayProperties && props.dateDisplayProperties.length > 0) {
            return props.dateDisplayProperties
        }
        return dateDisplayProperty ? [dateDisplayProperty] : []
    }, [props.dateDisplayProperties, dateDisplayProperty])

    const isEditable = useCallback((): boolean => {
        const primary = dateProperties[0]
        if (readonly || dateProperties.length > 1 || !primary || propsRegistry.get(primary.type).isReadOnly) {
            return false
        }
        return true
    }, [readonly, dateProperties])

    const myEventsList = useMemo(() => (
        cards.flatMap((card): EventInput[] => {
            if (dateProperties.length === 0) {
                const created = new Date(card.createAt || 0)
                const createdEnd = new Date(created.getTime() + oneDay)
                return [{
                    id: card.id,
                    title: card.title,
                    extendedProps: {icon: card.fields.icon, cardId: card.id, datePropertyId: ''},
                    properties: card.fields.properties,
                    allDay: true,
                    start: created,
                    end: createdEnd,
                }]
            }

            // One bar per card: from the earliest displayed date to the latest one,
            // so start/end property pairs render like a Gantt bar.
            let barStart: Date | undefined
            let barEnd: Date | undefined
            let primaryPropertyId = ''
            dateProperties.forEach((template) => {
                const property = propsRegistry.get(template.type)
                if (!(property instanceof DatePropertyType)) {
                    return
                }
                const value = card.fields.properties[template.id]
                const dateFrom = property.getDateFrom(value, card)
                if (!dateFrom) {
                    return
                }
                const dateTo = property.getDateTo(value, card) || dateFrom
                if (!barStart || dateFrom.getTime() < barStart.getTime()) {
                    barStart = dateFrom
                    primaryPropertyId = template.id
                }
                if (!barEnd || dateTo.getTime() > barEnd.getTime()) {
                    barEnd = dateTo
                }
            })
            if (!barStart || !barEnd) {
                return []
            }
            const barEndExclusive = new Date(barEnd)
            barEndExclusive.setDate(barEndExclusive.getDate() + 1)

            return [{
                id: card.id,
                title: card.title,
                extendedProps: {
                    icon: card.fields.icon,
                    cardId: card.id,
                    datePropertyId: primaryPropertyId,
                },
                properties: card.fields.properties,
                allDay: true,
                start: barStart,
                end: barEndExclusive,
            }]
        })
    ), [cards, dateProperties])

    const visibleBadges = activeView.fields.visiblePropertyIds.includes(Constants.badgesColumnId)

    const openConfirmationDialogBox = (card: Card) => {
        setShowConfirmationDialogBox(true)
        setCardItem(card)
    }

    const handleDeleteCard = useCallback(() => {
        if (!cardItem) {
            return
        }
        mutator.deleteBlock(cardItem, 'delete card')
        setShowConfirmationDialogBox(false)
    }, [cardItem, board.id])

    const confirmDialogProps: ConfirmationDialogBoxProps = useMemo(() => {
        return {
            heading: intl.formatMessage({id: 'CardDialog.delete-confirmation-dialog-heading', defaultMessage: 'Confirm card delete!'}),
            confirmButtonText: intl.formatMessage({id: 'CardDialog.delete-confirmation-dialog-button-text', defaultMessage: 'Delete'}),
            onConfirm: handleDeleteCard,
            onClose: () => {
                setShowConfirmationDialogBox(false)
            },
        }
    }, [handleDeleteCard])

    const renderEventContent = (eventProps: EventContentArg): JSX.Element|null => {
        const {event} = eventProps
        const cardId = (event.extendedProps.cardId as string) || event.id
        const card = cards.find((o) => o.id === cardId) || cards[0]

        return (
            <>
                <div
                    className='EventContent'
                    data-card-id={cardId}
                    onClick={() => props.showCard(cardId)}
                >
                    {!props.readonly &&
                    <MenuWrapper
                        className='optionsMenu'
                        stopPropagationOnToggle={true}
                    >
                        <CardActionsMenuIcon/>
                        <CardActionsMenu
                            cardId={card.id}
                            boardId={card.boardId}
                            onClickDelete={() => openConfirmationDialogBox(card)}
                            onClickDuplicate={() => {
                                TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DuplicateCard, {board: board.id, card: card.id})
                                mutator.duplicateCard(card.id, board.id)
                            }}
                        />
                    </MenuWrapper>}
                    <div className='octo-icontitle'>
                        { event.extendedProps.icon ? <div className='octo-icon'>{event.extendedProps.icon}</div> : undefined }
                        <div
                            className='fc-event-title'
                            key='__title'
                        >{event.title || intl.formatMessage({id: 'CalendarCard.untitled', defaultMessage: 'Untitled'})}</div>
                    </div>
                    {visiblePropertyTemplates.map((template) => (
                        <Tooltip
                            key={template.id}
                            title={template.name}
                        >
                            <PropertyValueElement
                                board={board}
                                readOnly={true}
                                card={card}
                                propertyTemplate={template}
                                showEmptyPlaceholder={false}
                            />
                        </Tooltip>
                    ))}
                    {visibleBadges &&
                    <CardBadges card={card}/> }
                </div>
            </>
        )
    }

    const eventChange = useCallback((eventProps: EventChangeArg) => {
        const {event} = eventProps
        if (!event.start) {
            return
        }
        if (!event.end) {
            return
        }

        const startDate = new Date(event.start.getTime())
        const endDate = new Date(event.end.getTime())
        const dateProperty = createDatePropertyFromCalendarDates(startDate, endDate)
        const cardId = (event.extendedProps.cardId as string) || event.id
        const propertyId = (event.extendedProps.datePropertyId as string) || dateProperties[0]?.id
        const card = cards.find((o) => o.id === cardId)
        if (card && propertyId) {
            mutator.changePropertyValue(board.id, card, propertyId, JSON.stringify(dateProperty))
        }
    }, [cards, dateProperties, board.id])

    const onNewEvent = useCallback((args: {start: Date, end: Date}) => {
        let dateProperty: DateProperty
        if (args.start === args.end) {
            dateProperty = createDatePropertyFromCalendarDate(args.start)
        } else {
            dateProperty = createDatePropertyFromCalendarDates(args.start, args.end)
            if (dateProperty.to === undefined) {
                return
            }
        }

        const properties: Record<string, string> = {}
        const targetProperty = dateProperties[0]
        if (targetProperty) {
            properties[targetProperty.id] = JSON.stringify(dateProperty)
        }

        props.addCard(properties)
    }, [props.addCard, dateProperties])

    const toolbar = useMemo(() => ({
        left: 'title',
        center: '',
        right: 'dayGridWeek dayGridMonth prev,today,next',
    }), [])

    const buttonText = useMemo(() => ({
        today: intl.formatMessage({id: 'calendar.today', defaultMessage: 'TODAY'}),
        month: intl.formatMessage({id: 'calendar.month', defaultMessage: 'Month'}),
        week: intl.formatMessage({id: 'calendar.week', defaultMessage: 'Week'}),
    }), [])

    const dayCellContent = useCallback((args: DayCellContentArg): JSX.Element|null => {
        const key = toDateKey(args.date)
        const holiday = holidays[key]
        const lunarInfo = lunar[key]
        const marks = leaveMarks[key] || []
        return (
            <div className={'dateContainer ' + (canAddCards ? 'with-plus' : '')}>
                <div
                    className='addEvent'
                    onClick={() => onNewEvent({start: args.date, end: args.date})}
                >
                    {'+'}
                </div>
                <div className='dateMeta'>
                    <div className='dateDisplay'>
                        {args.dayNumberText}
                    </div>
                    {holiday &&
                        <span className={`holidayTag ${holiday.offDay ? 'isOff' : 'isWork'}`}>
                            {holiday.offDay ? holiday.name : intl.formatMessage({id: 'calendar.makeupWorkday', defaultMessage: '班'})}
                        </span>}
                    {!holiday && lunarInfo?.term &&
                        <span className='termTag' style={{color: leaveColor(leaveSettings, 'term')}}>{lunarInfo.term}</span>}
                    {marks.map((record) => {
                        const label = leaveMarkLabel(record)
                        return label.text ? (
                            <span
                                key={record.id}
                                className='leaveTag'
                                style={{color: leaveColor(leaveSettings, label.colorKey)}}
                            >{label.text}</span>
                        ) : null
                    })}
                </div>
            </div>
        )
    }, [canAddCards, holidays, lunar, leaveMarks, leaveSettings, intl])

    return (
        <div
            className='CalendarContainer'
        >
            <FullCalendar
                key={activeView.id}
                dayCellContent={dayCellContent}
                dayMaxEventRows={5}
                initialDate={initialDate}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView='dayGridMonth'
                events={myEventsList}
                editable={isEditable()}
                eventResizableFromStart={isEditable()}
                headerToolbar={toolbar}
                buttonText={buttonText}
                eventContent={renderEventContent}
                eventChange={eventChange}
                selectable={isSelectable}
                selectMirror={true}
                select={onNewEvent}
                datesSet={() => setLunarYear(new Date().getFullYear())}
            />
            {showConfirmationDialogBox && <ConfirmationDialogBox dialogBox={confirmDialogProps}/>}
        </div>
    )
}

export default CalendarFullView
