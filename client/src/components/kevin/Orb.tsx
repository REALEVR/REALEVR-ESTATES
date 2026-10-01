import './kevin.css'

/** Kevin's sphere. Pure CSS (see kevin.css); the flags only switch which animation it plays. */
export default function Orb({
  speaking,
  listening,
  thinking,
  mini,
}: {
  speaking?: boolean
  listening?: boolean
  thinking?: boolean
  mini?: boolean
}) {
  return (
    <span
      className={`kevin ${mini ? 'kevin--mini' : ''} ${speaking ? 'is-speaking' : ''} ${listening ? 'is-listening' : ''} ${thinking ? 'is-thinking' : ''}`}
      aria-hidden="true"
    >
      <span className="kevin__ripple" />
      <span className="kevin__ripple" />
      <span className="kevin__ripple" />
      <span className="kevin__floor" />
      <span className="kevin__body">
        <span className="kevin__core">
          <span className="kevin__aurora" />
          <span className="kevin__aurora kevin__aurora--b" />
        </span>
        <span className="kevin__shade" />
        <span className="kevin__gloss" />
        <span className="kevin__ring" />
      </span>
    </span>
  )
}
