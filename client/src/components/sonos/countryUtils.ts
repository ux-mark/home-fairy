export function countryCodeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

export function isValidIsoCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && /^[A-Z]{2}$/.test(code)
}
