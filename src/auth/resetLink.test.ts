import { describe, expect, it } from 'bun:test';
import { readResetToken } from './resetLink';

describe('readResetToken', () => {
  it('reads a token from the fragment', () => {
    const t = 'A'.repeat(43);
    expect(readResetToken(`#reset=${t}`)).toBe(t);
  });
  it('ignores anything else', () => {
    for (const h of ['', '#', '#reset=', '#reset=short', '#other=' + 'A'.repeat(43), '#reset=' + 'A'.repeat(43) + '&x=1', '#reset=<script>' + 'A'.repeat(30)]) {
      expect(readResetToken(h)).toBeNull();
    }
  });
});
