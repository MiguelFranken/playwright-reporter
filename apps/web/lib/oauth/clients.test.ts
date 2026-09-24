import { describe, expect, it } from 'vitest';
import { redirectUriMatches, validRedirectUri } from './clients';
import { isOurResource } from './config';

describe('validRedirectUri', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', true],
    ['http://localhost:33418/callback', true],
    ['http://127.0.0.1/cb', true],
    ['cursor://anysphere.cursor-mcp/oauth/callback', true],
    ['http://example.com/cb', false],
    ['https://example.com/cb#frag', false],
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['not a url', false],
  ])('%s → %s', (uri, ok) => {
    expect(validRedirectUri(uri)).toBe(ok);
  });
});

describe('redirectUriMatches', () => {
  it('requires an exact match, except for the port of a loopback URI', () => {
    expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example/cb')).toBe(true);
    expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example/cb2')).toBe(false);
    expect(redirectUriMatches(['http://127.0.0.1:1234/cb'], 'http://127.0.0.1:5678/cb')).toBe(true);
    expect(redirectUriMatches(['http://127.0.0.1:1234/cb'], 'http://127.0.0.1:5678/other')).toBe(false);
    expect(redirectUriMatches(['http://localhost/cb'], 'http://127.0.0.1/cb')).toBe(false);
  });
});

describe('isOurResource', () => {
  it('accepts the MCP endpoint and the origin, and nothing else', () => {
    process.env.BASE_URL = 'https://r.example';
    expect(isOurResource(undefined)).toBe(true);
    expect(isOurResource('https://r.example/api/mcp')).toBe(true);
    expect(isOurResource('https://r.example/api/mcp/')).toBe(true);
    expect(isOurResource('https://r.example')).toBe(true);
    expect(isOurResource('https://other.example/api/mcp')).toBe(false);
    delete process.env.BASE_URL;
  });
});
