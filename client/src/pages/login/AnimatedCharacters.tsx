import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type Kind = 'laptop' | 'phone' | 'mouse'

const CREW = [
  { id: 'laptop', label: 'Laptop', kind: 'laptop' as Kind, width: 112, height: 86 },
  { id: 'phone', label: 'Phone', kind: 'phone' as Kind, width: 46, height: 92 },
  { id: 'mouse', label: 'Mouse', kind: 'mouse' as Kind, width: 68, height: 78 },
]

type EyeProps = {
  mouseX: number
  mouseY: number
  size?: number
  pupil?: number
  max?: number
  blink?: boolean
  closed?: boolean
  forceX?: number
  forceY?: number
  sad?: boolean
}

/** Large kawaii eye — white circle + black pupil that tracks cursor */
function Eye({
  mouseX, mouseY, size = 17, pupil = 6.5, max = 3.4,
  blink, closed, forceX, forceY, sad,
}: EyeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!ref.current || closed || sad || blink) return
    if (forceX !== undefined && forceY !== undefined) {
      setPos({ x: forceX, y: forceY })
      return
    }
    const r = ref.current.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = mouseX - cx
    const dy = mouseY - cy
    const dist = Math.min(Math.hypot(dx, dy), max)
    const a = Math.atan2(dy, dx)
    setPos({ x: Math.cos(a) * dist, y: Math.sin(a) * dist })
  }, [mouseX, mouseY, forceX, forceY, max, closed, sad, blink])

  if (closed || blink) {
    return <div className="km-eye km-eye--closed" style={{ width: size }} />
  }

  return (
    <div
      ref={ref}
      className={`km-eye${sad ? ' km-eye--sad' : ''}`}
      style={{ width: size, height: size }}
    >
      <i style={{ width: pupil, height: pupil, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
    </div>
  )
}

function Mouth({ mood }: { mood: 'o' | 'smile' | 'flat' | 'sad' | 'happy' }) {
  return <div className={`km-mouth km-mouth--${mood}`} />
}

/**
 * Flat chibi device silhouettes matching the login mock exactly:
 * blue laptop, teal phone, charcoal mouse — no arms/legs.
 */
function DeviceArt({ kind }: { kind: Kind }) {
  if (kind === 'laptop') {
    return (
      <svg className="km-art" viewBox="0 0 148 112" aria-hidden>
        <defs>
          <linearGradient id="kmLpBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="kmLpScreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0F2FE" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
          <filter id="kmSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#1e3a8a" floodOpacity="0.16" />
          </filter>
        </defs>
        <g filter="url(#kmSoft)">
          {/* Lid / bezel */}
          <rect x="16" y="6" width="116" height="78" rx="16" fill="url(#kmLpBody)" />
          {/* Soft face screen */}
          <rect x="26" y="16" width="96" height="56" rx="10" fill="url(#kmLpScreen)" />
          {/* Base */}
          <path
            d="M6 88h136c4 0 6 2.5 6 6v6H0v-6c0-3.5 2-6 6-6z"
            fill="#2563EB"
          />
          <rect x="62" y="92" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.4)" />
        </g>
      </svg>
    )
  }

  if (kind === 'phone') {
    return (
      <svg className="km-art" viewBox="0 0 70 130" aria-hidden>
        <defs>
          <linearGradient id="kmPhBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
          <linearGradient id="kmPhFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#99F6E4" />
            <stop offset="100%" stopColor="#5EEAD4" />
          </linearGradient>
          <filter id="kmSoftPh" x="-25%" y="-10%" width="150%" height="130%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#115e59" floodOpacity="0.18" />
          </filter>
        </defs>
        <g filter="url(#kmSoftPh)">
          <rect x="6" y="2" width="58" height="126" rx="18" fill="url(#kmPhBody)" />
          <rect x="6" y="2" width="58" height="126" rx="18" fill="none" stroke="#0F766E" strokeWidth="2.5" opacity="0.35" />
          {/* Face panel — soft mint like the mock */}
          <rect x="12" y="20" width="46" height="92" rx="12" fill="url(#kmPhFace)" />
          {/* Speaker pill */}
          <rect x="26" y="10" width="18" height="5" rx="2.5" fill="rgba(15,23,42,0.28)" />
          {/* Home indicator */}
          <rect x="28" y="116" width="14" height="3.5" rx="1.75" fill="rgba(255,255,255,0.45)" />
        </g>
      </svg>
    )
  }

  /* Charcoal mouse — upright pebble + antenna cable */
  return (
    <svg className="km-art" viewBox="0 0 108 118" aria-hidden>
      <defs>
        <linearGradient id="kmMsBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64748B" />
          <stop offset="50%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <filter id="kmSoftMs" x="-25%" y="-15%" width="150%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.2" />
        </filter>
      </defs>
      {/* Antenna cable curving up-right */}
      <g className="km-mouse-cable">
        <path
          d="M54 22 C52 6, 64 -4, 82 10"
          fill="none"
          stroke="#CBD5E1"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="84" cy="11" r="3.2" fill="#E2E8F0" />
      </g>
      <g filter="url(#kmSoftMs)">
        <ellipse cx="52" cy="68" rx="34" ry="40" fill="url(#kmMsBody)" />
        {/* Soft highlight */}
        <ellipse cx="52" cy="48" rx="18" ry="14" fill="rgba(255,255,255,0.1)" />
        {/* Center seam */}
        <path d="M52 32 v42" stroke="rgba(15,23,42,0.22)" strokeWidth="1.5" />
        {/* Scroll wheel */}
        <rect x="47" y="36" width="10" height="16" rx="5" fill="rgba(15,23,42,0.4)" />
        <rect x="49" y="39" width="6" height="8" rx="3" fill="rgba(148,163,184,0.55)" />
      </g>
    </svg>
  )
}

export type MascotMood = 'idle' | 'typing' | 'password' | 'success' | 'fail'

type Props = {
  isTyping?: boolean
  isPasswordFocused?: boolean
  showPassword?: boolean
  passwordLength?: number
  emailLength?: number
  isExcited?: boolean
  mood?: MascotMood
}

/**
 * Kawaii device mascots matching the enterprise login mock:
 * blue laptop, teal phone, charcoal mouse — faces on devices, soft glow, cursor-tracking eyes.
 */
export default function AnimatedCharacters({
  isTyping = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
  emailLength = 0,
  isExcited = false,
  mood = 'idle',
}: Props) {
  void passwordLength
  const reduce = useReducedMotion()
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  const [blinkMask, setBlinkMask] = useState(() => CREW.map(() => false))
  const [bouncePhase, setBouncePhase] = useState(0)

  const covering = (isPasswordFocused && !showPassword) || mood === 'password'
  const watching = isTyping || emailLength > 0 || mood === 'typing'
  const sad = mood === 'fail'
  const happy = mood === 'success' || isExcited

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouseX(e.clientX)
      setMouseY(e.clientY)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setBouncePhase((p) => (p + 1) % 6), 700)
    return () => clearInterval(id)
  }, [reduce])

  useEffect(() => {
    const clears = CREW.map((_, i) => {
      let timeout: ReturnType<typeof setTimeout>
      const run = () => {
        timeout = setTimeout(() => {
          setBlinkMask((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
          setTimeout(() => {
            setBlinkMask((prev) => {
              const next = [...prev]
              next[i] = false
              return next
            })
            run()
          }, 140)
        }, Math.random() * 2800 + 1800 + i * 400)
      }
      run()
      return () => clearTimeout(timeout)
    })
    return () => clears.forEach((c) => c())
  }, [])

  const bounceY = (i: number) => {
    if (reduce) return 0
    const wave = [0, -5, -2, -7, -1, -4][(bouncePhase + i * 2) % 6]
    return wave + (happy ? -6 : 0)
  }

  /** Idle mouths match the mock: laptop o · phone flat · mouse o */
  const mouthFor = (index: number): 'o' | 'smile' | 'flat' | 'sad' | 'happy' => {
    if (sad) return 'sad'
    if (happy) return 'happy'
    if (covering) return index === 1 ? 'flat' : 'o'
    if (watching) return 'o'
    if (index === 1) return 'flat'
    return 'o'
  }

  return (
    <div className="km-stage">
      <div className="km-glow" aria-hidden />
      {CREW.map((buddy, index) => {
        const y = bounceY(index)
        const closedEyes = covering && index !== 1
        const phoneSleepy = covering && index === 1

        const forceX = watching && !covering
          ? Math.min(3.2, Math.max(-1, emailLength * 0.28))
          : undefined
        const forceY = watching && !covering ? 2.4 : undefined

        const eyeTop = buddy.kind === 'laptop' ? '32%' : buddy.kind === 'phone' ? '36%' : '40%'
        const eyeSize = buddy.kind === 'phone' ? 14 : buddy.kind === 'mouse' ? 16 : 17
        const eyeGap = buddy.kind === 'phone' ? 6 : 8

        return (
          <motion.button
            key={buddy.id}
            type="button"
            className={`km-buddy km-buddy--${buddy.kind}${sad ? ' is-sad' : ''}${happy ? ' is-happy' : ''}`}
            aria-label={buddy.label}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 + index * 0.08 }}
            style={{ zIndex: index + 1 }}
          >
            <div className="km-figure" style={{ width: buddy.width, height: buddy.height }}>
              <DeviceArt kind={buddy.kind} />

              <div className="km-face" style={{ top: eyeTop }}>
                <div className="km-eyes" style={{ gap: eyeGap }}>
                  <Eye
                    mouseX={mouseX}
                    mouseY={mouseY}
                    size={eyeSize}
                    pupil={eyeSize * 0.38}
                    blink={blinkMask[index] && !covering}
                    closed={closedEyes || phoneSleepy}
                    sad={sad}
                    forceX={forceX}
                    forceY={forceY}
                  />
                  <Eye
                    mouseX={mouseX}
                    mouseY={mouseY}
                    size={eyeSize}
                    pupil={eyeSize * 0.38}
                    blink={blinkMask[index] && !covering}
                    closed={closedEyes || phoneSleepy}
                    sad={sad}
                    forceX={forceX}
                    forceY={forceY}
                  />
                </div>
                <Mouth mood={mouthFor(index)} />
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
