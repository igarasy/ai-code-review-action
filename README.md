# AI Code Review (Claude)

A GitHub Action that reviews pull requests with Claude and posts **inline comments on the changed lines**, plus a short summary. Built to be cheap to run and hard to abuse.

- **Signal over noise:** bugs, security, reliability and performance only; no style nitpicks. Severity filter and a hard cap on findings.
- **Incremental:** on new pushes it reviews only what changed since its last review.
- **Cost-aware:** diff budget, built-in excludes (lockfiles, `dist`, minified files, binaries), prompt caching and a cost estimate on every review.
- **Your rules:** reviewer guidelines in `.github/ai-review.md`, always read from the base branch.
- **One-click fixes:** suggestions use GitHub's `suggestion` blocks.
- **English or Portuguese** reviews.

> Leia em português [mais abaixo](#português).

## Quick start

1. Add your Anthropic API key as a repository secret named `ANTHROPIC_API_KEY`.
2. Create `.github/workflows/ai-review.yml`:

```yaml
name: AI review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: ai-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: igarasy/ai-code-review-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # model: claude-sonnet-5-5   # cheaper
          # language: pt-BR
          # fail-on: critical
```

No checkout step is needed: the action reads the diff through the GitHub API and never runs code from the pull request.

## Inputs

| Input | Default | Description |
|---|---|---|
| `anthropic-api-key` | — | **Required.** Anthropic API key. |
| `github-token` | `github.token` | Needs `pull-requests: write`. |
| `model` | `claude-opus-5-5` | Any Claude model ID. `claude-sonnet-5-5` and `claude-haiku-5-5` are cheaper. |
| `effort` | `medium` | `low`, `medium`, `high`, `xhigh`, `max`. Higher = more thorough and more expensive. |
| `language` | `en` | `en` or `pt-BR`. |
| `min-severity` | `medium` | Lowest severity posted: `low`, `medium`, `high`, `critical`. |
| `max-findings` | `10` | Cap per review (1–50). |
| `max-diff-chars` | `120000` | Diff budget. Files beyond it are skipped and listed in the summary. |
| `include` | — | Globs to review (comma/newline separated). |
| `exclude` | — | Extra globs to skip, on top of the built-in list. |
| `instructions-file` | `.github/ai-review.md` | Guidelines for the reviewer, read from the base branch. |
| `fail-on` | `none` | Fail the check at this severity or above. |
| `skip-drafts` | `true` | Skip draft PRs. |
| `incremental` | `true` | Review only new changes on `synchronize`. |

Outputs: `findings-count`, `inline-count`, `cost-usd`.

## Cost

Rough per-review cost for a medium PR (~20k tokens of diff, ~2k tokens of output):

| Model | Approx. cost |
|---|---|
| `claude-haiku-5-5` | < US$ 0.01 |
| `claude-sonnet-5-5` | ~US$ 0.06 |
| `claude-opus-5-5` (default) | ~US$ 0.12 |

Every summary shows the estimated cost of that run. Incremental reviews and the diff budget keep follow-up pushes cheap.

## Security

The diff of a pull request is **untrusted input**, so this action assumes it may contain prompt-injection attempts:

- **It never approves or requests changes.** Reviews are always `COMMENT`; use `fail-on` if you want a blocking check under your own rules.
- **Guidelines come from the base branch**, so a PR can't rewrite the reviewer's instructions.
- **Output is constrained and validated:** a JSON schema for the model, then re-validation; comments are posted only on lines that exist in the diff.
- **Output is sanitized:** @-mentions, issue references, images, links and HTML are neutralized, which blocks spam pings, tracking pixels and data exfiltration through image URLs.
- **No code from the PR is executed** and no checkout is required. The API key is masked in logs.
- Use the `pull_request` event. With `pull_request_target`, secrets are exposed to forked PRs' workflows; this action doesn't run PR code, but don't combine it with steps that do.

See [SECURITY.md](SECURITY.md).

## Development

```bash
npm install
npm run check   # typecheck + tests + bundle (dist/index.cjs is committed)
```

## Português

Action do GitHub que revisa pull requests com o Claude e comenta direto nas linhas alteradas, com resumo, filtro de severidade, revisão incremental, controle de custo e diretrizes do repositório em `.github/ai-review.md` (sempre lidas da branch base). Use `language: pt-BR` para revisões em português.

Ela trata o diff como **entrada não confiável**: nunca aprova PR, valida a saída do modelo, só comenta em linhas do diff, neutraliza menções, links e imagens e não executa código do PR.

## License

MIT © [Lucas Igarashi](https://igarasy.dev)
