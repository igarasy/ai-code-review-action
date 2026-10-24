import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';
import { readConfig, severityRank, type Config } from './config.js';
import { placeFindings, summaryBody, lastReviewedSha } from './comments.js';
import { selectFiles, type PrFile } from './diff.js';
import { estimateCostUsd } from './pricing.js';
import { runReview } from './review.js';

type Octokit = ReturnType<typeof github.getOctokit>;

const SUPPORTED_EVENTS = new Set(['pull_request', 'pull_request_target']);

export async function run(): Promise<void> {
  const apiKey = core.getInput('anthropic-api-key', { required: true });
  core.setSecret(apiKey);
  const config = readConfig((name) => core.getInput(name));

  const { context } = github;
  const pr = context.payload.pull_request;
  if (!SUPPORTED_EVENTS.has(context.eventName) || !pr) {
    core.notice(`Skipping: this action runs on pull_request events (got "${context.eventName}").`);
    return;
  }
  if (config.skipDrafts && pr.draft) {
    core.notice('Skipping draft pull request.');
    return;
  }

  const octokit = github.getOctokit(core.getInput('github-token', { required: true }));
  const { owner, repo } = context.repo;
  const number: number = pr.number;
  const headSha: string = pr.head.sha;
  const baseSha: string = pr.base.sha;

  // All files of the PR: defines where comments are allowed.
  const prFiles = (await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 })) as PrFile[];

  // Incremental: on new pushes, only send what changed since the last reviewed commit.
  let toReview = prFiles;
  if (config.incremental && context.payload.action === 'synchronize') {
    const since = await previousSha(octokit, owner, repo, number);
    if (since === headSha) {
      core.notice('This commit was already reviewed.');
      return;
    }
    if (since) {
      try {
        const cmp = await octokit.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${since}...${headSha}` });
        const changed = new Set((cmp.data.files ?? []).map((f) => f.filename));
        toReview = prFiles.filter((f) => changed.has(f.filename));
        core.info(`Incremental review: ${toReview.length} of ${prFiles.length} file(s) changed since ${since.slice(0, 7)}.`);
      } catch {
        core.info('Previous review commit is no longer reachable (force-push?); reviewing the whole PR.');
      }
    }
  }

  const selection = selectFiles(toReview, { include: config.include, exclude: config.exclude, maxChars: config.maxDiffChars });
  if (selection.files.length === 0) {
    core.notice('No reviewable changes after filters.');
    return;
  }
  // Comments are validated against the full PR diff, not just the reviewed slice.
  const allFiles = selectFiles(prFiles, { include: [], exclude: [], maxChars: Number.MAX_SAFE_INTEGER }).files;

  const guidelines = await readGuidelines(octokit, owner, repo, config.instructionsFile, baseSha);
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60_000 });

  core.info(`Reviewing ${selection.files.length} file(s) with ${config.model} (effort ${config.effort})…`);
  const outcome = await runReview(client, {
    diffText: selection.text,
    title: String(pr.title ?? ''),
    description: String(pr.body ?? ''),
    guidelines,
    config,
  });

  const costUsd = estimateCostUsd(config.model, outcome.usage);
  core.info(`Tokens: in ${outcome.usage.input}, cached ${outcome.usage.cacheRead}, out ${outcome.usage.output}${costUsd !== null ? ` (~US$ ${costUsd.toFixed(4)})` : ''}`);

  const placement = outcome.result ? placeFindings(outcome.result.findings, allFiles, config) : null;
  const body = summaryBody({
    summary: outcome.result?.summary ?? null,
    placement,
    selection,
    config,
    model: outcome.model,
    costUsd,
    headSha,
    refused: outcome.refused,
  });

  // Always COMMENT: an AI reviewer never approves or blocks merges on its own.
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    commit_id: headSha,
    event: 'COMMENT',
    body,
    comments: placement?.inline ?? [],
  });

  const kept = placement?.kept ?? [];
  core.setOutput('findings-count', kept.length);
  core.setOutput('inline-count', placement?.inline.length ?? 0);
  core.setOutput('cost-usd', costUsd !== null ? costUsd.toFixed(6) : '');
  failIfNeeded(config, kept.map((f) => f.severity));
}

function failIfNeeded(config: Config, severities: Array<Parameters<typeof severityRank>[0]>): void {
  if (config.failOn === 'none') return;
  const threshold = severityRank(config.failOn);
  const blocking = severities.filter((s) => severityRank(s) >= threshold).length;
  if (blocking > 0) core.setFailed(`${blocking} finding(s) at or above "${config.failOn}".`);
}

async function previousSha(octokit: Octokit, owner: string, repo: string, number: number): Promise<string | null> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, { owner, repo, pull_number: number, per_page: 100 });
  const ours = reviews.filter((r) => r.user?.type === 'Bot').map((r) => r.body ?? '');
  return lastReviewedSha(ours);
}

/** Guidelines come from the base commit, so a PR can't rewrite its own review rules. */
async function readGuidelines(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data) || res.data.type !== 'file' || !('content' in res.data)) return null;
    return Buffer.from(res.data.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}
