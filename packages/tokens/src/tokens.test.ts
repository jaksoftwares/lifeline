import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, radius } from './index';

const css = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('theme.css', () => {
  it.each(Object.entries(colors))('defines colour %s with the same value', (name, value) => {
    // Prettier lowercases hex colours in CSS, so compare case-insensitively.
    expect(css.toLowerCase()).toContain(`--color-${kebab(name)}: ${value.toLowerCase()};`);
  });

  it.each(Object.entries(radius))('defines radius %s with the same value', (name, value) => {
    expect(css).toContain(`--radius-${name}: ${value};`);
  });
});
