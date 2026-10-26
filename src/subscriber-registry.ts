// EventTarget del PubSub che sa chi ascolta: yoga crea una closure per ogni subscribe, quindi il Set per topic conta
// esattamente le subscription aperte e la removeEventListener allo stop lo svuota
export class SubscriberRegistry extends EventTarget {
    private readonly listeners = new Map<string, Set<unknown>>();

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean,
    ): void {
        super.addEventListener(type, listener, options);
        if (!listener) return;
        const topicListeners = this.listeners.get(type) ?? new Set<unknown>();
        topicListeners.add(listener);
        this.listeners.set(type, topicListeners);
    }

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: EventListenerOptions | boolean,
    ): void {
        super.removeEventListener(type, listener, options);
        const topicListeners = this.listeners.get(type);
        topicListeners?.delete(listener);
        if (topicListeners?.size === 0) this.listeners.delete(type);
    }

    hasSubscribers(topic: string): boolean {
        return this.listeners.has(topic);
    }
}
