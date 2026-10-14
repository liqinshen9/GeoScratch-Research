import { useEffect, useRef, useState } from 'react'

export default function ExerciseCountdown({ enabled, limitSeconds, onTimeout, startedAt }) {
  const [remaining, setRemaining] = useState(limitSeconds)
  const timeoutHandler = useRef(onTimeout)
  useEffect(() => { timeoutHandler.current = onTimeout }, [onTimeout])
  useEffect(() => {
    setRemaining(limitSeconds)
    if (!enabled) return
    const deadline = (startedAt ? Date.parse(startedAt) : Date.now()) + limitSeconds * 1000
    let expired = false
    const tick = () => {
      if (expired) return
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) {
        expired = true
        timeoutHandler.current()
      }
    }
    const interval = window.setInterval(tick, 1000)
    tick()
    // Recheck the deadline immediately when returning from a background tab.
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, limitSeconds, startedAt])
  if (!enabled) return null
  return <div className={`user-study-li-countdown${remaining < 10 ? ' is-urgent' : ''}`} role="timer" aria-label="Exercise time remaining">
    Time remaining: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
  </div>
}
