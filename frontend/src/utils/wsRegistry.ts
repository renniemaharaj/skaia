import { getDefaultStore } from "jotai";
import type { WritableAtom } from "jotai";

const store = getDefaultStore();

type Store = typeof store;
type PatchFn<T, U = unknown> = (prev: T, data: U, store: Store) => T;

interface ResourceHandler<T, U = unknown> {
  atom: WritableAtom<T, [any], unknown>;
  patch: PatchFn<T, U>;
}

const registry = new Map<string, ResourceHandler<any, any>[]>();

export function registerResource<T, U = unknown>(
  messageType: string,
  atom: WritableAtom<T, [any], unknown>,
  patch: PatchFn<T, U>
) {
  const handlers = registry.get(messageType) ?? [];
  handlers.push({ atom, patch });
  registry.set(messageType, handlers);
}

export function applyWsUpdate(messageType: string, data: unknown): boolean {
  const handlers = registry.get(messageType);
  if (!handlers?.length) return false;

  for (const handler of handlers) {
    store.set(handler.atom, (prev: unknown) => handler.patch(prev, data, store));
  }
  return true;
}
