import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('XBF brand contract', () => {
  it('uses the approved XBF palette and font families', () => {
    const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');
    expect(tokens).toContain('#000d3a');
    expect(tokens).toContain('#1a3375');
    expect(tokens).toContain('#39495c');
    expect(tokens).toContain('#c8c8c8');
    expect(tokens).toMatch(/Lustra/i);
    expect(tokens).toMatch(/Flama/i);
  });
});
