import { describe, expect, it } from 'vitest';
import { resolveTheme } from './ThemeContext.jsx';

describe('appearance preference', () => {
  it('keeps light as the first-visit default and resolves explicit selections', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the operating-system preference only in System mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
