

type PAYMENT_STATUS = "PAID" | "FAILED" | "RESPONDED-BACK"

type EventMap = {
    PAYMENT_MODEL : {
        status : PAYMENT_STATUS,
        transactionID?:string,
    }
  
}



type EventKey = keyof EventMap

type Callback<K extends EventKey> = (payload: EventMap[K]) => void

class EventBus {
    private events: {
        [K in EventKey]?: Callback<K>[]
    } = {}

    on<K extends EventKey>(eventName: K, callback: Callback<K>) {
        if (!this.events[eventName]) {
            this.events[eventName] = []
        }

        this.events[eventName]!.push(callback)

        return () => {
            this.events[eventName] = this.events[eventName]!.filter((cb) => cb !== callback)
        }
    }

    emit<K extends EventKey>(eventName: K, payload: EventMap[K]) {
        this.events[eventName]?.forEach((cb) => cb(payload))
    }
}

export const eventBus = new EventBus()
