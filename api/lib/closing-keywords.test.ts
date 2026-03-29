import { describe, expect, it } from "vitest";
import { hasSameRepoClosingKeywordRef, filterToConfirmedClosingRefs } from "./closing-keywords.js";

describe("hasSameRepoClosingKeywordRef", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };
  const allClosingKeywords = [
    "close",
    "closed",
    "closes",
    "fix",
    "fixed",
    "fixes",
    "resolve",
    "resolved",
    "resolves",
  ] as const;

  it("matches all GitHub closing keyword variants for local issue references", () => {
    for (const keyword of allClosingKeywords) {
      expect(hasSameRepoClosingKeywordRef(`${keyword} #21`, repository)).toBe(true);
      expect(hasSameRepoClosingKeywordRef(`${keyword}: #21`, repository)).toBe(true);
    }
  });

  it("matches fully-qualified same-repo references", () => {
    expect(
      hasSameRepoClosingKeywordRef("Resolves hivemoot/hivemoot-bot#42", repository)
    ).toBe(true);
  });

  it("matches same-repo issue URLs", () => {
    expect(
      hasSameRepoClosingKeywordRef(
        "Fixes https://github.com/hivemoot/hivemoot-bot/issues/123",
        repository
      )
    ).toBe(true);
  });

  it("does not match cross-repo references", () => {
    expect(
      hasSameRepoClosingKeywordRef("Fixes someone/else#21", repository)
    ).toBe(false);
    expect(
      hasSameRepoClosingKeywordRef(
        "Resolves https://github.com/someone/else/issues/33",
        repository
      )
    ).toBe(false);
  });

  it("does not match plain mentions without closing keywords", () => {
    expect(hasSameRepoClosingKeywordRef("Related to #21", repository)).toBe(false);
  });

  it("ignores closing keywords inside inline code", () => {
    expect(
      hasSameRepoClosingKeywordRef("Template example: `Fixes #21`", repository)
    ).toBe(false);
  });

  it("ignores closing keywords inside fenced code blocks", () => {
    expect(
      hasSameRepoClosingKeywordRef(
        "```md\nFixes #21\n```\nThis PR updates docs only.",
        repository
      )
    ).toBe(false);
  });
});

describe("filterToConfirmedClosingRefs", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };

  function issues(...numbers: number[]) {
    return numbers.map((n) => ({
      number: n,
      title: `Issue ${n}`,
      state: "OPEN" as const,
      labels: { nodes: [] },
    }));
  }

  it("keeps issues whose numbers appear as real closing refs", () => {
    const body = "Fixes #123\n\nImplements the feature described in the issue.";
    expect(filterToConfirmedClosingRefs(issues(123, 456), body, repository)).toEqual(issues(123));
  });

  it("handles all three reference forms", () => {
    const body = [
      "Closes #10",
      "Fixes hivemoot/hivemoot-bot#20",
      "Resolves https://github.com/hivemoot/hivemoot-bot/issues/30",
    ].join("\n");
    expect(filterToConfirmedClosingRefs(issues(10, 20, 30, 99), body, repository)).toEqual(
      issues(10, 20, 30)
    );
  });

  it("ignores closing refs to cross-repo issues", () => {
    // owner/repo#N for a different repo — should not confirm issue #5 here
    const body = "Fixes other-owner/other-repo#5";
    // Fail-safe: no confirmed refs found → return original list
    expect(filterToConfirmedClosingRefs(issues(5), body, repository)).toEqual(issues(5));
  });

  it("strips code-block keywords (false-positive case from issue #321)", () => {
    const body = [
      "This PR explains the problem.",
      "```",
      "Fixes #191",
      "```",
      "The above line is just an example — it should not enroll this PR into issue #191.",
    ].join("\n");
    // No confirmed refs found outside code blocks → fail-safe returns original
    expect(filterToConfirmedClosingRefs(issues(191), body, repository)).toEqual(issues(191));
  });

  it("drops code-block issue when a real prose ref also exists", () => {
    // The filter's primary value: a PR with Fixes #200 in prose and Fixes #191 only
    // inside a code block → GitHub returns both; local filter drops 191, keeps 200.
    const body = [
      "Fixes #200",
      "",
      "Here is example syntax for reference:",
      "```",
      "Fixes #191",
      "```",
    ].join("\n");
    expect(filterToConfirmedClosingRefs(issues(191, 200), body, repository)).toEqual(issues(200));
  });

  it("drops inline-code issue when a real prose ref also exists", () => {
    // Same as above but using inline code for the example reference.
    const body = "Fixes #200. Use `Fixes #21` syntax for closing keywords.";
    expect(filterToConfirmedClosingRefs(issues(21, 200), body, repository)).toEqual(issues(200));
  });

  it("strips inline-code keywords", () => {
    const body = "Use `Fixes #21` in your PR body, not plain text.";
    expect(filterToConfirmedClosingRefs(issues(21), body, repository)).toEqual(issues(21));
  });

  it("fail-safe: returns original list when body is null", () => {
    expect(filterToConfirmedClosingRefs(issues(5, 6), null, repository)).toEqual(issues(5, 6));
  });

  it("fail-safe: returns original list when no closing refs found", () => {
    const body = "This PR is related to #5 but does not use a closing keyword.";
    expect(filterToConfirmedClosingRefs(issues(5), body, repository)).toEqual(issues(5));
  });

  it("returns empty list when no linked issues provided", () => {
    expect(filterToConfirmedClosingRefs([], "Fixes #123", repository)).toEqual([]);
  });

  it("does not filter issues that appear only as plain mentions", () => {
    // "Part of #5" is not a closing keyword — should not confirm #5
    const body = "Part of #5. Also see #10.";
    expect(filterToConfirmedClosingRefs(issues(5), body, repository)).toEqual(issues(5));
  });
});
