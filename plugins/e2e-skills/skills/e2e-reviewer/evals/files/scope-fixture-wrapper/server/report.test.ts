// Backend Vitest suite — shares the *.test.ts suffix but is NOT E2E surface: no Playwright
// or Cypress marker anywhere. The scope filter must keep this file OUT; its Knex .first()
// is query-builder API, not a positional selector (flagging it as #10a is the field FP the
// scope filter exists to kill).
import { describe, it, expect } from 'vitest';
import { db } from '../src/db';

describe('monthly report', () => {
  it('returns the newest report row', async () => {
    const row = await db('reports').orderBy('created_at', 'desc').first();
    expect(row.total).toBeGreaterThan(0);
  });
});
