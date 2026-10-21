import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { Search } from 'lucide-react'
import { openKevin } from '@/components/kevin/kevinEvents'

export interface EmptyAction {
    label: string
    /** A page to go to. */
    href?: string
    /** Or something to do here. */
    onClick?: () => void
}

/**
 * "Nothing here" that says what to do next. A bare "0 listings" leaves a visitor at a dead end; this always offers a next
 * step, and Kevin (who can look for a home that is not listed yet) is the default last one.
 */
export default function EmptyState({
    title,
    children,
    actions = [],
    askKevin = true,
    className = '',
}: {
    title: string
    children?: ReactNode
    actions?: EmptyAction[]
    askKevin?: boolean
    className?: string
}) {
    const all: EmptyAction[] = askKevin ? [...actions, { label: 'Ask Kevin to find one', onClick: () => openKevin() }] : actions
    return (
        <div className={`mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center ${className}`}>
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Search className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
            {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
            {all.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {all.map((a, i) => {
                        const cls =
                            i === 0
                                ? 'inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background hover:opacity-90'
                                : 'inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted'
                        return a.href ? (
                            <Link key={a.label} href={a.href} className={cls}>
                                {a.label}
                            </Link>
                        ) : (
                            <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                                {a.label}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
