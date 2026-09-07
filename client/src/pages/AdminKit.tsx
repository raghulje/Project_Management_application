import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHead({
  title, subtitle, backTo, backLabel = 'Back', children,
}: {
  title: string
  subtitle?: string
  backTo?: string
  backLabel?: string
  children?: ReactNode
}) {
  return (
    <div className="ak">
      {backTo ? <Link className="ws-back" to={backTo}><i className="ri-arrow-left-line" />{backLabel}</Link> : null}
      <div className="pm-page-head">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {children ? <div className="ws-actions">{children}</div> : null}
      </div>
    </div>
  )
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'err'; children: ReactNode }) {
  return <div className={`ak-alert ${kind}`} role={kind === 'err' ? 'alert' : undefined}>{children}</div>
}

export function Insights({ cards }: { cards: { label: string; value: string | number; tone?: 'blue' | 'green' | 'rose' | 'amber'; icon?: string }[] }) {
  return (
    <div className="ak-insights">
      {cards.map((c) => (
        <div key={c.label} className={`ak-stat ${c.tone || 'blue'}`}>
          {c.icon ? <i className={c.icon} /> : null}
          <b>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon = 'ri-inbox-line', title, text }: { icon?: string; title: string; text?: string }) {
  return (
    <div className="ak-empty">
      <i className={icon} />
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
    </div>
  )
}

export function Pill({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'rose' | 'amber' | 'blue'; children: ReactNode }) {
  return <span className={`ak-pill ${tone}`}>{children}</span>
}
