// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {DatePropertyType} from '../../properties/types'

import {IPropertyTemplate} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import MenuWrapper from '../../widgets/menuWrapper'
import CheckIcon from '../../widgets/icons/check'

import propsRegistry from '../../properties'

type Props = {
    properties: readonly IPropertyTemplate[]
    activeView: BoardView
    dateDisplayPropertyName?: string
}

const ViewHeaderDisplayByMenu = (props: Props) => {
    const {properties, activeView} = props
    const intl = useIntl()

    const createdDateName = propsRegistry.get('createdTime').displayName(intl)

    const dateProperties = useMemo(() => (
        properties?.filter((o: IPropertyTemplate) => propsRegistry.get(o.type) instanceof DatePropertyType) || []
    ), [properties])

    const selectedIds = useMemo(() => {
        const ids = activeView.fields.dateDisplayPropertyIds
        if (ids && ids.length > 0) {
            return ids
        }
        if (activeView.fields.dateDisplayPropertyId) {
            return [activeView.fields.dateDisplayPropertyId]
        }
        return []
    }, [activeView.fields.dateDisplayPropertyIds, activeView.fields.dateDisplayPropertyId])

    const label = useMemo(() => {
        if (selectedIds.length === 0) {
            return props.dateDisplayPropertyName || createdDateName
        }
        const names = selectedIds.
            map((id) => dateProperties.find((property) => property.id === id)?.name).
            filter((name): name is string => Boolean(name))
        return names.length > 0 ? names.join('、') : createdDateName
    }, [selectedIds, dateProperties, createdDateName, props.dateDisplayPropertyName])

    const toggle = useCallback((propertyId: string) => {
        const next = selectedIds.includes(propertyId) ?
            selectedIds.filter((id) => id !== propertyId) :
            [...selectedIds, propertyId]
        if (next.length === 0) {
            return
        }
        mutator.changeViewDateDisplayPropertyIds(
            activeView.boardId,
            activeView.id,
            activeView.fields.dateDisplayPropertyIds || (activeView.fields.dateDisplayPropertyId ? [activeView.fields.dateDisplayPropertyId] : undefined),
            next,
        )
    }, [activeView, selectedIds])

    return (
        <MenuWrapper>
            <Button>
                <FormattedMessage
                    id='ViewHeader.display-by'
                    defaultMessage='Display by: {property}'
                    values={{
                        property: (
                            <span
                                style={{color: 'rgb(var(--center-channel-color-rgb))'}}
                                id='displayByLabel'
                            >
                                {label}
                            </span>
                        ),
                    }}
                />
            </Button>
            <div
                className='ViewHeaderDisplayByMenu__panel'
                onClick={(e) => e.stopPropagation()}
            >
                {dateProperties.map((date: IPropertyTemplate) => {
                    const checked = selectedIds.includes(date.id)
                    return (
                        <div
                            key={date.id}
                            role='button'
                            className={`ViewHeaderDisplayByMenu__item ${checked ? 'checked' : ''}`}
                            onClick={() => toggle(date.id)}
                        >
                            <span className='ViewHeaderDisplayByMenu__check'>{checked && <CheckIcon/>}</span>
                            <span className='ViewHeaderDisplayByMenu__name'>{date.name}</span>
                        </div>
                    )
                })}
                {dateProperties.length === 0 &&
                    <div className='ViewHeaderDisplayByMenu__empty'>
                        {intl.formatMessage({id: 'ViewHeader.display-by-empty', defaultMessage: 'No date property on this board'})}
                    </div>}
            </div>
        </MenuWrapper>
    )
}

export default React.memo(ViewHeaderDisplayByMenu)
