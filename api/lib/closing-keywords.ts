/**
 * Detect whether a PR body contains same-repository closing keyword syntax.
 *
 * Supported forms:
 * - Fixes #123
 * - Closes owner/repo#123
 * - Resolves https://github.com/owner/repo/issues/123
 */

interface RepositoryRef {
  owner: string;
  repo: string;
}

const CLOSING_KEYWORD_PATTERN =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s+([^\s]+)/gi;

const ISSUE_NUMBER_PATTERN = /^#\d+$/;
const QUALIFIED_REFERENCE_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#\d+$/;
const ISSUE_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/i;

function stripTrailingPunctuation(token: string): string {
  return token.replace(/[),.;:!?]+$/, "");
}

function stripMarkdownCode(body: string): string {
  return body
    // Remove fenced code blocks (```...``` and ~~~...~~~)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    // Remove inline code spans (`...`)
    .replace(/`[^`]*`/g, " ");
}

/**
 * Issue numbers extracted from same-repo closing keyword references in a PR body.
 * Returns null when no closing keyword references are found at all (caller should
 * treat the linked-issue list as unfiltered in that case).
 */
function extractConfirmedClosingRefNumbers(
  body: string,
  repository: RepositoryRef
): Set<number> | null {
  const searchableBody = stripMarkdownCode(body);
  const confirmed = new Set<number>();
  const normalizedOwner = repository.owner.toLowerCase();
  const normalizedRepo = repository.repo.toLowerCase();

  for (const match of searchableBody.matchAll(CLOSING_KEYWORD_PATTERN)) {
    const rawTarget = match[1];
    if (!rawTarget) continue;
    const target = stripTrailingPunctuation(rawTarget);

    // Form 1: #N — same-repo short reference
    const simpleMatch = target.match(/^#(\d+)$/);
    if (simpleMatch) {
      confirmed.add(parseInt(simpleMatch[1], 10));
      continue;
    }

    // Form 2: owner/repo#N
    const qualifiedMatch = target.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
    if (qualifiedMatch) {
      const [, owner, repo, num] = qualifiedMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        confirmed.add(parseInt(num, 10));
      }
      continue;
    }

    // Form 3: https://github.com/owner/repo/issues/N
    const urlMatch = target.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/i);
    if (urlMatch) {
      const [, owner, repo, num] = urlMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        confirmed.add(parseInt(num, 10));
      }
    }
  }

  return confirmed.size > 0 ? confirmed : null;
}

/**
 * Filter linked issues to only those with a confirmed closing keyword reference
 * in the PR body. Strips code blocks and inline code before matching so that
 * example keywords inside documentation or templates are ignored.
 *
 * Fail-safe: if no confirmed issue numbers can be extracted from the body
 * (body is absent, blank, or contains only code-block keywords), the original
 * list is returned unchanged to avoid false negatives.
 */
export function filterToConfirmedClosingRefs<T extends { number: number }>(
  linkedIssues: T[],
  prBody: string | null | undefined,
  repository: RepositoryRef
): T[] {
  if (!linkedIssues.length || !prBody) return linkedIssues;
  const confirmed = extractConfirmedClosingRefNumbers(prBody, repository);
  if (!confirmed) return linkedIssues;
  return linkedIssues.filter((issue) => confirmed.has(issue.number));
}

export function hasSameRepoClosingKeywordRef(body: string | null | undefined, repository: RepositoryRef): boolean {
  if (!body) {
    return false;
  }

  const searchableBody = stripMarkdownCode(body);
  const normalizedOwner = repository.owner.toLowerCase();
  const normalizedRepo = repository.repo.toLowerCase();

  for (const match of searchableBody.matchAll(CLOSING_KEYWORD_PATTERN)) {
    const rawTarget = match[1];
    if (!rawTarget) continue;

    const target = stripTrailingPunctuation(rawTarget);
    if (ISSUE_NUMBER_PATTERN.test(target)) {
      return true;
    }

    const qualifiedMatch = target.match(QUALIFIED_REFERENCE_PATTERN);
    if (qualifiedMatch) {
      const [, owner, repo] = qualifiedMatch;
      if (
        owner.toLowerCase() === normalizedOwner &&
        repo.toLowerCase() === normalizedRepo
      ) {
        return true;
      }
      continue;
    }

    const urlMatch = target.match(ISSUE_URL_PATTERN);
    if (urlMatch) {
      const [, owner, repo] = urlMatch;
      if (
        owner.toLowerCase() === normalizedOwner &&
        repo.toLowerCase() === normalizedRepo
      ) {
        return true;
      }
    }
  }

  return false;
}
