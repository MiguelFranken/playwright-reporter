/**
 * The runs `schedule.ts` plans for the current slot, as a GitHub Actions
 * matrix: one entry per shard, with everything the job hands the reporter.
 * Writes `matrix=…` to `$GITHUB_OUTPUT` when there is one, and prints it.
 *
 *   nub scripts/plan.ts [--at <iso time>]
 */
import { appendFileSync } from 'node:fs';
import { planSlot, slotOf } from '../schedule';

const i = process.argv.indexOf('--at');
const at = i > 0 ? new Date(process.argv[i + 1]) : new Date();

const include = planSlot(slotOf(at)).flatMap((run) =>
  Array.from({ length: run.shards }, (_, shard) => ({
    id: run.id,
    branch: run.branch,
    scenario: run.scenario,
    sha: run.sha,
    message: run.message,
    author: run.author,
    environment: run.environment,
    tags: run.tags.join(','),
    shard: `${shard + 1}/${run.shards}`,
  })),
);

const matrix = JSON.stringify({ include });
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
console.log(JSON.stringify(include, null, 2));
