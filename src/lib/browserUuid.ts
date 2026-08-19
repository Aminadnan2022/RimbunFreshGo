export function createBrowserUuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (char) => {
      const randomByte =
        typeof crypto !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
          ? crypto.getRandomValues(new Uint8Array(1))[0]
          : Math.floor(Math.random() * 256);

      const random = randomByte & 0x0f;
      const value =
        char === 'x'
          ? random
          : (random & 0x03) | 0x08;

      return value.toString(16);
    },
  );
}