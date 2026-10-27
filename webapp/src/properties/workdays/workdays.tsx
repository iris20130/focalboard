// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import {getWorkdaysSetting, workdaysBetween} from '../../workdays'

import DateProperty from '../date/property'
import {PropertyProps} from '../types'

const dateProperty = new DateProperty()

const WorkdaysComponent = (props: PropertyProps): JSX.Element => {
    const {board, card, showEmptyPlaceholder} = props
    const intl = useIntl()
    const setting = getWorkdaysSetting(board)
    const startTemplate = board.cardProperties.find((p) => p.id === setting.startPropertyId && p.type === 'date')
    const endTemplate = board.cardProperties.find((p) => p.id === setting.endPropertyId && p.type === 'date')

    if (!startTemplate || !endTemplate) {
        if (!showEmptyPlaceholder) {
            return <div className='octo-propertyvalue'/>
        }
        return (
            <div className='octo-propertyvalue'>
                <span style={{opacity: 0.5}}>
                    {intl.formatMessage({id: 'Workdays.NotConfigured', defaultMessage: '在右侧栏选择两个日期属性'})}
                </span>
            </div>
        )
    }

    const startValue = card.fields.properties[startTemplate.id]
    const endValue = card.fields.properties[endTemplate.id]
    const startDate = dateProperty.getDateFrom(startValue)
    const endDate = dateProperty.getDateTo(endValue) || dateProperty.getDateFrom(endValue)

    if (!startDate || !endDate) {
        return <div className='octo-propertyvalue'/>
    }

    const days = workdaysBetween(startDate, endDate)
    return (
        <div
            className='octo-propertyvalue'
            data-testid='workdays'
        >
            {intl.formatMessage({id: 'Workdays.Days', defaultMessage: '{days} 天'}, {days})}
        </div>
    )
}

export default WorkdaysComponent
