// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'

import {Constants} from '../../constants'
import FocalboardLogoIcon from '../../widgets/icons/focalboard_logo'
import CloseIcon from '../../widgets/icons/close'

import './aboutDialog.scss'

const OFFICIAL_URL = 'https://github.com/mattermost/focalboard'
const CONTACT_EMAIL = 'chenxianyao2013@gmail.com'

type Props = {
    onClose: () => void
}

const AboutDialog = (props: Props): JSX.Element => {
    const intl = useIntl()
    const [tab, setTab] = useState<'about' | 'usage'>('about')

    return (
        <div
            className='AboutDialog__backdrop'
            onClick={props.onClose}
        >
            <div
                className='AboutDialog'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='AboutDialog__header'>
                    <div className='AboutDialog__brand'>
                        <FocalboardLogoIcon/>
                        <div>
                            <div className='AboutDialog__title'>Focalboard</div>
                            <div className='AboutDialog__version'>{`v${Constants.versionString}`}</div>
                        </div>
                    </div>
                    <button
                        type='button'
                        className='AboutDialog__close'
                        onClick={props.onClose}
                        aria-label={intl.formatMessage({id: 'About.Close', defaultMessage: 'Close'})}
                    >
                        <CloseIcon/>
                    </button>
                </div>

                <div className='AboutDialog__tabs'>
                    <button
                        type='button'
                        className={tab === 'about' ? 'active' : ''}
                        onClick={() => setTab('about')}
                    >
                        {intl.formatMessage({id: 'About.TabAbout', defaultMessage: 'About'})}
                    </button>
                    <button
                        type='button'
                        className={tab === 'usage' ? 'active' : ''}
                        onClick={() => setTab('usage')}
                    >
                        {intl.formatMessage({id: 'About.TabUsage', defaultMessage: 'Usage & copyright'})}
                    </button>
                </div>

                {tab === 'about' &&
                    <div className='AboutDialog__body'>
                        <p>
                            <FormattedMessage
                                id='About.Description'
                                defaultMessage='Focalboard is an open source, multilingual, self-hosted project management tool that helps teams plan and track work.'
                            />
                        </p>

                        <div className='AboutDialog__field'>
                            <span className='AboutDialog__label'>
                                <FormattedMessage id='About.OfficialSite' defaultMessage='Official project'/>
                            </span>
                            <a
                                href={OFFICIAL_URL}
                                target='_blank'
                                rel='noreferrer'
                            >
                                {OFFICIAL_URL}
                            </a>
                        </div>

                        <div className='AboutDialog__field'>
                            <span className='AboutDialog__label'>
                                <FormattedMessage id='About.Contact' defaultMessage='Contact'/>
                            </span>
                            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                        </div>

                        <div className='AboutDialog__field'>
                            <span className='AboutDialog__label'>
                                <FormattedMessage id='About.License' defaultMessage='License'/>
                            </span>
                            <span>
                                <FormattedMessage
                                    id='About.LicenseValue'
                                    defaultMessage='Focalboard is distributed under the Mattermost Source Available License. Copyright (c) 2015-present Mattermost, Inc.'
                                />
                            </span>
                        </div>

                        <div className='AboutDialog__copyright'>
                            <FormattedMessage
                                id='About.Copyright'
                                defaultMessage='Copyright (c) 2015-present Mattermost, Inc. All rights reserved. This localized build is maintained for internal use; see the usage tab for details.'
                            />
                        </div>
                    </div>}

                {tab === 'usage' &&
                    <div className='AboutDialog__body AboutDialog__usage'>
                        <h4><FormattedMessage id='About.CopyrightTitle' defaultMessage='Copyright & license'/></h4>
                        <p>
                            <FormattedMessage
                                id='About.CopyrightDetail'
                                defaultMessage='Focalboard is an open source project by Mattermost, Inc., distributed under the Mattermost Source Available License. Copyright (c) 2015-present Mattermost, Inc. All rights reserved. This build adds local workflow and reminder customizations; it is not an official Mattermost release.'
                            />
                        </p>
                        <p>
                            <FormattedMessage
                                id='About.ThirdParty'
                                defaultMessage='Third-party components (React, Go, SQLite and others) remain under their respective licenses.'
                            />
                        </p>
                    </div>}
            </div>
        </div>
    )
}

export default React.memo(AboutDialog)
