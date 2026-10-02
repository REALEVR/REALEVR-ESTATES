import { Link } from 'wouter'

/** Links to related pages: how people (and crawlers) get from one page to the next. */
export default function RelatedLinks({ title = 'Keep reading', links }: { title?: string; links: Array<{ label: string; path: string }> }) {
    if (!links.length) return null
    return (
        <aside aria-label={title} className="mt-10 rounded-2xl border border-border p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
                {links.map((l) => (
                    <li key={l.path}>
                        <Link href={l.path} className="text-accent underline-offset-2 hover:underline">{l.label}</Link>
                    </li>
                ))}
            </ul>
        </aside>
    )
}
