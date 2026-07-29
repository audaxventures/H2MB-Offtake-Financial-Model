/**
 * crypto.randomUUID() requires a secure context (HTTPS or localhost) and
 * throws in plain-HTTP contexts, which is common for forwarded preview
 * URLs in remote dev environments. Fall back to a non-cryptographic UUID
 * v4-shaped id in that case — these ids only need to be unique within a
 * browser tab, not unguessable.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to the manual generator below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
