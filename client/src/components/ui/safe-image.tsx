import { useState } from 'react'
import { Orbit } from 'lucide-react'

/**
 * A photo that never shows the browser's broken-image icon and alt text. If the picture is missing or fails to load, a calm
 * placeholder fills the same box, so cards and slides keep their shape and their dignity on a bad connection.
 */
export default function SafeImage({
    src,
    alt,
    className = '',
    placeholderLabel = 'Photo coming soon',
    ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { placeholderLabel?: string }) {
    const [failed, setFailed] = useState(false)
    if (failed || !src) {
        return (
            <div
                role="img"
                aria-label={alt}
                className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground ${className.replace(/object-\S+|transition\S*|duration-\S+|ease-\S+|group-hover:\S+|hover:\S+/g, '')}`}
            >
                <Orbit className="h-7 w-7" aria-hidden="true" />
                <span className="text-xs font-medium">{placeholderLabel}</span>
            </div>
        )
    }
    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} {...rest} />
}
