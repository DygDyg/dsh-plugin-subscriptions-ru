/** Countries offered in the region-gate picker. Codes are ISO 3166-1 alpha-2. */
export const REGION_COUNTRIES = [
  'US', 'GB', 'DE', 'FR', 'NL', 'SE', 'CH', 'FI', 'NO', 'DK', 'IE', 'AT', 'BE', 'LU', 'IS',
  'IT', 'ES', 'PT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'EE', 'LV', 'LT',
  'CA', 'MX', 'BR', 'AR', 'CL', 'AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'TW', 'IN', 'AE', 'IL', 'TR',
  'RU', 'UA', 'BY', 'KZ', 'CN',
] as const

export type RegionCountryCode = typeof REGION_COUNTRIES[number]
