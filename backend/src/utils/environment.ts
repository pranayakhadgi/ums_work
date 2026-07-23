/**
 * Utility for inferring deployment environment from URL patterns
 */

/**
 * Infers the deployment environment (Dev, QA, or Prod) based on keywords in the URL.
 *
 * @param url
 * @returns The inferred environment string.
 */
export function inferEnvironment(url: string): 'Dev' | 'QA' | 'Prod' {
  const lower = url.toLowerCase();
  if (lower.includes('prod') || lower.includes('production')) return 'Prod';
  if (lower.includes('qa') || lower.includes('staging')) return 'QA';
  if (lower.includes('dev') || lower.includes('localhost')) return 'Dev';
  return 'Dev';
}