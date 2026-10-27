// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'
import {Link} from 'react-router-dom'

import {
    DueReminderSettings,
    DUE_REMINDER_PREF_ENABLED,
    DUE_REMINDER_PREF_INTERVAL,
    DUE_REMINDER_PREF_LEAD_DAYS,
    DUE_REMINDER_PREF_SECRET,
    DUE_REMINDER_PREF_WEBHOOK,
} from '../dueReminder'
import octoClient from '../octoClient'
import {IUser, UserConfigPatch} from '../user'
import {useAppDispatch, useAppSelector} from '../store/hooks'
import {getMe, patchProps} from '../store/users'
import Button from '../widgets/buttons/button'

import './reminderSettingsPage.scss'

const ReminderSettingsPage = () => {
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const me = useAppSelector<IUser|null>(getMe)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [settings, setSettings] = useState<DueReminderSettings|null>(null)

    const [enabled, setEnabled] = useState(false)
    const [leadDays, setLeadDays] = useState('3')
    const [intervalMinutes, setIntervalMinutes] = useState('60')
    const [webhook, setWebhook] = useState('')
    const [initialWebhook, setInitialWebhook] = useState('')
    const [secret, setSecret] = useState('')

    const applySettings = useCallback((value: DueReminderSettings) => {
        setSettings(value)
        setEnabled(value.enabled)
        setLeadDays(value.leadDays.toString())
        setIntervalMinutes(value.intervalMinutes.toString())
        setWebhook(value.webhook)
        setInitialWebhook(value.webhook)
        setSecret('')
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        const value = await octoClient.getDueReminderSettings()
        if (value) {
            applySettings(value)
            setError('')
        } else {
            setError(intl.formatMessage({id: 'ReminderSettings.loadFailed', defaultMessage: 'Unable to load reminder settings.'}))
        }
        setLoading(false)
    }, [applySettings, intl])

    useEffect(() => {
        load()
    }, [load])

    const webhookChanged = useMemo(() => webhook.trim() !== initialWebhook.trim(), [webhook, initialWebhook])

    const buildPatch = useCallback((): UserConfigPatch => {
        const updatedFields: Record<string, string> = {
            [DUE_REMINDER_PREF_ENABLED]: enabled ? 'true' : 'false',
            [DUE_REMINDER_PREF_LEAD_DAYS]: leadDays,
            [DUE_REMINDER_PREF_INTERVAL]: intervalMinutes,
        }
        // Leaving the field untouched keeps the server-side default webhook.
        if (webhookChanged) {
            updatedFields[DUE_REMINDER_PREF_WEBHOOK] = webhook.trim()
        }
        if (secret.trim() !== '') {
            updatedFields[DUE_REMINDER_PREF_SECRET] = secret.trim()
        }
        return {updatedFields}
    }, [enabled, leadDays, intervalMinutes, webhookChanged, webhook, secret])

    const save = useCallback(async (): Promise<boolean> => {
        if (!me) {
            return false
        }
        setSaving(true)
        setError('')
        setNotice('')
        try {
            const patched = await octoClient.patchUserConfig(me.id, buildPatch())
            if (!patched) {
                throw new Error(intl.formatMessage({id: 'ReminderSettings.saveFailed', defaultMessage: 'Unable to save reminder settings.'}))
            }
            await dispatch(patchProps(patched))
            const value = await octoClient.getDueReminderSettings()
            if (value) {
                applySettings(value)
            }
            setNotice(intl.formatMessage({id: 'ReminderSettings.saved', defaultMessage: 'Reminder settings saved.'}))
            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            return false
        } finally {
            setSaving(false)
        }
    }, [me, buildPatch, dispatch, intl, applySettings])

    const test = useCallback(async () => {
        setTesting(true)
        setError('')
        setNotice('')
        try {
            const saved = await save()
            if (!saved) {
                return
            }
            await octoClient.testDueReminder()
            setNotice(intl.formatMessage({id: 'ReminderSettings.testSent', defaultMessage: 'Test message sent. Check your Feishu chat.'}))
        } catch (err) {
            setError(intl.formatMessage({id: 'ReminderSettings.testFailed', defaultMessage: 'Test failed: {error}'}, {error: err instanceof Error ? err.message : String(err)}))
        } finally {
            setTesting(false)
        }
    }, [save, intl])

    const clearSecret = useCallback(async () => {
        if (!me) {
            return
        }
        setSaving(true)
        setError('')
        try {
            const patched = await octoClient.patchUserConfig(me.id, {deletedFields: [DUE_REMINDER_PREF_SECRET]})
            if (patched) {
                await dispatch(patchProps(patched))
            }
            setSecret('')
            setNotice(intl.formatMessage({id: 'ReminderSettings.secretCleared', defaultMessage: 'Feishu secret removed.'}))
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }, [me, dispatch, intl])

    if (!me) {
        return (
            <div className='ReminderSettingsPage'>
                <div className='ReminderSettingsPage__card'>
                    <FormattedMessage
                        id='ReminderSettings.loginRequired'
                        defaultMessage='Log in first to manage reminder settings.'
                    />
                </div>
            </div>
        )
    }

    return (
        <div className='ReminderSettingsPage'>
            <div className='ReminderSettingsPage__card'>
                <div className='ReminderSettingsPage__header'>
                    <div>
                        <div className='ReminderSettingsPage__title'>
                            <FormattedMessage id='ReminderSettings.title' defaultMessage='Due reminders'/>
                        </div>
                        <div className='ReminderSettingsPage__subtitle'>
                            <FormattedMessage
                                id='ReminderSettings.subtitle'
                                defaultMessage='These settings belong to your account only. Changes do not affect other members.'
                            />
                        </div>
                    </div>
                    <Link
                        className='ReminderSettingsPage__back'
                        to='/'
                    >
                        <FormattedMessage id='ReminderSettings.back' defaultMessage='Back to boards'/>
                    </Link>
                </div>

                {loading &&
                    <div className='ReminderSettingsPage__hint'>
                        <FormattedMessage id='ReminderSettings.loading' defaultMessage='Loading…'/>
                    </div>}

                {!loading && settings &&
                    <>
                        <div className='ReminderSettingsPage__row'>
                            <div className='ReminderSettingsPage__label'>
                                <FormattedMessage id='ReminderSettings.enable' defaultMessage='Feishu reminders'/>
                                <span className='ReminderSettingsPage__description'>
                                    <FormattedMessage
                                        id='ReminderSettings.enableHint'
                                        defaultMessage='Send overdue and soon-due cards to your Feishu bot.'
                                    />
                                </span>
                            </div>
                            <label className='ReminderSettingsPage__switch'>
                                <input
                                    type='checkbox'
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                />
                                <span/>
                            </label>
                        </div>

                        <div className='ReminderSettingsPage__row'>
                            <div className='ReminderSettingsPage__label'>
                                <FormattedMessage id='ReminderSettings.leadDays' defaultMessage='Remind me ahead (days)'/>
                                <span className='ReminderSettingsPage__description'>
                                    <FormattedMessage
                                        id='ReminderSettings.leadDaysHint'
                                        defaultMessage='Cards due within this many days are included. System default: {days}.'
                                        values={{days: settings.defaultLeadDays}}
                                    />
                                </span>
                            </div>
                            <input
                                className='ReminderSettingsPage__number'
                                type='number'
                                min={0}
                                max={365}
                                value={leadDays}
                                onChange={(e) => setLeadDays(e.target.value)}
                            />
                        </div>

                        <div className='ReminderSettingsPage__row'>
                            <div className='ReminderSettingsPage__label'>
                                <FormattedMessage id='ReminderSettings.interval' defaultMessage='Send interval (minutes)'/>
                                <span className='ReminderSettingsPage__description'>
                                    <FormattedMessage
                                        id='ReminderSettings.intervalHint'
                                        defaultMessage='How often the server checks this account. System default: {minutes} minutes.'
                                        values={{minutes: settings.defaultInterval}}
                                    />
                                </span>
                            </div>
                            <input
                                className='ReminderSettingsPage__number'
                                type='number'
                                min={1}
                                max={1440}
                                value={intervalMinutes}
                                onChange={(e) => setIntervalMinutes(e.target.value)}
                            />
                        </div>

                        <div className='ReminderSettingsPage__row wide'>
                            <div className='ReminderSettingsPage__label'>
                                <FormattedMessage id='ReminderSettings.webhook' defaultMessage='Feishu webhook'/>
                                <span className='ReminderSettingsPage__description'>
                                    {settings.usingDefaultWebhook &&
                                        !webhookChanged &&
                                        <FormattedMessage
                                            id='ReminderSettings.usingDefaultWebhook'
                                            defaultMessage='Using the system webhook from config.json. Fill this field to use your own bot.'
                                        />}
                                    {(!settings.usingDefaultWebhook || webhookChanged) &&
                                        <FormattedMessage
                                            id='ReminderSettings.webhookHint'
                                            defaultMessage='Paste the custom bot webhook URL of your Feishu group.'
                                        />}
                                </span>
                            </div>
                            <input
                                className='ReminderSettingsPage__text'
                                type='url'
                                placeholder={settings.usingDefaultWebhook ? intl.formatMessage({id: 'ReminderSettings.defaultWebhookPlaceholder', defaultMessage: 'Using system default webhook'}) : 'https://open.feishu.cn/open-apis/bot/v2/hook/…'}
                                value={webhook}
                                onChange={(e) => setWebhook(e.target.value)}
                            />
                        </div>

                        <div className='ReminderSettingsPage__row wide'>
                            <div className='ReminderSettingsPage__label'>
                                <FormattedMessage id='ReminderSettings.secret' defaultMessage='Feishu signing secret'/>
                                <span className='ReminderSettingsPage__description'>
                                    {settings.secretConfigured &&
                                        <FormattedMessage
                                            id='ReminderSettings.secretConfigured'
                                            defaultMessage='A secret is configured. Leave blank to keep it.'
                                        />}
                                    {!settings.secretConfigured &&
                                        <FormattedMessage
                                            id='ReminderSettings.secretHint'
                                            defaultMessage='Optional. Only needed when the bot has signature verification enabled.'
                                        />}
                                </span>
                            </div>
                            <div className='ReminderSettingsPage__secretRow'>
                                <input
                                    className='ReminderSettingsPage__text'
                                    type='password'
                                    placeholder={settings.secretConfigured ? '••••••••' : ''}
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                />
                                {settings.secretConfigured &&
                                    <Button
                                        emphasis='link'
                                        size='small'
                                        onClick={clearSecret}
                                    >
                                        <FormattedMessage id='ReminderSettings.clearSecret' defaultMessage='Remove secret'/>
                                    </Button>}
                            </div>
                        </div>

                        <div className='ReminderSettingsPage__note'>
                            <FormattedMessage
                                id='ReminderSettings.note'
                                defaultMessage='Reminders are stored per account in the workspace database. The admin account can also manage your password from its member panel.'
                            />
                        </div>

                        <div className='ReminderSettingsPage__actions'>
                            <Button
                                emphasis='primary'
                                onClick={save}
                                disabled={saving}
                            >
                                {saving ?
                                    intl.formatMessage({id: 'ReminderSettings.saving', defaultMessage: 'Saving…'}) :
                                    intl.formatMessage({id: 'ReminderSettings.save', defaultMessage: 'Save'})}
                            </Button>
                            <Button
                                onClick={test}
                                disabled={saving || testing}
                            >
                                {testing ?
                                    intl.formatMessage({id: 'ReminderSettings.testing', defaultMessage: 'Sending…'}) :
                                    intl.formatMessage({id: 'ReminderSettings.test', defaultMessage: 'Send test message'})}
                            </Button>
                            {notice && <span className='ReminderSettingsPage__notice'>{notice}</span>}
                            {error && <span className='ReminderSettingsPage__error'>{error}</span>}
                        </div>
                    </>}
            </div>
        </div>
    )
}

export default React.memo(ReminderSettingsPage)
