/** Password reset links look like https://app/#reset=TOKEN. The fragment is never sent to a server. */
const RE = /^#reset=([A-Za-z0-9_-]{20,200})$/;

export function readResetToken(hash: string): string | null {
  return RE.exec(hash)?.[1] ?? null;
}

/** Removes the token from the address bar and history as soon as it has been read. */
export function clearResetFragment(): void {
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* not critical */
  }
}
