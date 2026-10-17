import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  compareEth,
  formatEth,
  multiplyEthByInteger,
  parseEth,
  subtractEth,
  sumEth,
} from '../src/lib/money';

describe('ETH decimal helpers', () => {
  it('adds decimal values without floating point error', () => {
    expect(sumEth('0.1', '0.2')).toBe('0.3');
  });

  it('preserves values below the binary floating point range', () => {
    expect(sumEth('0.000000000000000001', '0.000000000000000002'))
      .toBe('0.000000000000000003');
  });

  it('supports high precision values and integer quantities', () => {
    expect(multiplyEthByInteger('0.123456789012345678', 3))
      .toBe('0.370370367037037034');
    expect(subtractEth('1.000000000000000001', '0.000000000000000002'))
      .toBe('0.999999999999999999');
  });

  it('uses half-up rounding for display while preserving canonical input', () => {
    expect(formatEth('1.23455', 4)).toBe('1.2346');
    expect(parseEth('1.234567890123456789').toString()).toBe('1.234567890123456789');
  });

  it('compares decimal values exactly and rejects invalid quantities', () => {
    expect(compareEth('0.100000000000000001', '0.1')).toBe(1);
    expect(() => multiplyEthByInteger('1', 1.5)).toThrow(TypeError);
    expect(() => parseEth('1e-3')).toThrow(TypeError);
  });

  it('calculates percentage discounts to 18 decimal places', () => {
    expect(applyBasisPoints('1.19', 1000)).toBe('0.119000000000000000');
  });
});
