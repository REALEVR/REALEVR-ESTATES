/**
 * A small person who walks along the top of the phone headline, left to right, again and again.
 * "Walk in before you arrive", made literal. Pure SVG + CSS: the limbs swing about the shoulder and
 * hip (transform only), the whole figure drifts across on a long linear loop, and nothing runs for
 * visitors who asked for reduced motion (they get the figure standing still at the left).
 */
export default function WalkingFigure() {
    return (
        <div className="walker-lane pointer-events-none relative h-14 select-none" aria-hidden="true">
            <svg className="walker" viewBox="0 0 40 58" width="34" height="49" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <ellipse className="walker-shadow" cx="21" cy="56" rx="9" ry="1.6" fill="hsl(235 21% 21% / 0.14)" />
                <g className="walker-body">
                    {/* far arm and far leg sit behind and a little lighter, which is what makes it read as a stride */}
                    <path className="walker-arm walker-arm--far" d="M20 18 L20 32" stroke="hsl(36 80% 32% / 0.55)" strokeWidth="3.6" />
                    <path className="walker-leg walker-leg--far" d="M20 34 L20 52 L25 52" stroke="hsl(235 21% 21% / 0.55)" strokeWidth="4" />
                    <path d="M20 16 L20 35" stroke="hsl(36 80% 32%)" strokeWidth="8" />
                    <circle cx="20.5" cy="8" r="6" fill="hsl(235 21% 21%)" stroke="none" />
                    <path className="walker-leg walker-leg--near" d="M20 34 L20 52 L25 52" stroke="hsl(235 21% 21%)" strokeWidth="4" />
                    <path className="walker-arm walker-arm--near" d="M20 18 L20 32" stroke="hsl(40 92% 52%)" strokeWidth="3.6" />
                </g>
            </svg>
        </div>
    )
}
