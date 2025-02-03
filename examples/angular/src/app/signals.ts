import { computed, effect, signal, Signal, untracked } from '@angular/core';

export const previous = <T>(s: Signal<T>): Signal<T> => {
  let current = null as T;
  let previous = untracked(s);

  return computed(() => {
    current = s();
    const result = previous;
    previous = current;
    return result;
  });
};

export const debouncedSignal = <T>(
  sourceSignal: Signal<T>,
  debounceTimeInMs = 0
): Signal<T> => {
  const debounceSignal = signal(sourceSignal());

  effect(
    (onCleanup) => {
      const value = sourceSignal();
      const timeout = setTimeout(
        () => debounceSignal.set(value),
        debounceTimeInMs
      );

      onCleanup(() => clearTimeout(timeout));
    },
    { allowSignalWrites: true }
  );

  return debounceSignal;
};
