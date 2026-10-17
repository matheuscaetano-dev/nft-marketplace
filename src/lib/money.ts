import Decimal from 'decimal.js';

const EthDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});

export type EthValue = string;
export type EthInput = string | Decimal;

export function parseEth(value: EthInput): Decimal {
  if (value instanceof Decimal) {
    if (!value.isFinite()) {
      throw new TypeError('ETH amount must be finite.');
    }
    return new EthDecimal(value);
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`Invalid decimal ETH amount: ${value}`);
  }

  return new EthDecimal(value);
}

export function sumEth(...values: EthInput[]): EthValue {
  return values.reduce<Decimal>((total, value) => total.plus(parseEth(value)), new EthDecimal(0)).toString();
}

export function multiplyEthByInteger(value: EthInput, quantity: number): EthValue {
  if (!Number.isSafeInteger(quantity)) {
    throw new TypeError('ETH quantity must be a safe integer.');
  }

  return parseEth(value).times(quantity).toString();
}

export function subtractEth(left: EthInput, right: EthInput): EthValue {
  return parseEth(left).minus(parseEth(right)).toString();
}

export function applyBasisPoints(value: EthInput, basisPoints: number): EthValue {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new TypeError('Basis points must be a non-negative safe integer.');
  }

  return parseEth(value)
    .times(basisPoints)
    .dividedBy(10_000)
    .toFixed(18, Decimal.ROUND_HALF_UP);
}

export function compareEth(left: EthInput, right: EthInput): -1 | 0 | 1 {
  const result = parseEth(left).comparedTo(parseEth(right));
  return result < 0 ? -1 : result > 0 ? 1 : 0;
}

export function formatEth(value: EthInput, fractionDigits = 4): string {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 80) {
    throw new RangeError('ETH fraction digits must be an integer between 0 and 80.');
  }

  return parseEth(value).toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
}
