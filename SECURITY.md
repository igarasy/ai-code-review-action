# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private
[security advisory form](https://github.com/igarasy/ai-code-review-action/security/advisories/new)
or email igarasshi.lucass@gmail.com. You'll get an answer within 72 hours.

## Threat model

Pull request content (diff, title, description, file names) is attacker-controlled.
The action is designed so that a malicious pull request cannot:

- **Approve itself or block merges:** reviews are always posted as `COMMENT`.
- **Change the reviewer's rules:** `instructions-file` is read from the base commit.
- **Make the bot ping, link or track:** model output is sanitized (mentions,
  issue references, images, links, HTML) before it is posted.
- **Post comments elsewhere:** inline comments are limited to lines present in the diff.
- **Run code:** the action fetches the diff through the API and never checks out
  or executes pull request code.

The Anthropic API key is masked in logs. Grant the workflow only
`contents: read` and `pull-requests: write`.

Known limitation: prompt injection can still lower review quality (for example,
by convincing the model that a bug is intended). Treat AI findings as suggestions,
not as a security gate.
