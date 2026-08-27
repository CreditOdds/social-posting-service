/**
 * Scheduler eligibility / spacing tests.
 *
 * Runs the scheduler's REAL NEXT_ELIGIBLE_SQL against a throwaway MySQL in
 * Docker. The query is read out of the handler source rather than copied, so
 * this cannot drift from the code it is testing.
 *
 *   node api/test/scheduler-spacing.test.js
 *
 * Requires Docker. Starts and removes its own `cw-spacing-test` container.
 *
 * Regression covered: card-wire posts are blackout_exempt, and exemption used
 * to bypass the per-post min_gap_minutes as well as the blackout. On
 * 2026-08-27 three Delta CardWire SUB increases were queued two seconds apart
 * by one merge and all three tweeted in the same scheduler tick. Scenario A
 * fails against the pre-fix query and passes after it.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONTAINER = 'cw-spacing-test';
const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'api', 'src', 'handlers', 'social-scheduler.js');

const SQL = fs.readFileSync(SRC, 'utf8').match(/const NEXT_ELIGIBLE_SQL = `([\s\S]*?)`;/)[1];
const PLACEHOLDERS = (SQL.match(/\?/g) || []).length;
if (PLACEHOLDERS !== 3) {
  throw new Error(`NEXT_ELIGIBLE_SQL has ${PLACEHOLDERS} placeholders, expected 3 ` +
    '(inBlackout, globalMinGap, globalMinGap) — update this test with the handler.');
}

function docker(args, opts = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...opts });
}

function sql(text) {
  return docker(
    ['exec', '-i', CONTAINER, 'mysql', '-uroot', '-ptest', 'social', '-N', '-B', '-e', text],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
}

function startDb() {
  try { docker(['rm', '-f', CONTAINER], { stdio: 'ignore' }); } catch { /* not running */ }
  docker([
    'run', '-d', '--name', CONTAINER,
    '-e', 'MYSQL_ROOT_PASSWORD=test', '-e', 'MYSQL_DATABASE=social',
    'mysql:8',
  ], { stdio: 'ignore' });

  // `mysqladmin ping` answers from the temporary server the entrypoint runs
  // during initialisation, so it reports ready before the real server has
  // restarted. Poll with an actual query against the target schema instead.
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      docker(['exec', CONTAINER, 'mysql', '-uroot', '-ptest', 'social', '-N', '-B', '-e', 'SELECT 1'],
        { stdio: ['pipe', 'pipe', 'pipe'] });
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('MySQL did not become ready within 180s');
      execFileSync('sleep', ['3']);
    }
  }

  // 001 already carries the priority/queue_group/min_gap columns that 002 adds,
  // so 002 is a no-op here and its duplicate-column error is expected.
  for (const file of fs.readdirSync(path.join(REPO, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
    try {
      docker(['exec', '-i', CONTAINER, 'mysql', '-uroot', '-ptest', 'social'], {
        input: fs.readFileSync(path.join(REPO, 'migrations', file), 'utf8'),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const msg = String(err.stderr || '');
      if (!msg.includes('Duplicate column name')) throw new Error(`${file}: ${msg}`);
    }
  }
}

// Bind [inBlackout, globalMinGap, globalMinGap] exactly as the handler does.
function nextEligible(inBlackout = 0, globalGap = 0) {
  const vals = [inBlackout, globalGap, globalGap];
  let i = 0;
  const out = sql(SQL.replace(/\?/g, () => String(vals[i++])));
  return out === '' ? null : Number(out.split('\n')[0]);
}

const reset = () => sql('DELETE FROM social_posts;');
const markPosted = id => sql(`UPDATE social_posts SET status='posted', posted_at=NOW() WHERE id=${id};`);

function seed({ gap, group = 'card-wire', exempt = 1, n = 3, priority = 200 }) {
  for (let k = 1; k <= n; k++) {
    sql(
      `INSERT INTO social_posts (text_content, source_type, status, priority, queue_group,
        min_gap_minutes, blackout_exempt, created_by)
       VALUES ('post ${k}', 'api', 'queued', ${priority},
        ${group === null ? 'NULL' : `'${group}'`},
        ${gap === null ? 'NULL' : gap}, ${exempt}, 'system');`
    );
  }
}

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `  (got ${actual}, want ${expected})`));
}

function run() {
  console.log('\nA. card-wire burst is paced by the per-post gap');
  reset(); seed({ gap: 30 });
  const a1 = nextEligible();
  check('first post is eligible', a1 !== null, true);
  markPosted(a1);
  check('second post is HELD by the 30m gap', nextEligible(), null);

  console.log('\nB. a NULL gap still means no pacing');
  reset(); seed({ gap: null });
  markPosted(nextEligible());
  check('second post publishes immediately', nextEligible() !== null, true);

  console.log('\nC. urgent lane still bypasses the blackout window');
  reset(); seed({ gap: 30, n: 1 });
  check('exempt post eligible during blackout', nextEligible(1) !== null, true);

  console.log('\nD. non-exempt posts are still blocked by the blackout');
  reset(); seed({ gap: null, exempt: 0, n: 1, group: null });
  check('blocked during blackout', nextEligible(1), null);
  check('eligible outside blackout', nextEligible(0) !== null, true);

  console.log('\nE. urgent lane still bypasses the GLOBAL pacing gap');
  reset(); seed({ gap: null, n: 2 });
  markPosted(nextEligible());
  check('exempt ignores a 60m global gap', nextEligible(0, 60) !== null, true);

  console.log('\nF. an explicit gap of 0 opts back into immediate publishing');
  reset(); seed({ gap: 0 });
  markPosted(nextEligible());
  check('gap 0 does not hold the next post', nextEligible() !== null, true);

  console.log('\nG. the gap is scoped to queue_group, not to all traffic');
  reset();
  seed({ gap: 30, n: 1, group: 'card-wire' });
  seed({ gap: 30, n: 1, group: 'other-group' });
  markPosted(nextEligible());
  check('a different group is not held', nextEligible() !== null, true);
}

try {
  startDb();
  run();
} finally {
  try { docker(['rm', '-f', CONTAINER], { stdio: 'ignore' }); } catch { /* already gone */ }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
