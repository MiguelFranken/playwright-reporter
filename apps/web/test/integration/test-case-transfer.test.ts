import { exportCases, listCases } from '@/lib/db/queries/test-cases';
import { createCase, createSuite, importCases, saveFieldDefs, type CaseContext } from '@/lib/test-cases/service';
import { parseImport, toCsv } from '@/lib/test-cases/transfer';
import { createTenant, describe, expect, test, type Tenant } from './fixtures';

function ctxOf(tenant: Tenant): CaseContext {
  return { projectId: tenant.project.id, teamId: tenant.team.id, actorId: tenant.adminUser.id };
}

describe('export and import', () => {
  test('JSON carries suites, steps and fields into another project', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    await saveFieldDefs(ctx, [{ key: 'owner', label: 'Owner', kind: 'text' }]);
    const checkout = await createSuite(ctx, { name: 'Checkout', description: 'Cart and payment' });
    const coupons = await createSuite(ctx, { name: 'Coupons', parentId: checkout.id });
    await createCase(ctx, { title: 'Apply a coupon', suiteId: coupons.id, steps: [{ action: 'Enter SAVE10', expected: '10% off' }], customFields: { owner: 'Kim' }, tags: ['promo'] });
    await createCase(ctx, { title: 'Claims automation', automation: 'automated' });
    const doc = await exportCases(tenant.project.id);
    expect(doc.suites.map((s) => s.path)).toEqual([['Checkout'], ['Checkout', 'Coupons']]);

    const other = await createTenant(db);
    const octx = ctxOf(other);
    await saveFieldDefs(octx, [{ key: 'owner', label: 'Owner', kind: 'text' }]);
    // A case numbered TC-1 over there must not be taken for the file's TC-1.
    await createCase(octx, { title: 'Something else entirely' });
    const summary = await importCases(octx, parseImport({ name: 'x.json', text: JSON.stringify(doc) }, []), 'update');
    expect(summary).toEqual({ created: 2, updated: 0, skipped: 0, suites: 2, errors: [] });

    const rows = (await listCases(other.project.id)).rows;
    expect(rows.map((r) => [r.title, r.suitePath, r.automation])).toEqual([
      ['Apply a coupon', ['Checkout', 'Coupons'], 'manual'],
      ['Something else entirely', [], 'manual'],
      // Nothing links to it here, so it waits to be automated instead of claiming it.
      ['Claims automation', [], 'planned'],
    ]);
    const again = await exportCases(other.project.id);
    expect(again.cases.find((c) => c.title === 'Apply a coupon')).toMatchObject({ customFields: { owner: 'Kim' }, tags: ['promo'], steps: [{ action: 'Enter SAVE10', expected: '10% off' }] });
    expect(again.suites[0]).toMatchObject({ path: ['Checkout'], description: 'Cart and payment' });
  });

  test('CSV re-imported into its own project updates, skips or copies', async ({ tenant }) => {
    const ctx = ctxOf(tenant);
    await createCase(ctx, { title: 'Log in', priority: 'low' });
    const csv = toCsv(await exportCases(tenant.project.id)).replace(',low,', ',high,');

    expect(await importCases(ctx, parseImport({ name: 'a.csv', text: csv }, []), 'skip')).toMatchObject({ created: 0, skipped: 1 });
    expect(await importCases(ctx, parseImport({ name: 'a.csv', text: csv }, []), 'update')).toMatchObject({ updated: 1 });
    expect((await listCases(tenant.project.id)).rows[0].priority).toBe('high');
    expect(await importCases(ctx, parseImport({ name: 'a.csv', text: csv }, []), 'copy')).toMatchObject({ created: 1 });
    expect((await listCases(tenant.project.id)).total).toBe(2);
  });

  test('a title longer than the limit is cut, not rejected', async ({ tenant }) => {
    const ctx = ctxOf(tenant);
    const csv = `title,tags\nGood one,a\n${'x'.repeat(600)},b\n`;
    const summary = await importCases(ctx, parseImport({ name: 'a.csv', text: csv }, []), 'skip');
    expect(summary.created).toBe(2);
    expect((await listCases(tenant.project.id)).rows.map((r) => r.title.length)).toEqual([8, 500]);
  });
});
