import { useState } from 'react'
import { Orbit } from 'lucide-react'
import { isResizable, resizedSrc, resizedSrcSet } from '@/lib/img'

/**
 * A photo that never shows the browser's broken-image icon and alt text. If the picture is missing or fails to load, a calm
 * placeholder fills the same box, so cards and slides keep their shape and their dignity on a bad connection.
 *
 * `responsive` asks the server for small copies of the photo (480 px by default, with a srcset up to 960 px) instead of the
 * camera original. If a small copy cannot be made, the original is used, so the picture still shows.
 */
export default function SafeImage({
    src,
    alt,
    className = '',
    placeholderLabel = 'Photo coming soon',
    responsive = false,
    sizes = '(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 80vw',
    ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { placeholderLabel?: string; responsive?: boolean }) {
    const [failed, setFailed] = useState(false)
    const [useOriginal, setUseOriginal] = useState(false)
    const small = responsive && !useOriginal && isResizable(src)
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
    return (
        <img
            src={small ? resizedSrc(src, 480) : src}
            srcSet={small ? resizedSrcSet(src) : undefined}
            sizes={small ? sizes : undefined}
            alt={alt}
            className={className}
            onError={() => (small ? setUseOriginal(true) : setFailed(true))}
            {...rest}
        />
    )
}
