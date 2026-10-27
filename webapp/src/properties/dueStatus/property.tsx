// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {IPropertyOption, IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {Options} from '../../components/calculations/options'
import {Utils} from '../../utils'

import {PropertyTypeEnum, PropertyType} from '../types'

import DueStatusComponent from './dueStatus'

export function getDueStatusFilterOptions(intl: IntlShape): IPropertyOption[] {
    return [
        {id: 'overdue', value: intl.formatMessage({id: 'DueStatus.OverdueFilter', defaultMessage: 'Overdue'}), color: 'propColorRed'},
        {id: 'today', value: intl.formatMessage({id: 'DueStatus.TodayFilter', defaultMessage: 'Due today'}), color: 'propColorOrange'},
        {id: 'soon', value: intl.formatMessage({id: 'DueStatus.SoonFilter', defaultMessage: 'Due soon'}), color: 'propColorYellow'},
        {id: 'normal', value: intl.formatMessage({id: 'DueStatus.NormalFilter', defaultMessage: 'On track'}), color: 'propColorGreen'},
        {id: 'none', value: intl.formatMessage({id: 'DueStatus.NoDateFilter', defaultMessage: 'No due date'}), color: 'propColorGray'},
    ]
}

export default class DueStatusProperty extends PropertyType {
    Editor = DueStatusComponent
    name = 'Due status'
    type = 'dueStatus' as PropertyTypeEnum
    canFilter = true
    filterValueType = 'options' as const
    isReadOnly = true
    calculationOptions = [Options.none]
    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.DueStatus', defaultMessage: 'Due status'})

    displayValue = (_value: string | string[] | undefined, _card: Card, _template: IPropertyTemplate, intl: IntlShape) => {
        return intl.formatMessage({id: 'DueStatus.Export', defaultMessage: 'Computed from due date'})
    }

    valueLength = (_value: string | string[] | undefined, _card: Card, _template: IPropertyTemplate, intl: IntlShape, fontDescriptor: string) => {
        return Utils.getTextWidth(intl.formatMessage({id: 'DueStatus.Overdue', defaultMessage: 'Overdue by {days}d'}, {days: 99}), fontDescriptor)
    }
}
