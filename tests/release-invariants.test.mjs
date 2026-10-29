import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('deployment never runs database migrations or demo seed', () => {
  const cfg = JSON.parse(read('vercel.json'));
  assert.doesNotMatch(cfg.buildCommand, /db:seed|migrate|prisma db push|db:reset/i);
  assert.match(cfg.buildCommand, /bun run build/);
});

test('self-signup and automatic administrator grants are absent', () => {
  const auth = read('src/lib/auth.ts');
  assert.match(auth, /disableSignUp:\s*true/);
  assert.doesNotMatch(auth, /role:\s*["']admin["']/);
});

test('old daily cron cannot process delayed messages', () => {
  const outbox = read('src/services/outbox.service.ts');
  assert.match(outbox, /eventType:\s*["']application\.status_changed["']/);
  assert.doesNotMatch(outbox, /processDelayedCertFollowup\(/);
});

test('new dispatcher has a date fence and a new-event prefix fence', () => {
  const handler = read('src/services/delayed-followups.service.ts');
  assert.match(handler, /AND id LIKE 'followup:%'/);
  assert.match(handler, /"createdAt" >= \$\{activatedAt\}/);
  assert.match(handler, /FOR UPDATE SKIP LOCKED/);
  assert.match(handler, /application\.status !== "approved"/);
});

test('cron endpoint requires bearer secret and can be disabled', () => {
  const route = read('src/app/api/cron/process-delayed-messages/route.ts');
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /if \(!secret\) return false/);
  assert.match(route, /DELAYED_FOLLOWUPS_ENABLED !== "true"/);
  assert.match(route, /export async function POST/);
});

test('diagnostic auth-session route is removed', () => {
  assert.equal(existsSync(new URL('../src/app/api/debug/auth-session/route.ts', import.meta.url)), false);
});
