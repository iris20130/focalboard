// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import Label from '../../widgets/label'
import {getActualCompletionSetting} from '../../actualCompletion'

import {PropertyProps} from '../types'

import {getCardDueStatus} from './utils'

const DueStatusComponent = (props: PropertyProps): JSX.Element => {
    const {board, card, showEmptyPlaceholder} = props
    const intl = useIntl()

    const rawStatus = getCardDueStatus(card, board.cardProperties)
    const completion = getActualCompletionSetting(board)
    const completed = Boolean(
        completion.enabled &&
        completion.statusPropertyId &&
        completion.completedOptionId &&
        card.fields.properties[completion.statusPropertyId] === completion.completedOptionId,
    )
    const status = completed && (rawStatus.id === 'overdue' || rawStatus.id === 'today' || rawStatus.id === 'soon') ?
        {id: 'normal' as const, days: 0} :
        rawStatus

    let color = 'propColorGreen'
    let text = intl.formatMessage({id: 'DueStatus.Normal', defaultMessage: 'On track'})
    if (status.id === 'overdue') {
        color = 'propColorRed'
        text = intl.formatMessage({id: 'DueStatus.Overdue', defaultMessage: 'Overdue by {days}d'}, {days: status.days})
    } else if (status.id === 'today') {
        color = 'propColorOrange'
        text = intl.formatMessage({id: 'DueStatus.Today', defaultMessage: 'Due today'})
    } else if (status.id === 'soon') {
        color = 'propColorYellow'
        text = intl.formatMessage({id: 'DueStatus.Soon', defaultMessage: 'Due in {days}d'}, {days: status.days})
    } else if (status.id === 'none') {
        if (!showEmptyPlaceholder) {
            return <div className='octo-propertyvalue'/>
        }
        color = 'empty'
        text = intl.formatMessage({id: 'DueStatus.NoDate', defaultMessage: 'No due date'})
    }

    return (
        <div
            className='octo-propertyvalue'
            data-testid='due-status'
        >
            <Label color={color}>
                <span className='Label-text'>{text}</span>
            </Label>
        </div>
    )
}

export default DueStatusComponent
