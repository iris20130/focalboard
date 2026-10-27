// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef} from 'react'

import './cardLocator.scss'

export const LocateCardEvent = 'focalboard:locate-card'
export const LocateFallbackEvent = 'focalboard:locate-fallback'

const HIGHLIGHT_CLASS = 'CardLocator--highlight'
const MAX_WAIT_MS = 10000
const FALLBACK_WAIT_MS = 3000
const POLL_INTERVAL_MS = 100

type LocateDetail = {
    cardId: string
}

const CardLocator = (): null => {
    const highlightedElement = useRef<Element | null>(null)
    const cleanupHighlight = useRef<(() => void) | null>(null)
    const pollTimer = useRef<number | undefined>(undefined)
    const waitTimeout = useRef<number | undefined>(undefined)

    useEffect(() => {
        const clearTimers = () => {
            if (pollTimer.current) {
                window.clearInterval(pollTimer.current)
                pollTimer.current = undefined
            }
            if (waitTimeout.current) {
                window.clearTimeout(waitTimeout.current)
                waitTimeout.current = undefined
            }
        }

        const stopHighlight = () => {
            cleanupHighlight.current?.()
            cleanupHighlight.current = null
            highlightedElement.current = null
        }

        const locateCard = (cardId: string) => {
            clearTimers()
            stopHighlight()

            const deadline = Date.now() + MAX_WAIT_MS
            const fallbackAt = Date.now() + FALLBACK_WAIT_MS
            let fallbackSent = false
            const findAndHighlight = () => {
                const element = document.querySelector(`[data-card-id="${cardId}"]`)
                if (!element) {
                    if (!fallbackSent && Date.now() > fallbackAt) {
                        fallbackSent = true
                        window.dispatchEvent(new CustomEvent(LocateFallbackEvent, {detail: {cardId}}))
                    }
                    if (Date.now() > deadline) {
                        clearTimers()
                    }
                    return
                }

                clearTimers()
                element.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'})
                element.classList.add(HIGHLIGHT_CLASS)
                highlightedElement.current = element

                const onMouseEnter = () => {
                    element.classList.remove(HIGHLIGHT_CLASS)
                    element.removeEventListener('mouseenter', onMouseEnter)
                    cleanupHighlight.current = null
                    highlightedElement.current = null
                }
                element.addEventListener('mouseenter', onMouseEnter)
                cleanupHighlight.current = () => {
                    element.classList.remove(HIGHLIGHT_CLASS)
                    element.removeEventListener('mouseenter', onMouseEnter)
                }
            }

            findAndHighlight()
            pollTimer.current = window.setInterval(findAndHighlight, POLL_INTERVAL_MS)
            waitTimeout.current = window.setTimeout(clearTimers, MAX_WAIT_MS)
        }

        const onLocate = (event: Event) => {
            const detail = (event as CustomEvent<LocateDetail>).detail
            if (detail?.cardId) {
                locateCard(detail.cardId)
            }
        }

        window.addEventListener(LocateCardEvent, onLocate)
        return () => {
            window.removeEventListener(LocateCardEvent, onLocate)
            clearTimers()
            stopHighlight()
        }
    }, [])

    return null
}

export default CardLocator
