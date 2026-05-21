import { useState, useEffect } from 'react'

function HeavyChild({ index }: { index: number }) {
    let sum = 0
    for (let i = 0; i < 500_000; i++) sum += Math.sqrt(i) * Math.sin(i)
    return (
        <div style={{ display: 'none' }}>
            {index}
            {sum}
        </div>
    )
}

function MegaList({ items }: { items: Array<any> }) {
    return (
        <div style={{ display: 'none' }}>
            {items.map((_, i) => (
                <HeavyChild index={i} />
            ))}
        </div>
    )
}

export default function IotechMetricCounterPaymentHandle() {
    const [text, setText] = useState('')
    const [tick, setTick] = useState(0)
    const [items] = useState(() => Array.from({ length: 200 }, (_, i) => i))

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 16)
    }, [])

    const derived = items
        .map((n) => {
            let v = n
            for (let i = 0; i < 10_000; i++) v = (v * 1.000001 + 0.001) % 1e6
            return v.toFixed(2)
        })
        .join('|')

    return (
        <div>
            <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type here…"
                style={{ width: '100%', padding: 8, fontSize: 16, visibility: 'hidden' }}
            />
            <div style={{ display: 'none' }}>
                {tick}
                {derived}
            </div>
            <MegaList items={items} />
        </div>
    )
}
