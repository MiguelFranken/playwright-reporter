import { describe, expect, test } from 'vitest';
import { isPrefetchRoute } from './prefetch-routes';

const project = '/teams/acme/projects/web';

describe('isPrefetchRoute', () => {
  test.for([
    '/teams/acme',
    `${project}/dashboard`,
    `${project}/runs`,
    `${project}/runs?status=failed&range=7`,
    `${project}/tests`,
    `${project}/branches`,
    `${project}/pull-requests`,
    `${project}/runs/128`,
    `${project}/runs/128?tab=specs`,
    `${project}/runs/128/tests/9269837e-9a1d-4bed-a7b4-05f0898f88d0`,
    `${project}/tests/9269837e-9a1d-4bed-a7b4-05f0898f88d0`,
    `${project}/branches/feature/checkout`,
    `${project}/pull-requests/1524`,
    `${project}/cases`,
    `${project}/cases?suite=unassigned`,
    `${project}/cases/12`,
    `${project}/cases/12/history`,
  ])('prefetches the page behind %s on intent', (href) => {
    expect(isPrefetchRoute(href)).toBe(true);
  });

  test.for([
    '/',
    '/login',
    '/admin',
    '/account',
    '/teams/acme/settings/members',
    `${project}/settings`,
    `${project}/runs/not-a-number`,
    `${project}/pull-requests/abc`,
    `${project}/cases/new`,
    `${project}/cases/12/edit`,
    'https://example.com/teams/acme',
    '//example.com/teams/acme',
    '#top',
  ])('leaves %s to its App Shell', (href) => {
    expect(isPrefetchRoute(href)).toBe(false);
  });
});
