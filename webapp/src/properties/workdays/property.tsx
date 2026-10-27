// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl'

import {IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {Options} from '../../components/calculations/options'
import {Utils} from '../../utils'

import {PropertyTypeEnum, PropertyType} from '../types'

import WorkdaysComponent from './workdays'

export default class WorkdaysProperty extends PropertyType {
    Editor = WorkdaysComponent
    name = 'Workdays'
    type = 'workdays' as PropertyTypeEnum
    isReadOnly = true
    calculationOptions = [Options.none]
    displayName = (intl: IntlShape) => intl.formatMessage({id: 'PropertyType.Workdays', defaultMessage: '工时（工作日）'})

    displayValue = (_value: string | string[] | undefined, _card: Card, _template: IPropertyTemplate, intl: IntlShape) => {
        return intl.formatMessage({id: 'Workdays.Export', defaultMessage: 'Computed from two date properties'})
    }

    valueLength = (_value: string | string[] | undefined, _card: Card, _template: IPropertyTemplate, intl: IntlShape, fontDescriptor: string) => {
        return Utils.getTextWidth(intl.formatMessage({id: 'Workdays.Days', defaultMessage: '{days} 天'}, {days: 999}), fontDescriptor)
    }
}
