# Queen Bot Workflows

Overview of supported governance workflows.

## Issues Workflow

Issues go through a timed governance lifecycle with community voting.

```
┌─────────────┐     24 hrs*     ┌─────────────┐     24 hrs*     ┌─────────────┐
│  Discussion │ ──────────────► │   Voting    │ ──────────────► │   Outcome   │
│    phase    │                 │    phase    │                 │             │
└─────────────┘                 └─────────────┘                 └─────────────┘
     │                               │                               │
     ▼                               ▼                               ▼
 • "phase:discussion"            • "phase:voting"              • "phase:ready-to-implement" → locked
   label added                     label added                 • "rejected" → closed & locked
 • Welcome comment               • Voting comment              • "phase:extended-voting" → extended voting
   posted                          posted                            │
                                 • 👍/👎/😕 reactions                 ▼
                                   on voting comment           Extended voting (24 hrs*)
                                                                     │
                                                                     ▼
                                                               Clear winner → normal outcome
                                                               Still tied → closed & locked
```

*Durations are configurable via exit definitions in `.github/hivemoot.yml`.
Scheduled transitions are controlled per phase via `exits[].type`:
- `type: manual` (default): no scheduled transition for that phase.
- `type: auto`: scheduled transition is enabled for that phase.

### Phase Details

**Discussion Phase**
- Triggered: When issue is opened
- Actions: Add "phase:discussion" label, post welcome comment
- Community: Analyze, propose, discuss

**Voting Phase**
- Triggered: After discussion duration expires
- Actions: Swap labels, post voting instructions comment
- Community: React to the **bot's voting comment** with:
  - 👍 to support
  - 👎 to oppose
  - 😕 to abstain/need more info

**Outcome**
- **Ready to implement:** 👍 > 👎 — issue stays open for implementation, locked
- **Rejected:** 👎 > 👍 — issue is closed and locked
- **Inconclusive:** tie (including 0-0) — enters extended voting round (`phase:extended-voting`)

**Extended Voting** (for inconclusive outcomes)
- Triggered: After initial voting ends in a tie
- Duration: Same as regular voting period (default 24 hours)
- Community: Continue voting on the original voting comment
- After extended voting:
  - **Clear winner emerges:** Normal outcome applies (ready-to-implement or rejected)
  - **Still tied:** Issue is closed and locked with "inconclusive" label (final)

### Vote Counting

Votes are counted from the bot's voting comment reactions (not issue reactions). This ensures:
- Clear voting period boundaries
- Votes cast during discussion don't count
- Transparent, auditable results

Additional rules apply to keep voting fair and deterministic:
- Only 👍/👎/😕 reactions on the bot’s voting comment are counted; all other reactions are ignored.
- If a user reacts with more than one voting reaction type, **all** of their votes are discarded from the tally and they do not count toward quorum.
- Each voting exit specifies its own `minVoters` (quorum) and `requiredVoters` (participation requirement). If quorum or required-voter participation is not met, the outcome is forced to **extended voting** (or **inconclusive** if already in extended voting).
- Multiple exits can be configured with different time gates and conditions. Early exits (all except the last) are evaluated first-match-wins. The last exit is the deadline.
- Each exit can also specify a `requires` condition: `majority` (default) or `unanimous`.

These settings are configured per repo in `.github/hivemoot.yml` under:
- `governance.proposals.discussion.exits`
- `governance.proposals.voting.exits`
- `governance.proposals.extendedVoting.exits`

## Pull Requests Workflow

PRs go through a complete lifecycle from opening to merge/close, with special handling for PRs that implement phase:ready-to-implement issues.

### PR Lifecycle Overview

```
┌─────────────┐                    ┌─────────────────────┐
│  PR Opened  │ ──────────────────►│  Welcome + Checks   │
└─────────────┘                    └─────────────────────┘
       │                                     │
       │                                     ▼
       │                           ┌─────────────────────┐
       │   Links to phase:ready-   │  Standard PR        │
       │     to-implement issue?   │  (no special label) │
       │                           └─────────────────────┘
       │
       ▼ YES
┌─────────────────────┐            ┌─────────────────────┐
│ Implementation PR   │ ──────────►│  Competing PRs      │
│ "implementation"    │            │  on Leaderboard     │
│  label added        │            └─────────────────────┘
└─────────────────────┘
       │
       │ Reviews + Approvals
       ▼
┌─────────────────────┐            ┌─────────────────────┐
│   PR Merged         │ ──────────►│ Issue "implemented" │
│                     │            │ Losers closed       │
└─────────────────────┘            └─────────────────────┘
```

### Step 1: PR Opened

When any PR is opened, the bot posts a welcome comment with a review checklist. This happens regardless of whether the PR is an implementation of a phase:ready-to-implement issue.

### Step 2: Issue Linking Check

The bot examines the PR for issue links (GitHub's "Fixes #N", "Closes #N", or "Resolves #N" syntax in the PR description). Plain `#N` mentions are ignored for eligibility and leaderboard tracking. For each linked issue:

1. **Not Ready Yet:** If the issue doesn't have the "phase:ready-to-implement" label, the bot warns the PR author that the issue hasn't completed the voting phase yet.

2. **Ready to Implement:** If the issue has the "phase:ready-to-implement" label, the bot:
   - Adds the "implementation" label to the PR
   - Posts a comment on the linked issue announcing the new implementation
   - Checks if the PR limit has been reached

### Step 3: PR Limit Enforcement

Each phase:ready-to-implement issue can only have a limited number of competing PRs (default: 3). This prevents overwhelming maintainers and ensures focused review.

- If the limit is reached, the new PR is automatically closed with an explanation
- The comment lists the existing competing PRs so authors can evaluate if they want to compete

### Step 4: Leaderboard Tracking

For phase:ready-to-implement issues with multiple competing PRs, the bot maintains a **leaderboard comment** on the issue showing:

| PR | Author | Approvals |
|----|--------|-----------|
| #15 | @alice | 3 |
| #18 | @bob | 2 |
| #22 | @carol | 1 |

The leaderboard updates automatically when:
- A PR receives an approving review
- This helps maintainers see which implementation has the most community support

### Step 5: Review & Approval Process

Implementation PRs compete based on:
- Code quality (standard PR review process)
- Community approval (👍 reactions, review approvals)
- Maintainer discretion

There is no automatic merge - maintainers decide which implementation best solves the issue.

### Step 6: PR Merged (Winner)

When a maintainer merges an implementation PR:

1. **Issue Updated:** The linked issue:
   - Receives "implemented" label (replaces "phase:ready-to-implement")
   - Is closed with "completed" reason
   - Gets a comment crediting the implementation author

2. **Competing PRs Closed:** All other PRs linked to the same issue are:
   - Automatically closed
   - Notified that another implementation was chosen
   - Authors thanked for their contribution

### Stale PR Handling

Implementation PRs are monitored for activity to free up slots for active contributors:

```
┌─────────────┐   N days*   ┌─────────────┐   N days*   ┌─────────────┐
│   Active    │ ──────────► │    Stale    │ ──────────► │   Closed    │
│             │             │   Warning   │             │             │
└─────────────┘             └─────────────┘             └─────────────┘
       ▲                          │
       │    Activity resumes      │
       └──────────────────────────┘
```

*Default stale threshold is 3 days. PRs are closed after 2x the threshold (6 days) of inactivity.

**Timeline:**
1. **Day 0-3:** PR is considered active
2. **Day 3:** "stale" label added, warning comment posted
3. **Day 3-6:** Author can resume work to remove stale status
4. **Day 6:** PR automatically closed if still inactive

**Recovery:** Any activity (commits, comments, reviews) resets the timer and removes the "stale" label.

**Why this matters:** Closing abandoned PRs frees up implementation slots so other contributors can attempt the feature.

### Merge Readiness

When configured, the bot automatically manages a `merge-ready` label on implementation PRs. This label signals that a PR meets all technical prerequisites for merging and is safe for maintainers to merge without further checks.

**All five conditions must be true for the label to be added:**

1. PR has the `implementation` label (active competing PR)
2. At least `minApprovals` approvals from `trustedReviewers`
3. PR has no merge conflicts (`mergeable` is not `false`)
4. All GitHub Actions check runs on HEAD are completed with success, neutral, or skipped
5. All legacy Status API statuses on HEAD are successful (or no statuses exist)

```
┌─────────────────────┐         ┌─────────────────┐
│  implementation PR  │ ──────► │  All conditions  │ ──► "merge-ready" label added
│  (webhook or cron)  │         │  evaluated       │
└─────────────────────┘         └─────────────────┘
                                        │
                                  Condition fails
                                        │
                                        ▼
                                "merge-ready" label removed (if present)
```

**Evaluation triggers:**
- **Webhooks:** PR review submitted, check suite completed, status event, label changes
- **Scheduled reconciliation:** Hourly sweep of all `implementation` PRs to catch missed events and stale labels

**Configuration:**

```yaml
governance:
  pr:
    trustedReviewers:
      - alice
      - bob
    mergeReady:
      minApprovals: 2
```

- `trustedReviewers`: list of GitHub usernames whose approvals count toward merge readiness. Also used by the `approval` intake method.
- `mergeReady.minApprovals`: minimum number of trusted reviewer approvals required. Clamped to `[1, trustedReviewers.length]`. If `trustedReviewers` is empty or `mergeReady` is omitted, the feature is disabled.

### Intake Methods

When a PR links to a `phase:ready-to-implement` issue, the bot determines whether to activate it as an implementation PR. The `intake` configuration controls how this decision is made.

Two methods are available, evaluated in order:

| Method | Behavior |
|--------|----------|
| `update` | PR is activated immediately when it links to a ready issue. Only applies to PRs opened or updated after the issue reached `phase:ready-to-implement`. |
| `approval` | PR is activated when it accumulates `minApprovals` approvals from `trustedReviewers`. This allows PRs opened before voting concluded to qualify later. |

```yaml
governance:
  pr:
    intake:
      - method: update
      - method: approval
        minApprovals: 2
```

Multiple methods can be configured. A PR is activated by the first method that matches.

## Automation

| Trigger | Handler | Frequency |
|---------|---------|-----------|
| Issue opened | Webhook | Real-time |
| PR opened | Webhook | Real-time |
| PR review / check suite / status | Webhook | Real-time |
| PR merged | Webhook | Real-time |
| Issue phase transitions | Scheduled script | Daily |
| Stale PR cleanup | Scheduled script | Every 30 min |
| PR notification reconciliation | Scheduled script | Every 2 hours |
| Merge-ready label reconciliation | Scheduled script | Hourly |
| Daily standup report | Scheduled script | Daily |

## Configuration

### Per-Repo Config (`.github/hivemoot.yml`)

```yaml
version: 1
governance:
  proposals:
    discussion:
      exits:
        - type: auto
          afterMinutes: 1440
    voting:
      exits:
        - type: auto
          afterMinutes: 1440
    extendedVoting:
      exits:
        - type: auto
          afterMinutes: 1440
  pr:
    staleDays: 3
    maxPRsPerIssue: 3
    trustedReviewers:
      - alice
      - bob
    intake:
      - method: update
      - method: approval
        minApprovals: 2
    mergeReady:
      minApprovals: 2
```

| Setting | Default | Description |
|---------|---------|-------------|
| `governance.proposals.*.exits[].type` | `manual` | Phase transition mode: `manual` or `auto` |
| `governance.proposals.*.exits[].afterMinutes` | 1440 | Duration before auto-transition (1–43200) |
| `governance.pr.staleDays` | 3 | Days before stale warning (1–30) |
| `governance.pr.maxPRsPerIssue` | 3 | Max competing implementations (1–10) |
| `governance.pr.trustedReviewers` | `[]` | Usernames whose approvals count for intake and merge readiness |
| `governance.pr.intake` | `[{method: "update"}]` | Ordered list of intake activation methods |
| `governance.pr.mergeReady` | disabled | Merge-readiness label config; requires `trustedReviewers` |
| `governance.pr.mergeReady.minApprovals` | 1 | Trusted approvals needed for `merge-ready` label (1–20) |

### Environment Variables (Global Defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `HIVEMOOT_DISCUSSION_DURATION_MINUTES` | 1440 (24h) | Discussion phase length |
| `HIVEMOOT_VOTING_DURATION_MINUTES` | 1440 (24h) | Voting phase length |
| `HIVEMOOT_PR_STALE_DAYS` | 3 | Days until PR gets stale warning |
| `HIVEMOOT_MAX_PRS_PER_ISSUE` | 3 | Max competing implementations |
