/**
 * Normalize a Tomcat manager URL by stripping known trailing endpoint suffixes.
 * Returns a URL that points to the root of the manager webapp (e.g., ends with '/manager').
 */
export function normalizeManagerUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  let path = url.pathname;

  // Known suffixes that we want to remove (Tomcat manager endpoints).
  // Note: query-string-only suffixes (e.g. ?XML=true) are handled separately
  // below via url.search — pathname never contains the query string.
  const knownSuffixes = [
    '/text/list', '/text/vminfo', '/text/status',
    '/status', '/html/list', '/jvmproxy', '/serverinfo'
  ];

  for (const suffix of knownSuffixes) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }

  // A manager root should never carry a query string or fragment
  // (e.g. legacy stored value ".../manager/status?XML=true").
  // Clear both unconditionally rather than only on suffix match.
  url.search = '';
  url.hash = '';

  // Remove any trailing slash for consistency. We intentionally do NOT
  // force the path to end with '/manager' — custom manager paths
  // (e.g. '/my-company/manager') must be preserved as-is.
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  url.pathname = path;
  return url.toString();
}

/**
 * Parse manager URL and extract credentials if present.
 * Ensures that credentials in the URL match the explicit credentials provided.
 * Returns a sanitized URL without credentials, and the resolved user/pass.
 */
export function parseAndSanitizeManagerUrl(
  rawUrl: string,
  explicitUser: string,
  explicitPass: string
): { url: string; user: string; pass: string } {
  const url = new URL(rawUrl);

  // URL.username/password are percent-encoded by the URL parser, so decode
  // before comparing against the raw explicit fields.
  const urlUser = decodeURIComponent(url.username);
  const urlPass = decodeURIComponent(url.password);

  if (urlUser || urlPass) {
    if (urlUser !== explicitUser || urlPass !== explicitPass) {
      throw new Error(
        'Conflict: Credentials in URL (http://user:pass@...) do not match the provided username/password fields. ' +
        'Please remove the credentials from the URL or update the fields to match.'
      );
    }
    // Strip credentials from URL for storage
    url.username = '';
    url.password = '';
  }

  return {
    url: normalizeManagerUrl(url.toString()),
    user: explicitUser,
    pass: explicitPass,
  };
}
