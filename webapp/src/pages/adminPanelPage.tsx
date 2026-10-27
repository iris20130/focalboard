// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useCallback, useEffect, useState} from 'react'
import {FormattedMessage, useIntl} from 'react-intl'
import {Link} from 'react-router-dom'

import octoClient from '../octoClient'
import {AdminUser, IUser} from '../user'
import {useAppSelector} from '../store/hooks'
import {getMe} from '../store/users'
import Button from '../widgets/buttons/button'
import './adminPanelPage.scss'

const AdminPanelPage = () => {
    const intl = useIntl()
    const me = useAppSelector<IUser|null>(getMe)
    const isAdmin = me?.permissions?.includes('manage_system') || false

    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const [newUsername, setNewUsername] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')

    const [passwordTarget, setPasswordTarget] = useState<AdminUser|null>(null)
    const [newTargetPassword, setNewTargetPassword] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const result = await octoClient.getAdminUsers()
            setUsers(result)
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (isAdmin) {
            load()
        }
    }, [isAdmin, load])

    const addUser = useCallback(async () => {
        setError('')
        setNotice('')
        if (!newUsername.trim() || !newPassword) {
            setError(intl.formatMessage({id: 'AdminPanel.usernamePasswordRequired', defaultMessage: 'Username and password are required.'}))
            return
        }
        try {
            await octoClient.adminCreateUser(newUsername.trim(), newEmail.trim(), newPassword)
            setNewUsername('')
            setNewEmail('')
            setNewPassword('')
            setNotice(intl.formatMessage({id: 'AdminPanel.userCreated', defaultMessage: 'Account created.'}))
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }, [newUsername, newEmail, newPassword, load, intl])

    const savePassword = useCallback(async () => {
        if (!passwordTarget) {
            return
        }
        setError('')
        setNotice('')
        try {
            await octoClient.adminSetUserPassword(passwordTarget.id, newTargetPassword)
            setNotice(intl.formatMessage({id: 'AdminPanel.passwordChanged', defaultMessage: 'Password updated for {username}.'}, {username: passwordTarget.username}))
            setPasswordTarget(null)
            setNewTargetPassword('')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }, [passwordTarget, newTargetPassword, intl])

    const removeUser = useCallback(async (user: AdminUser) => {
        const confirmed = window.confirm(intl.formatMessage(
            {id: 'AdminPanel.confirmRemove', defaultMessage: 'Remove account {username}? This signs the user out and hides the account.'},
            {username: user.username},
        ))
        if (!confirmed) {
            return
        }
        setError('')
        setNotice('')
        try {
            await octoClient.adminDeleteUser(user.id)
            setNotice(intl.formatMessage({id: 'AdminPanel.userRemoved', defaultMessage: 'Account removed.'}))
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }, [load, intl])

    if (!isAdmin) {
        return (
            <div className='AdminPanelPage'>
                <div className='AdminPanelPage__card'>
                    <FormattedMessage id='AdminPanel.noAccess' defaultMessage='This page is only available to the workspace administrator.'/>
                </div>
            </div>
        )
    }

    return (
        <div className='AdminPanelPage'>
            <div className='AdminPanelPage__card'>
                <div className='AdminPanelPage__header'>
                    <div>
                        <div className='AdminPanelPage__title'>
                            <FormattedMessage id='AdminPanel.title' defaultMessage='Account management'/>
                        </div>
                    </div>
                    <Link
                        className='AdminPanelPage__back'
                        to='/'
                    >
                        <FormattedMessage id='AdminPanel.back' defaultMessage='Back to boards'/>
                    </Link>
                </div>

                <div className='AdminPanelPage__add'>
                    <div className='AdminPanelPage__sectionTitle'>
                        <FormattedMessage id='AdminPanel.addTitle' defaultMessage='Add account'/>
                    </div>
                    <div className='AdminPanelPage__addRow'>
                        <input
                            className='AdminPanelPage__input'
                            placeholder={intl.formatMessage({id: 'AdminPanel.username', defaultMessage: 'Username'})}
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                        />
                        <input
                            className='AdminPanelPage__input'
                            type='email'
                            placeholder={intl.formatMessage({id: 'AdminPanel.email', defaultMessage: 'Email (optional)'})}
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                        />
                        <input
                            className='AdminPanelPage__input'
                            type='password'
                            placeholder={intl.formatMessage({id: 'AdminPanel.password', defaultMessage: 'Password'})}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Button
                            emphasis='primary'
                            onClick={addUser}
                        >
                            <FormattedMessage id='AdminPanel.add' defaultMessage='Add'/>
                        </Button>
                    </div>
                </div>

                {notice && <div className='AdminPanelPage__notice'>{notice}</div>}
                {error && <div className='AdminPanelPage__error'>{error}</div>}

                <div className='AdminPanelPage__sectionTitle'>
                    <FormattedMessage id='AdminPanel.members' defaultMessage='Accounts ({count})' values={{count: users.length}}/>
                </div>
                {loading &&
                    <div className='AdminPanelPage__hint'>
                        <FormattedMessage id='AdminPanel.loading' defaultMessage='Loading…'/>
                    </div>}
                {!loading &&
                    <div className='AdminPanelPage__table'>
                        <div className='AdminPanelPage__tableHead'>
                            <span><FormattedMessage id='AdminPanel.username' defaultMessage='Username'/></span>
                            <span><FormattedMessage id='AdminPanel.email' defaultMessage='Email (optional)'/></span>
                            <span><FormattedMessage id='AdminPanel.actions' defaultMessage='Actions'/></span>
                        </div>
                        {users.map((user) => (
                            <div
                                className='AdminPanelPage__tableRow'
                                key={user.id}
                            >
                                <span className='AdminPanelPage__user'>
                                    {user.username}
                                    {user.isAdmin && <em><FormattedMessage id='AdminPanel.adminTag' defaultMessage='Administrator'/></em>}
                                    {user.isSelf && <em><FormattedMessage id='AdminPanel.selfTag' defaultMessage='You'/></em>}
                                </span>
                                <span className='AdminPanelPage__email'>{user.email}</span>
                                <span className='AdminPanelPage__rowActions'>
                                    <Button
                                        emphasis='link'
                                        size='small'
                                        onClick={() => {
                                            setPasswordTarget(user)
                                            setNewTargetPassword('')
                                            setNotice('')
                                            setError('')
                                        }}
                                    >
                                        <FormattedMessage id='AdminPanel.resetPassword' defaultMessage='Set password'/>
                                    </Button>
                                    {!user.isAdmin && !user.isSelf &&
                                        <Button
                                            emphasis='link'
                                            size='small'
                                            danger={true}
                                            onClick={() => removeUser(user)}
                                        >
                                            <FormattedMessage id='AdminPanel.remove' defaultMessage='Remove'/>
                                        </Button>}
                                </span>
                            </div>
                        ))}
                    </div>}

                {passwordTarget &&
                    <div className='AdminPanelPage__dialogBackdrop'>
                        <div className='AdminPanelPage__dialog'>
                            <div className='AdminPanelPage__sectionTitle'>
                                <FormattedMessage
                                    id='AdminPanel.setPasswordFor'
                                    defaultMessage='Set a new password for {username}'
                                    values={{username: passwordTarget.username}}
                                />
                            </div>
                            <input
                                className='AdminPanelPage__input'
                                type='password'
                                placeholder={intl.formatMessage({id: 'AdminPanel.newPassword', defaultMessage: 'New password (at least 6 characters)'})}
                                value={newTargetPassword}
                                onChange={(e) => setNewTargetPassword(e.target.value)}
                            />
                            <div className='AdminPanelPage__dialogActions'>
                                <Button
                                    emphasis='primary'
                                    onClick={savePassword}
                                >
                                    <FormattedMessage id='AdminPanel.save' defaultMessage='Save'/>
                                </Button>
                                <Button
                                    emphasis='link'
                                    onClick={() => setPasswordTarget(null)}
                                >
                                    <FormattedMessage id='AdminPanel.cancel' defaultMessage='Cancel'/>
                                </Button>
                            </div>
                        </div>
                    </div>}
            </div>
        </div>
    )
}

export default React.memo(AdminPanelPage)
