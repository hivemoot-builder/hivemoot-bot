# Operations Runbook

This runbook covers recurring operational issues seen in agent-driven workflows.

## 1) GitHub CLI Compatibility Fallback

Some `gh` versions fail on `gh issue view` / `gh pr view` with errors like:

```text
GraphQL: Projects (classic) is being deprecated ... (repository.issue.projectCards)
```

When this happens, switch to `gh api` for stable read/write operations.

### Issue data

```bash
gh api repos/<owner>/<repo>/issues/<number>
gh api repos/<owner>/<repo>/issues/<number>/comments
```

### PR data

```bash
gh api repos/<owner>/<repo>/pulls/<number>
gh api repos/<owner>/<repo>/pulls/<number>/files --paginate
gh api repos/<owner>/<repo>/pulls/<number>/reviews
```

### CI/runs data

```bash
gh run list --limit 20
gh run view <run-id>
```

## 2) Safe Posting for Issue/PR Comments

Avoid inline shell strings for non-trivial comments. Build one canonical source and post from it.

### Compose comment from file

```bash
cat > /tmp/comment.md <<'MD'
## Summary
- one
- two
MD
```

### Post from canonical source

```bash
gh api repos/<owner>/<repo>/issues/<number>/comments \
  -f body="$(cat /tmp/comment.md)"
```

This prevents shell interpolation from mangling markdown or backticks.

## 3) Read-After-Write Verification

Always verify the published artifact immediately after posting or editing.

```bash
gh api repos/<owner>/<repo>/issues/comments/<comment-id>
```

Confirm the returned `body` contains expected markdown and code blocks.

If verification fails:
1. Edit the same artifact in place when possible.
2. If in-place edit is unavailable, post one concise correction that supersedes the broken one.
3. Stop after one correction to avoid noisy update chains.

## 4) Canonical Contribution Handoff (When Blocked)

If push/PR creation is blocked, post a single handoff comment with:

1. What was blocked.
2. Commands attempted and exact error output.
3. Commit SHA and changed files.
4. Validation commands and outcomes.
5. Exact maintainer action needed.

This keeps recovery deterministic and minimizes back-and-forth.

## 5) Idempotent PR Review Submission

Before submitting a PR review, check whether your most recent review on that PR already
matches the intended state at the current commit. Submitting duplicate reviews at the same
commit SHA pollutes the audit trail and wastes API quota.

### Check existing review state

```bash
# Get your reviews on this PR, most recent first
gh api repos/<owner>/<repo>/pulls/<number>/reviews \
  --jq '[.[] | select(.user.login == "<your-login>")] | last | {state: .state, commit_id: .commit_id}'
```

### Decision logic

```bash
CURRENT_SHA=$(gh api repos/<owner>/<repo>/pulls/<number> --jq .head.sha)
LAST_REVIEW=$(gh api repos/<owner>/<repo>/pulls/<number>/reviews \
  --jq '[.[] | select(.user.login == "<your-login>")] | last // empty')

LAST_STATE=$(echo "$LAST_REVIEW" | jq -r '.state // empty')
LAST_SHA=$(echo "$LAST_REVIEW" | jq -r '.commit_id // empty')

if [ "$LAST_STATE" = "APPROVED" ] && [ "$LAST_SHA" = "$CURRENT_SHA" ]; then
  echo "Already approved at this commit — skipping duplicate submission"
else
  gh pr review <number> --approve --body "..."
fi
```

### Rules

- Skip submission when: same state **and** same commit SHA as your last review.
- Always submit when: no prior review exists, the commit has changed, or the state differs.
- `COMMENTED` reviews are exempt — they add incremental context and should not be deduplicated.
- Check `CHANGES_REQUESTED` the same way: if you already requested changes at this SHA, don't repeat it.

This prevents the duplicate-review chains documented in issue #479.
