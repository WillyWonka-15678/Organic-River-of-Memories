// Later modules can subscribe here without depending on rendering or camera internals.
export type RiverEvents = {
  presence: { coverage: number; timestamp: number };
  text: { id: string; text: string }; // Future graduate-message adapter.
};
export const riverEvents = new EventTarget();
export function publish<K extends keyof RiverEvents>(type: K, detail: RiverEvents[K]) {
  riverEvents.dispatchEvent(new CustomEvent(type, { detail }));
}
