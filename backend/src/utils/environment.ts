export function inferEnvironment(url: string): 'Dev' | 'QA' | 'Prod' {
  const lower = url.toLowerCase();
  if (lower.includes('prod') || lower.includes('production')) return 'Prod';
  if (lower.includes('qa') || lower.includes('staging')) return 'QA';
  if (lower.includes('dev') || lower.includes('localhost')) return 'Dev';
  return 'Dev';
}