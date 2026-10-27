import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DrawdownChart, { drawdownScale, formatDrawdown } from './DrawdownChart.jsx';

describe('historical drawdown chart', () => {
  it('uses a percent scale that includes the full underwater series and zero reference', () => {
    const markup = renderToStaticMarkup(<DrawdownChart dates={['2025-01-01', '2025-01-02', '2025-01-03']} values={[0, -20, -73.6322]}/>);
    const scale = drawdownScale([0, -20, -73.6322]);
    expect(scale.low).toBeLessThanOrEqual(-73.6322);
    expect(scale.high).toBe(0);
    expect(scale.ticks).toContain(0);
    expect(markup).toContain('Drawdown (%)');
    expect(markup).toContain('Date');
    expect(markup).toContain('-80%');
    expect(markup).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
    expect(markup).toContain('zero');
  });

  it('formats selected values as percentages and rejects positive values', () => {
    expect(formatDrawdown(-73.632217)).toBe('-73.6322%');
    expect(renderToStaticMarkup(<DrawdownChart dates={['2025-01-01', '2025-01-02']} values={[0, 1]}/>))
      .toContain('At least two valid non-positive drawdown observations');
  });
});
