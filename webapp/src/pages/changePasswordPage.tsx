// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useState} from 'react'
import {Link, useHistory} from 'react-router-dom'

import Button from '../widgets/buttons/button'
import client from '../octoClient'
import './changePasswordPage.scss'
import {IUser} from '../user'
import {useAppSelector} from '../store/hooks'
import {getMe} from '../store/users'

const ChangePasswordPage = () => {
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [succeeded, setSucceeded] = useState(false)
    const user = useAppSelector<IUser|null>(getMe)
    const history = useHistory()

    if (!user) {
        return (
            <div className='ChangePasswordPage'>
                <div className='title'>{'Change Password'}</div>
                <Link to='/login'>{'Log in first'}</Link>
            </div>
        )
    }

    const handleSubmit = async (userId: string): Promise<void> => {
        if (newPassword.length < 6) {
            setErrorMessage('New password must be at least 6 characters')
            return
        }
        if (newPassword !== confirmPassword) {
            setErrorMessage('The two new passwords do not match')
            return
        }
        const response = await client.changePassword(userId, oldPassword, newPassword)
        if (response.code === 200) {
            setOldPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setErrorMessage('')
            setSucceeded(true)
        } else {
            setErrorMessage(`Change password failed: ${response.json?.error}`)
        }
    }

    return (
        <div className='ChangePasswordPage'>
            <div className='title'>{'Change Password'}</div>
            <form
                onSubmit={(e: React.FormEvent) => {
                    e.preventDefault()
                    handleSubmit(user.id)
                }}
            >
                <div className='oldPassword'>
                    <input
                        id='login-oldpassword'
                        type='password'
                        placeholder={'Enter current password'}
                        value={oldPassword}
                        onChange={(e) => {
                            setOldPassword(e.target.value)
                            setErrorMessage('')
                        }}
                    />
                </div>
                <div className='newPassword'>
                    <input
                        id='login-newpassword'
                        type='password'
                        placeholder={'Enter new password (at least 6 characters)'}
                        value={newPassword}
                        onChange={(e) => {
                            setNewPassword(e.target.value)
                            setErrorMessage('')
                        }}
                    />
                </div>
                <div className='newPassword'>
                    <input
                        id='login-confirmpassword'
                        type='password'
                        placeholder={'Repeat the new password'}
                        value={confirmPassword}
                        onChange={(e) => {
                            setConfirmPassword(e.target.value)
                            setErrorMessage('')
                        }}
                    />
                </div>
                <Button
                    filled={true}
                    submit={true}
                >
                    {'Change password'}
                </Button>
            </form>
            {errorMessage &&
                <div className='error'>
                    {errorMessage}
                </div>
            }
            {succeeded &&
                <button
                    type='button'
                    className='succeeded'
                    onClick={() => history.push('/')}
                >{'Password changed, click to continue.'}</button>
            }
            {!succeeded &&
                <Link to='/'>{'Cancel'}</Link>
            }
        </div>
    )
}

export default React.memo(ChangePasswordPage)
