import type { ComponentType, SVGProps } from 'react'
import {
    ArrowUp,
    Bath,
    BedDouble,
    Book,
    Box,
    Building2,
    Calendar,
    CalendarCheck,
    Camera,
    Car,
    Check,
    CircleHelp,
    CircleUser,
    Clock,
    CreditCard,
    DollarSign,
    Dumbbell,
    Facebook,
    Gavel,
    Glasses,
    Globe,
    Heart,
    House,
    Info,
    Instagram,
    Landmark,
    Lightbulb,
    Linkedin,
    Lock,
    Mail,
    Map as MapIcon,
    MapPin,
    Maximize,
    Menu,
    MessageSquareText,
    Minimize,
    Minus,
    Mountain,
    Music,
    Newspaper,
    Palette,
    PawPrint,
    Phone,
    Play,
    Plus,
    Rocket,
    Ruler,
    Search,
    Send,
    Share2,
    ShieldCheck,
    Snowflake,
    Sofa,
    Sparkles,
    Square,
    SquareParking,
    Star,
    Tag,
    TreePine,
    TriangleAlert,
    Tv,
    Twitter,
    UserPlus,
    Users,
    Waves,
    WashingMachine,
    Wifi,
    Wine,
} from 'lucide-react'

type SvgProps = SVGProps<SVGSVGElement>

/** Brand marks lucide does not ship (it carries no WhatsApp, Apple, Android or Pinterest). Simple Icons paths, 24px grid. */
const brand = (path: string): ComponentType<SvgProps> =>
    function BrandIcon(props) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
                <path d={path} />
            </svg>
        )
    }

const WhatsApp = brand(
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
)
const Apple = brand(
    'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'
)
const Android = brand(
    'M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0004.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396'
)
const Pinterest = brand(
    'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z'
)

/**
 * The names are the old Font Awesome ones (without the "fa-"), so icons named in the database (amenities, categories) keep
 * working. `solid` icons were filled shapes in Font Awesome; lucide draws outlines, so those are filled to match.
 */
const ICONS: Record<string, { icon: ComponentType<SvgProps>; solid?: boolean }> = {
    phone: { icon: Phone },
    star: { icon: Star, solid: true },
    play: { icon: Play, solid: true },
    stop: { icon: Square, solid: true },
    envelope: { icon: Mail },
    clock: { icon: Clock },
    search: { icon: Search },
    'dollar-sign': { icon: DollarSign },
    'vector-square': { icon: Ruler },
    'shield-alt': { icon: ShieldCheck },
    'shield-halved': { icon: ShieldCheck },
    shield: { icon: ShieldCheck },
    plus: { icon: Plus },
    minus: { icon: Minus },
    'map-marker-alt': { icon: MapPin },
    map: { icon: MapIcon },
    globe: { icon: Globe },
    gavel: { icon: Gavel },
    'credit-card': { icon: CreditCard },
    check: { icon: Check },
    calendar: { icon: Calendar },
    'calendar-alt': { icon: Calendar },
    'calendar-check': { icon: CalendarCheck },
    bed: { icon: BedDouble },
    bath: { icon: Bath },
    'vr-cardboard': { icon: Glasses },
    users: { icon: Users },
    'user-plus': { icon: UserPlus },
    'user-circle': { icon: CircleUser },
    'share-alt': { icon: Share2 },
    rocket: { icon: Rocket },
    'question-circle': { icon: CircleHelp },
    'paper-plane': { icon: Send },
    newspaper: { icon: Newspaper },
    lock: { icon: Lock },
    lightbulb: { icon: Lightbulb },
    'info-circle': { icon: Info },
    'exclamation-triangle': { icon: TriangleAlert },
    camera: { icon: Camera },
    building: { icon: Building2 },
    city: { icon: Building2 },
    hotel: { icon: Building2 },
    bars: { icon: Menu },
    'comment-dots': { icon: MessageSquareText },
    heart: { icon: Heart },
    compress: { icon: Minimize },
    expand: { icon: Maximize },
    home: { icon: House },
    couch: { icon: Sofa },
    tag: { icon: Tag },
    landmark: { icon: Landmark },
    'swimming-pool': { icon: Waves },
    water: { icon: Waves },
    dumbbell: { icon: Dumbbell },
    paw: { icon: PawPrint },
    parking: { icon: SquareParking },
    wifi: { icon: Wifi },
    wine: { icon: Wine },
    tv: { icon: Tv },
    palette: { icon: Palette },
    music: { icon: Music },
    book: { icon: Book },
    'washing-machine': { icon: WashingMachine },
    tree: { icon: TreePine },
    snowflake: { icon: Snowflake },
    box: { icon: Box },
    'arrow-up': { icon: ArrowUp },
    car: { icon: Car },
    mountain: { icon: Mountain },
    // Brand marks
    facebook: { icon: Facebook },
    'facebook-f': { icon: Facebook },
    twitter: { icon: Twitter },
    instagram: { icon: Instagram },
    'linkedin-in': { icon: Linkedin },
    'pinterest-p': { icon: Pinterest, solid: true },
    whatsapp: { icon: WhatsApp, solid: true },
    apple: { icon: Apple, solid: true },
    android: { icon: Android, solid: true },
}

interface IconProps extends Omit<SvgProps, 'name'> {
    /** Font Awesome style name without the "fa-" prefix, e.g. "phone" or "map-marker-alt". */
    name: string
    /** Fill the shape (used for the "saved" state of a heart). Defaults to what the Font Awesome solid icon looked like. */
    filled?: boolean
}

/**
 * An inline SVG icon that is sized by the surrounding font size (1em), like the Font Awesome icon it replaces, so existing
 * `text-xl` / `text-accent` / `mr-2` classes keep working. It is decorative unless an aria-label is given. An unknown name draws a
 * small sparkle rather than nothing, so a new amenity in the database never shows a blank hole.
 */
export function Icon({ name, filled, className, ...rest }: IconProps) {
    const entry = ICONS[name]
    const Glyph = entry?.icon ?? Sparkles
    const fill = filled ?? entry?.solid
    const decorative = rest['aria-label'] === undefined
    return (
        <Glyph
            width="1em"
            height="1em"
            className={`inline-block shrink-0 align-[-0.125em] ${className ?? ''}`.trim()}
            fill={fill ? 'currentColor' : 'none'}
            aria-hidden={decorative ? true : undefined}
            focusable="false"
            {...rest}
        />
    )
}

export default Icon
