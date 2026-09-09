/** Trim trailing zeros so 0.50 reads as 0.5 and 2.00 as 2. */
export const lbs = (n: number) => String(Math.round(n * 100) / 100)
