import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManagerUrl } from './url';

describe('normalizeManagerUrl', () => {
  it('strips /text/list', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/manager/text/list'),
      'http://localhost:8080/manager'
    );
  });

  it('strips /html/list', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/manager/html/list'),
      'http://localhost:8080/manager'
    );
  });

  it('strips /status and its query string', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/manager/status?XML=true'),
      'http://localhost:8080/manager'
    );
  });

  it('leaves an already-clean URL unchanged', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/manager'),
      'http://localhost:8080/manager'
    );
  });

  it('preserves custom paths with no known suffix', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/synctl'),
      'http://localhost:8080/synctl'
    );
  });

  it('preserves custom manager paths', () => {
    assert.equal(
      normalizeManagerUrl('http://localhost:8080/my-company/manager/text/list'),
      'http://localhost:8080/my-company/manager'
    );
  });

  it('joins suffix onto base path without dropping it', () => {
    const base = 'http://localhost:8080/manager';
    const suffix = '/text/list'.replace(/^\//, '');
    const joined = new URL(suffix, base.endsWith('/') ? base : `${base}/`).href;
    assert.equal(joined, 'http://localhost:8080/manager/text/list');
  });
});
