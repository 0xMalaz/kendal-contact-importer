const EMPTY_THRESHOLD = 0.9;

function getNonEmpty(values: string[]): string[] {
  return values.filter((value) => value && value.trim().length > 0);
}

function shouldSkip(nonEmptyCount: number, totalCount: number): boolean {
  return totalCount === 0 || nonEmptyCount / totalCount <= 1 - EMPTY_THRESHOLD;
}

/**
 * Validates if column data matches email pattern
 * @returns Confidence score 0-1 (percentage of values matching pattern)
 */
export function validateEmailPattern(values: string[]): number {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nonEmpty = getNonEmpty(values);
  if (shouldSkip(nonEmpty.length, values.length)) return 0;

  const matches = nonEmpty.filter((value) => emailRegex.test(value.trim()));
  return matches.length / nonEmpty.length;
}

/**
 * Validates if column data matches phone pattern
 * Supports formats: 555-123-4567, (555) 123-4567, 555.123.4567, 5551234567, +1-555-123-4567
 * @returns Confidence score 0-1
 */
export function validatePhonePattern(values: string[]): number {
  const phoneRegex =
    /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/;
  const nonEmpty = getNonEmpty(values);
  if (shouldSkip(nonEmpty.length, values.length)) return 0;

  const matches = nonEmpty.filter((value) => {
    const cleaned = value.replace(/[\s\-\(\)\.]/g, "");
    return phoneRegex.test(value.trim()) && cleaned.length >= 10;
  });
  return matches.length / nonEmpty.length;
}

/**
 * Validates if column data matches date pattern
 * @returns Confidence score 0-1
 */
export function validateDatePattern(values: string[]): number {
  const nonEmpty = getNonEmpty(values);
  if (shouldSkip(nonEmpty.length, values.length)) return 0;

  const matches = nonEmpty.filter((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  });
  return matches.length / nonEmpty.length;
}

/**
 * Validates if column data matches number pattern
 * @returns Confidence score 0-1
 */
export function validateNumberPattern(values: string[]): number {
  const nonEmpty = getNonEmpty(values);
  if (shouldSkip(nonEmpty.length, values.length)) return 0;

  const matches = nonEmpty.filter((value) => {
    const numeric = parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(numeric);
  });
  return matches.length / nonEmpty.length;
}
