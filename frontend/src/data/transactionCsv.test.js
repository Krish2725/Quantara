import { describe, expect, it } from 'vitest';
import { parseInvestmentCsv } from './transactionCsv.js';

describe('investment transaction CSV preview validation', () => {
  it('normalizes common Excel header variants and both supported date formats', () => {
    const parsed = parseInvestmentCsv(' Trade Date ,Ticker,Side,Qty,Unit Price,Commission\n07-09-2026,NVDA,BUY,10,150.00,1.00\n2026-09-15,NVDA,SELL,3,165,1');
    expect(parsed.stats).toMatchObject({ totalRows: 2, validRows: 2, invalidRows: 0, symbols: ['NVDA'] });
    expect(parsed.rows[0]).toMatchObject({ date: '2026-09-07', type: 'BUY', quantity: 10, unitPrice: 150, fees: 1, grossAmount: 1500, netCashAmount: -1501, errors: [] });
    expect(parsed.rows[1]).toMatchObject({ date: '2026-09-15', type: 'SELL', quantity: 3, unitPrice: 165, fees: 1, grossAmount: 495, netCashAmount: 494, errors: [] });
  });

  it('defaults fees to zero when omitted and does not treat price history as trades', () => {
    const parsed = parseInvestmentCsv('date,symbol,type,quantity,price\n2026-09-07,AAPL,BUY,4,230.50');
    expect(parsed.rows[0].fees).toBe(0);
    expect(parsed.rows[0].netCashAmount).toBe(-922);
    expect(() => parseInvestmentCsv('date,symbol,price\n2026-09-07,AAPL,230.50')).toThrow(/missing required columns.*type.*quantity/i);
  });

  it('returns row-specific errors for invalid calendar dates, numbers, types, fees and malformed row widths', () => {
    const parsed = parseInvestmentCsv('date,symbol,type,quantity,price,fees\n31-02-2026,NVDA,BUY,0,NaN,-1\n2026-09-07,AAPL,WHAT,2,100,0,extra');
    expect(parsed.stats).toMatchObject({ totalRows: 2, validRows: 0, invalidRows: 2 });
    expect(parsed.rows[0].errors.join(' ')).toMatch(/calendar date|quantity|price|fees/);
    expect(parsed.rows[1].errors.join(' ')).toMatch(/columns|type/);
  });

  it('rejects missing columns, unsupported headers and malformed CSV quoting', () => {
    expect(() => parseInvestmentCsv('date,symbol,type,price\n2026-09-07,NVDA,BUY,100')).toThrow(/quantity/);
    expect(() => parseInvestmentCsv('date,symbol,type,quantity,price,commission,notes\n')).toThrow(/unsupported column.*notes/i);
    expect(() => parseInvestmentCsv('date,symbol,type,quantity,price\n"2026-09-07,NVDA,BUY,1,100')).toThrow(/unclosed quoted/);
  });
});
