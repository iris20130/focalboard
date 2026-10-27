// 假勤月历弹窗：逐日农历/节气、法定休/班、本人加班/调休假/年假标记，
// 支持记一笔、流水、设置（工龄/有效期/颜色）与导出 txt。

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {
    LeaveRecord,
    LeaveSettings,
    LeaveSummary,
    LunarDay,
    getLunarYear,
    leaveColor,
    leaveDayMarks,
    leaveMarkLabel,
} from '../../leaves'
import octoClient from '../../octoClient'

import './leaveCalendar.scss'

type Props = {
    mode: 'popup'|'pinned'
    anchorRect?: {top: number, left: number, bottom: number}
    onClose: () => void
}

const WEEK_HEADERS = ['一', '二', '三', '四', '五', '六', '日']

function pad(n: number): string {
    return `${n}`.padStart(2, '0')
}

function dateKey(year: number, month: number, day: number): string {
    return `${year}-${pad(month)}-${pad(day)}`
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate()
}

// Monday-first offset of the 1st
function firstWeekdayOffset(year: number, month: number): number {
    return (new Date(year, month - 1, 1).getDay() + 6) % 7
}

const actionText: Record<string, string> = {
    grant: '年假发放',
    add: '加班 +',
    use: '消耗 -',
    void: '到期作废',
}

const LeaveCalendar: React.FC<Props> = (props: Props) => {
    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
    const [summary, setSummary] = useState<LeaveSummary|undefined>(undefined)
    const [lunar, setLunar] = useState<Record<string, LunarDay>>({})
    const [holidays, setHolidays] = useState<Record<string, {name: string, offDay: boolean}>>({})
    const [panel, setPanel] = useState<'none'|'form'|'ledger'|'settings'>('none')
    const [error, setError] = useState('')
    const [form, setForm] = useState({kind: 'comp', action: 'add', date: dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()), days: 1, note: ''})
    const [settings, setSettings] = useState<LeaveSettings>({workStartDate: '', annualExpireYears: 1, annualExpireMonth: 3, annualExpireDay: 31, compExpireYears: 1, compExpireMonth: 4, compExpireDay: 30})
    const dragRef = useRef<{startX: number, startY: number, originX: number, originY: number}|null>(null)
    const [pos, setPos] = useState<{x: number, y: number}|null>(null)
    const rootRef = useRef<HTMLDivElement>(null)

    const reload = useCallback(() => {
        octoClient.getLeaveSummary().then((data) => {
            if (data) {
                setSummary(data)
                setSettings(data.settings)
                window.dispatchEvent(new CustomEvent('focalboard-leaves-updated', {detail: data}))
            }
        })
    }, [])

    useEffect(() => {
        reload()
    }, [reload])

    useEffect(() => {
        getLunarYear(viewYear).then(setLunar)
        octoClient.getTopBarCalendar().then((calendar) => {
            if (!calendar) {
                return
            }
            const map: Record<string, {name: string, offDay: boolean}> = {}
            calendar.days.forEach((day) => {
                map[day.date] = {name: day.name, offDay: day.offDay}
            })
            setHolidays(map)
        })
    }, [viewYear])

    const marks = useMemo(() => (summary ? leaveDayMarks(summary.records) : {}), [summary])

    const cells = useMemo(() => {
        const offset = firstWeekdayOffset(viewYear, viewMonth)
        const total = daysInMonth(viewYear, viewMonth)
        const prevTotal = daysInMonth(viewYear, viewMonth === 1 ? 12 : viewMonth - 1)
        const list: Array<{year: number, month: number, day: number, out: boolean}> = []
        for (let i = offset - 1; i >= 0; i--) {
            const m = viewMonth === 1 ? 12 : viewMonth - 1
            const y = viewMonth === 1 ? viewYear - 1 : viewYear
            list.push({year: y, month: m, day: prevTotal - i, out: true})
        }
        for (let d = 1; d <= total; d++) {
            list.push({year: viewYear, month: viewMonth, day: d, out: false})
        }
        while (list.length % 7 !== 0 || list.length < 42) {
            const last = list[list.length - 1]
            let {year, month, day} = last
            day += 1
            if (day > daysInMonth(year, month)) {
                day = 1
                month += 1
                if (month > 12) {
                    month = 1
                    year += 1
                }
            }
            list.push({year, month, day, out: true})
        }
        return list
    }, [viewYear, viewMonth])

    const step = (years: number, months: number) => {
        const next = new Date(viewYear, viewMonth - 1 + months + years * 12, 1)
        setViewYear(next.getFullYear())
        setViewMonth(next.getMonth() + 1)
    }

    const balanceOf = (kind: string) => summary?.balances.find((b) => b.kind === kind)

    const submitRecord = async () => {
        setError('')
        const result = await octoClient.addLeaveRecord(form)
        if (result.error) {
            setError(result.error)
            return
        }
        setForm({...form, note: ''})
        setPanel('ledger')
        reload()
    }

    const removeRecord = async (record: LeaveRecord) => {
        if (record.action === 'void') {
            return
        }
        await octoClient.deleteLeaveRecord(record.id)
        reload()
    }

    const saveSettings = async () => {
        setError('')
        const saved = await octoClient.updateLeaveSettings(settings)
        if (!saved) {
            setError('设置保存失败')
            return
        }
        reload()
    }

    const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (props.mode !== 'pinned' || e.button !== 0) {
            return
        }
        const rect = rootRef.current?.getBoundingClientRect()
        if (!rect) {
            return
        }
        dragRef.current = {startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top}
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag) {
            return
        }
        setPos({
            x: Math.max(0, Math.min(window.innerWidth - 320, drag.originX + e.clientX - drag.startX)),
            y: Math.max(0, Math.min(window.innerHeight - 100, drag.originY + e.clientY - drag.startY)),
        })
    }

    const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        dragRef.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
    }

    const style: React.CSSProperties = props.mode === 'pinned' ?
        (pos ? {left: pos.x, top: pos.y} : {left: '50%', top: '15%', transform: 'translateX(-50%)'}) :
        {
            left: Math.max(8, Math.min((props.anchorRect?.left || 100), window.innerWidth - 340)),
            top: (props.anchorRect?.bottom || 40) + 6,
        }

    const colors = summary?.settings

    return (
        <div
            ref={rootRef}
            className={`LeaveCalendar ${props.mode}`}
            style={style}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div
                className='LeaveCalendar__header'
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
            >
                <button type='button' title='上一年' onClick={() => step(-1, 0)}>«</button>
                <button type='button' title='上一月' onClick={() => step(0, -1)}>‹</button>
                <span className='LeaveCalendar__title'>{viewYear} 年 {viewMonth} 月</span>
                <button type='button' title='下一月' onClick={() => step(0, 1)}>›</button>
                <button type='button' title='下一年' onClick={() => step(1, 0)}>»</button>
                <button
                    type='button'
                    className='LeaveCalendar__today'
                    onClick={() => {
                        setViewYear(today.getFullYear())
                        setViewMonth(today.getMonth() + 1)
                    }}
                >今天</button>
                <button
                    type='button'
                    className='LeaveCalendar__close'
                    onClick={props.onClose}
                >×</button>
            </div>

            <div className='LeaveCalendar__balances'>
                <span>年假 剩 <b style={{color: leaveColor(colors, 'annualLeave')}}>{balanceOf('annual')?.available ?? '-'}</b> 天<span className='expireHint'>（距清零 {balanceOf('annual')?.expireWorkdays ?? '-'} 个工作日）</span></span>
                <span>调休 剩 <b style={{color: leaveColor(colors, 'overtime')}}>{balanceOf('comp')?.available ?? '-'}</b> 天<span className='expireHint'>（距清零 {balanceOf('comp')?.expireWorkdays ?? '-'} 个工作日）</span></span>
                {balanceOf('annual')?.expired ? <span className='voided'>年假作废 {balanceOf('annual')?.expired}</span> : null}
                {balanceOf('comp')?.expired ? <span className='voided'>调休作废 {balanceOf('comp')?.expired}</span> : null}
            </div>

            <div className='LeaveCalendar__week'>{WEEK_HEADERS.map((w) => <span key={w}>{w}</span>)}</div>
            <div className='LeaveCalendar__grid'>
                {cells.map((cell) => {
                    const key = dateKey(cell.year, cell.month, cell.day)
                    const info = lunar[key]
                    const holiday = holidays[key]
                    const dayMarks = marks[key] || []
                    const isToday = cell.year === today.getFullYear() && cell.month === today.getMonth() + 1 && cell.day === today.getDate()
                    const isWeekend = firstWeekdayOffset(cell.year, cell.month) >= 0 && ((new Date(cell.year, cell.month - 1, cell.day).getDay() + 6) % 7) >= 5
                    return (
                        <div
                            key={key}
                            className={[
                                'LeaveCalendar__cell',
                                cell.out ? 'out' : '',
                                isToday ? 'today' : '',
                                holiday ? (holiday.offDay ? 'rest' : 'work') : '',
                                isWeekend && !holiday ? 'weekend' : '',
                            ].join(' ')}
                            onClick={() => setForm({...form, date: key})}
                            title={holiday ? `${holiday.name} ${holiday.offDay ? '休' : '班'}` : undefined}
                        >
                            <span className='LeaveCalendar__num'>{cell.day}</span>
                            <span className={`LeaveCalendar__lunar ${info?.term ? 'term' : ''}`} style={info?.term ? {color: leaveColor(colors, 'term')} : undefined}>
                                {info ? (info.term || info.lunar) : ''}
                            </span>
                            {holiday && <span className={`LeaveCalendar__badge ${holiday.offDay ? 'off' : 'on'}`}>{holiday.offDay ? '休' : '班'}</span>}
                            {dayMarks.map((record) => {
                                const label = leaveMarkLabel(record)
                                return label.text ? (
                                    <span
                                        key={record.id}
                                        className='LeaveCalendar__mark'
                                        style={{color: leaveColor(colors, label.colorKey)}}
                                    >{label.text}</span>
                                ) : null
                            })}
                        </div>
                    )
                })}
            </div>

            <div className='LeaveCalendar__tabs'>
                <button type='button' className={panel === 'form' ? 'active' : ''} onClick={() => setPanel(panel === 'form' ? 'none' : 'form')}>记一笔</button>
                <button type='button' className={panel === 'ledger' ? 'active' : ''} onClick={() => setPanel(panel === 'ledger' ? 'none' : 'ledger')}>流水</button>
                <button type='button' className={panel === 'settings' ? 'active' : ''} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>设置</button>
                <button
                    type='button'
                    onClick={() => {
                        octoClient.downloadLeaveExport()
                    }}
                >导出</button>
            </div>

            {error && <div className='LeaveCalendar__error'>{error}</div>}

            {panel === 'form' &&
                <div className='LeaveCalendar__panel'>
                    <div className='row'>
                        <label>
                            <input type='radio' name='leaveKind' checked={form.kind === 'comp'} onChange={() => setForm({...form, kind: 'comp'})}/>调休
                        </label>
                        <label>
                            <input type='radio' name='leaveKind' checked={form.kind === 'annual'} onChange={() => setForm({...form, kind: 'annual'})}/>年假
                        </label>
                        <label>
                            <input type='radio' name='leaveAction' checked={form.action === 'add'} onChange={() => setForm({...form, action: 'add'})}/>{form.kind === 'annual' ? '发放' : '增加'}
                        </label>
                        <label>
                            <input type='radio' name='leaveAction' checked={form.action === 'use'} onChange={() => setForm({...form, action: 'use'})}/>消耗
                        </label>
                    </div>
                    <div className='row'>
                        <input type='date' value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/>
                        <select value={form.days} onChange={(e) => setForm({...form, days: Number(e.target.value)})}>
                            {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 天</option>)}
                        </select>
                        <input
                            type='text'
                            placeholder='备注（可选）'
                            value={form.note}
                            maxLength={100}
                            onChange={(e) => setForm({...form, note: e.target.value})}
                        />
                        <button type='button' className='save' onClick={submitRecord}>保存</button>
                    </div>
                </div>}

            {panel === 'ledger' &&
                <div className='LeaveCalendar__panel LeaveCalendar__ledger'>
                    {(summary?.records.length ? summary.records : []).map((record) => (
                        <div key={record.id} className={`row ${record.action === 'void' ? 'voided' : ''}`}>
                            <span className='date'>{record.date}</span>
                            <span className='label'>{actionText[record.action]}{record.action === 'use' ? (record.kind === 'annual' ? '（年假）' : '（调休）') : ''}</span>
                            <span className='days'>{record.action === 'use' || record.action === 'void' ? '-' : '+'}{record.days}</span>
                            {record.expires && record.action !== 'use' && <span className='expires'>至 {record.expires}</span>}
                            {record.note && <span className='note'>{record.note}</span>}
                            {record.action !== 'void' &&
                                <button type='button' className='del' title='删除' onClick={() => removeRecord(record)}>×</button>}
                        </div>
                    ))}
                    {!summary?.records.length && <div className='empty'>本周期暂无记录</div>}
                </div>}

            {panel === 'settings' &&
                <div className='LeaveCalendar__panel'>
                    <div className='row'>
                        <span>参加工作日期</span>
                        <input type='date' value={settings.workStartDate} onChange={(e) => setSettings({...settings, workStartDate: e.target.value})}/>
                    </div>
                    <div className='row expire'>
                        <span>年假清零</span>
                        <select value={settings.annualExpireYears} onChange={(e) => setSettings({...settings, annualExpireYears: Number(e.target.value)})}>
                            <option value={0}>当年</option>
                            <option value={1}>次年</option>
                            <option value={2}>隔一年</option>
                            <option value={3}>隔两年</option>
                        </select>
                        <input type='number' min={1} max={12} value={settings.annualExpireMonth} onChange={(e) => setSettings({...settings, annualExpireMonth: Number(e.target.value)})}/>月
                        <input type='number' min={1} max={31} value={settings.annualExpireDay} onChange={(e) => setSettings({...settings, annualExpireDay: Number(e.target.value)})}/>日
                    </div>
                    <div className='row expire'>
                        <span>调休清零</span>
                        <select value={settings.compExpireYears} onChange={(e) => setSettings({...settings, compExpireYears: Number(e.target.value)})}>
                            <option value={0}>当年</option>
                            <option value={1}>次年</option>
                            <option value={2}>隔一年</option>
                            <option value={3}>隔两年</option>
                        </select>
                        <input type='number' min={1} max={12} value={settings.compExpireMonth} onChange={(e) => setSettings({...settings, compExpireMonth: Number(e.target.value)})}/>月
                        <input type='number' min={1} max={31} value={settings.compExpireDay} onChange={(e) => setSettings({...settings, compExpireDay: Number(e.target.value)})}/>日
                    </div>
                    <div className='row colors'>
                        <span>加班色</span><input type='color' value={settings.colors?.overtime || '#d9480f'} onChange={(e) => setSettings({...settings, colors: {...settings.colors, overtime: e.target.value}})}/>
                        <span>调休假色</span><input type='color' value={settings.colors?.compLeave || '#2f9e44'} onChange={(e) => setSettings({...settings, colors: {...settings.colors, compLeave: e.target.value}})}/>
                        <span>年假色</span><input type='color' value={settings.colors?.annualLeave || '#1971c2'} onChange={(e) => setSettings({...settings, colors: {...settings.colors, annualLeave: e.target.value}})}/>
                        <span>节气色</span><input type='color' value={settings.colors?.term || '#868e96'} onChange={(e) => setSettings({...settings, colors: {...settings.colors, term: e.target.value}})}/>
                    </div>
                    <div className='row'>
                        <button type='button' className='save' onClick={saveSettings}>保存设置</button>
                        <span className='hint'>年假按法定档每年 1/1 自动发放（满 1 年 5 天 / 满 10 年 10 天 / 满 20 年 15 天），也可手动发放；当年累积的假期在所选"当年/次年+月日"清零</span>
                    </div>
                </div>}
        </div>
    )
}

export default LeaveCalendar
