// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ThreadPullRequest } from "@bb/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  isThreadDisplayStatusBannerActive,
  ThreadPromptContextBanner,
  type ThreadPromptContextBannerExpandedSection,
  type ThreadPromptCreatedPullRequestsSection,
  type ThreadPromptGitSection,
} from "./ThreadPromptContextBanner";

const noop = () => {};

const changedFile = {
  path: "apps/app/src/components/promptbox/banner/ThreadPromptContextBanner.tsx",
  status: "M" as const,
  insertions: 2,
  deletions: 0,
};

const pullRequestFixture: ThreadPullRequest = {
  number: 128,
  title: "Show pull request status in the prompt context banner",
  state: "open",
  url: "https://github.com/acme/bb/pull/128",
  baseRefName: "main",
  headRefName: "bb/pr-context-banner",
  updatedAt: "2026-06-16T12:30:00Z",
  autoMerge: false,
  inMergeQueue: false,
  checks: {
    state: "passing",
    totalCount: 1,
    passedCount: 1,
    failedCount: 0,
    pendingCount: 0,
  },
  review: {
    state: "none",
    reviewRequestCount: 0,
  },
  mergeability: {
    state: "mergeable",
    mergeStateStatus: "CLEAN",
    mergeable: "MERGEABLE",
  },
  attention: "ready_to_merge",
};

function makeGitSection(
  kind: ThreadPromptGitSection["changedFiles"]["kind"] = "uncommitted",
  mergeBase: ThreadPromptGitSection["mergeBase"] = null,
): ThreadPromptGitSection {
  return {
    changedFiles: {
      kind,
      label: kind === "committed" ? "Committed" : "Uncommitted",
      files: [changedFile],
      mergeBaseRef: kind === "committed" ? "abc1234" : null,
      stats: {
        insertions: 2,
        deletions: 0,
        lineStatsComplete: true,
        files: [changedFile],
      },
    },
    mergeBase,
    onPromptBannerFileClick: noop,
  };
}

afterEach(cleanup);

describe("ThreadPromptContextBanner", () => {
  it("renders the archived read-only status without an action", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={{ archivedAt: 1_731_456_000_000 }}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("Thread is archived");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("<button");
  });

  it.each([
    ["removed", "Machine removed"],
    ["removing", "Machine removal in progress"],
    ["cleanup-failed", "Machine cleanup failed"],
    ["destroyed", "Environment unavailable"],
  ] as const)(
    "collapses the %s explanation behind its status toggle by default",
    (status, label) => {
      const toggled: string[] = [];
      render(
        <ThreadPromptContextBanner
          gitSection={null}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={{ status }}
          parentThreadSection={null}
          childThreadsSection={null}
          pullRequestSection={null}
          expandedSection={null}
          onToggleSection={(section) => toggled.push(section)}
        />,
      );
      const toggle = screen.getByRole("button", { name: label });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText(/history|machine settings/)).toBeNull();
      expect(screen.queryByText("Provision")).toBeNull();
      toggle.click();
      expect(toggled).toEqual(["status"]);
    },
  );

  it("shows the machine removal explanation once the status is expanded", () => {
    render(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={{ status: "cleanup-failed" }}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection="status"
        onToggleSection={noop}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Machine cleanup failed" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByText(
        "This thread is unavailable while machine cleanup is pending. Retry cleanup in machine settings.",
      ),
    ).toBeDefined();
  });

  it.each([
    {
      label: "archived",
      archivedSection: { archivedAt: 1_731_456_000_000 },
      environmentGoneSection: null,
      expectedLabel: "Thread is archived",
    },
    {
      label: "environment archived",
      archivedSection: null,
      environmentGoneSection: { status: "destroyed" as const },
      expectedLabel: "Environment unavailable",
    },
  ])(
    "keeps the $label read-only status visible in compact mode",
    ({ archivedSection, environmentGoneSection, expectedLabel }) => {
      const markup = renderToStaticMarkup(
        <MemoryRouter>
          <ThreadPromptContextBanner
            gitSection={null}
            gitSectionPending={false}
            archivedSection={archivedSection}
            environmentGoneSection={environmentGoneSection}
            parentThreadSection={{
              parentThreadTitle: "Parent thread",
              href: "/threads/thr_parent",
              relationship: "parent",
            }}
            childThreadsSection={null}
            pullRequestSection={null}
            expandedSection={null}
            onToggleSection={noop}
          />
        </MemoryRouter>,
      );

      expect(markup).toContain(expectedLabel);
      expect(markup).not.toContain(
        `data-promptbox-hide-compact="">${expectedLabel}`,
      );
    },
  );

  it("offers unarchiving first when an archived thread also lost its environment", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={{
          archivedAt: 1_731_456_000_000,
          onUnarchive: noop,
        }}
        environmentGoneSection={{ status: "destroyed" }}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("Environment unavailable");
    expect(markup).not.toContain("Thread is archived");
    expect(markup).toContain(">Unarchive<");
  });

  it("offers restoring the workspace once the thread is live again", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={{ status: "destroyed", onRestore: noop }}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("Environment unavailable");
    expect(markup).toContain(">Restore workspace<");
  });

  it("shows the restore action as pending while it runs", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={{
          status: "destroyed",
          onRestore: noop,
          restorePending: true,
        }}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain(">Restoring...<");
    expect(markup).toContain("disabled");
  });

  it("keeps ready-to-merge status out of standalone visible labels", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{ pullRequest: pullRequestFixture }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128");
    expect(markup).not.toContain("PR #128 · Open");
    expect(markup).not.toContain("· Ready to merge");
    expect(markup).not.toContain('alt="Checks success"');
  });

  it("uses the selected pull request merge method as the action label", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{
          pullRequest: pullRequestFixture,
          actions: {
            onMerge: noop,
            selectedMergeMethod: "squash",
          },
        }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("Squash merge");
  });

  it.each([
    ["checks_pending", false, null],
    ["checks_failed", false, null],
    ["checks_failed", true, null],
    ["checks_pending", true, "Auto-merge on"],
    ["ready_to_merge", true, "Auto-merge on"],
    ["queued", true, "Queued to merge"],
  ] as const)(
    "shows only automation labels for %s with auto-merge %s",
    (attention, autoMerge, label) => {
      const markup = renderToStaticMarkup(
        <ThreadPromptContextBanner
          gitSection={null}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={null}
          pullRequestSection={{
            pullRequest: {
              ...pullRequestFixture,
              autoMerge,
              inMergeQueue: attention === "queued",
              review: { state: "approved", reviewRequestCount: 0 },
              checks: {
                state: attention === "checks_failed" ? "failing" : "pending",
                totalCount: 1,
                passedCount: 0,
                failedCount: 0,
                pendingCount: 1,
              },
              attention,
            },
          }}
          expandedSection={null}
          onToggleSection={noop}
        />,
      );

      expect(markup).toContain("PR #128");
      expect(markup).not.toContain("PR #128 · Open");
      if (label) {
        expect(markup).toContain(`text-attention">· ${label}</span>`);
      } else {
        expect(markup).not.toContain('text-attention">·');
        expect(markup).not.toContain("· Checks failing</span>");
      }
      expect(markup).toContain('class="size-4 shrink-0 text-success"');
      expect(markup).toContain('data-icon="GitPullRequestArrow"');
      expect(markup).not.toContain('data-icon="GitMerge"');
      expect(markup).toContain(
        attention === "checks_failed"
          ? 'class="fill-destructive"'
          : 'class="fill-attention"',
      );
      expect(markup).not.toContain('alt="Checks pending"');
    },
  );

  it("keeps useful standalone terminal pull request state labels", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{
          pullRequest: {
            ...pullRequestFixture,
            state: "closed",
            attention: "closed",
          },
        }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128 · Closed");
  });

  it("summarizes child work without flashing the banner", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={null}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={{
            items: [
              {
                id: "thr_child",
                title: "Investigate failing checks",
                href: "/threads/thr_child",
                hasPendingInteraction: false,
              },
            ],
          }}
          pullRequestSection={null}
          expandedSection={null}
          onToggleSection={noop}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('aria-label="Child threads"');
    expect(markup).toContain(
      "1 active child thread: Investigate failing checks",
    );
    expect(markup).toContain("Active child thread:");
    expect(markup).toContain("Investigate failing checks");
    expect(markup).toContain('data-icon="UserRound"');
    expect(markup).toContain("animate-shine-icon");
    expect(markup).not.toContain("animate-shine font-medium");
  });

  it("summarizes additional active child threads", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={null}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={{
            items: [
              {
                id: "thr_primary",
                title: "Investigate failing checks",
                href: "/threads/thr_primary",
                hasPendingInteraction: false,
              },
              {
                id: "thr_other",
                title: "Review the release notes",
                href: "/threads/thr_other",
                hasPendingInteraction: false,
              },
            ],
          }}
          pullRequestSection={null}
          expandedSection={null}
          onToggleSection={noop}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain(
      "2 active child threads: Investigate failing checks",
    );
    expect(markup).toContain("+1 more");
  });

  it("lets combined child and context cards shrink inside the composer stack", () => {
    render(
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={makeGitSection("uncommitted")}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={{
            items: [
              {
                id: "thr_child",
                title: "Host-owned SourceCode and Diff renderers",
                href: "/threads/thr_child",
                hasPendingInteraction: false,
              },
            ],
          }}
          pullRequestSection={null}
          expandedSection={null}
          onToggleSection={noop}
        />
      </MemoryRouter>,
    );

    const childCard = screen.getByRole("region", { name: "Child threads" });
    const contextCard = screen.getByRole("region", {
      name: "Thread context before sending",
    });

    expect(childCard.parentElement).toBe(contextCard.parentElement);
    expect(childCard.parentElement?.classList.contains("min-w-0")).toBe(true);
  });

  it("counts a child waiting for a host as active banner work", () => {
    expect(isThreadDisplayStatusBannerActive("waiting-for-host")).toBe(true);
  });

  it("labels a child blocked on approval instead of active work", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={null}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={{
            items: [
              {
                id: "thr_blocked",
                title: "Install workspace tools",
                href: "/threads/thr_blocked",
                hasPendingInteraction: true,
              },
            ],
          }}
          pullRequestSection={null}
          expandedSection={null}
          onToggleSection={noop}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain(
      "1 child thread needs input: Install workspace tools",
    );
    expect(markup).toContain("Needs your input:");
    expect(markup).toContain("Install workspace tools");
    expect(markup).toContain('data-icon="CircleQuestion"');
    expect(markup).not.toContain("Active child thread:");
    expect(markup).not.toContain("animate-shine-icon");
  });

  it("keeps failed-check detail accessible without a redundant label", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={null}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{
          pullRequest: {
            ...pullRequestFixture,
            checks: {
              state: "failing",
              totalCount: 1,
              passedCount: 0,
              failedCount: 1,
              pendingCount: 0,
            },
            attention: "checks_failed",
          },
        }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128");
    expect(markup).not.toContain("· Checks failing");
    expect(markup).toContain('title="Checks failing"');
    expect(markup).not.toContain("Checks failure");
  });

  it("shows pull request and diff labels together when only PR and git context are visible", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={makeGitSection("uncommitted")}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{ pullRequest: pullRequestFixture }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128");
    expect(markup).not.toContain("Open PR #128");
    expect(markup).not.toContain("· Ready to merge");
    expect(markup).toContain("Uncommitted");
    expect(markup).toContain("1 file");
  });

  it("keeps the pull request action visible beside other context segments", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={makeGitSection("uncommitted")}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{
          pullRequest: pullRequestFixture,
          actions: {
            onMerge: noop,
            selectedMergeMethod: "rebase",
          },
        }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128");
    expect(markup).toContain("Uncommitted");
    expect(markup).toContain("Rebase and merge");
  });

  it("uses the shared committed git label beside pull request context", () => {
    const markup = renderToStaticMarkup(
      <ThreadPromptContextBanner
        gitSection={makeGitSection("committed")}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{ pullRequest: pullRequestFixture }}
        expandedSection={null}
        onToggleSection={noop}
      />,
    );

    expect(markup).toContain("PR #128");
    expect(markup).toContain("Committed");
    expect(markup).toContain("1 file");
  });

  it.each([
    {
      label: "checked open",
      pullRequest: pullRequestFixture,
      expectedMinWidthClass: "min-w-13",
    },
    {
      label: "merged",
      pullRequest: {
        ...pullRequestFixture,
        state: "merged" as const,
        attention: "merged" as const,
      },
      expectedMinWidthClass: "min-w-8",
    },
    {
      label: "closed",
      pullRequest: {
        ...pullRequestFixture,
        state: "closed" as const,
        attention: "closed" as const,
      },
      expectedMinWidthClass: "min-w-8",
    },
  ])(
    "reserves only the width needed by a $label pull request status pill",
    ({ pullRequest, expectedMinWidthClass }) => {
      render(
        <MemoryRouter>
          <ThreadPromptContextBanner
            gitSection={makeGitSection("committed")}
            gitSectionPending={false}
            archivedSection={null}
            environmentGoneSection={null}
            parentThreadSection={null}
            childThreadsSection={null}
            pullRequestSection={{ pullRequest }}
            expandedSection={null}
            onToggleSection={noop}
          />
        </MemoryRouter>,
      );

      const pullRequestLink = screen.getByRole("link", {
        name: /Pull request 128:/,
      });
      expect(
        ["min-w-8", "min-w-13"].filter((className) =>
          pullRequestLink.classList.contains(className),
        ),
      ).toEqual([expectedMinWidthClass]);
    },
  );
});

describe("ThreadPromptContextBanner git section body", () => {
  function renderBanner(expandedSection: "git" | null) {
    return (
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={makeGitSection("uncommitted")}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={null}
          pullRequestSection={null}
          expandedSection={expandedSection}
          onToggleSection={noop}
        />
      </MemoryRouter>
    );
  }

  it("does not mount the changed-files list until the section first expands", () => {
    const { rerender } = render(renderBanner(null));
    expect(screen.queryByRole("list", { hidden: true })).toBeNull();

    rerender(renderBanner("git"));
    expect(screen.getByRole("list")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Open ${changedFile.path}` }),
    ).toBeTruthy();

    rerender(renderBanner(null));
    expect(screen.getByRole("list", { hidden: true })).toBeTruthy();
  });
});

const createdPullRequestsFixture: ThreadPromptCreatedPullRequestsSection = {
  pullRequests: [
    {
      repo: "acme/infra",
      number: 7,
      url: "https://github.com/acme/infra/pull/7",
      seq: 3,
    },
    {
      repo: "acme/bb",
      number: 128,
      url: "https://github.com/acme/bb/pull/128",
      seq: 1,
    },
    {
      repo: "acme/docs",
      number: 12,
      url: "https://github.com/acme/docs/pull/12",
      seq: 2,
    },
    {
      repo: "acme/api",
      number: 5,
      url: "https://github.com/acme/api/pull/5",
      seq: 4,
    },
  ],
};

const THREAD_PULL_REQUESTS_TOGGLE_NAME = "3 more PRs created by this thread";

describe("ThreadPromptContextBanner thread pull requests", () => {
  function renderBanner(
    overrides: {
      createdPullRequestsSection?: ThreadPromptCreatedPullRequestsSection;
      showAllThreadPullRequests?: boolean;
      pullRequest?: ThreadPullRequest | null;
      expandedSection?: ThreadPromptContextBannerExpandedSection | null;
    } = {},
  ) {
    const { pullRequest = pullRequestFixture, ...bannerOverrides } = overrides;
    return (
      <MemoryRouter>
        <ThreadPromptContextBanner
          gitSection={makeGitSection("uncommitted")}
          gitSectionPending={false}
          archivedSection={null}
          environmentGoneSection={null}
          parentThreadSection={null}
          childThreadsSection={null}
          pullRequestSection={pullRequest ? { pullRequest } : null}
          expandedSection={null}
          onToggleSection={noop}
          {...bannerOverrides}
        />
      </MemoryRouter>
    );
  }

  function renderThreadPullRequests(
    overrides: {
      pullRequest?: ThreadPullRequest | null;
      expandedSection?: ThreadPromptContextBannerExpandedSection | null;
    } = {},
  ) {
    return render(
      renderBanner({
        createdPullRequestsSection: createdPullRequestsFixture,
        showAllThreadPullRequests: true,
        ...overrides,
      }),
    );
  }

  it("renders exactly the default banner while the setting is off", () => {
    const baseline = renderToStaticMarkup(renderBanner());

    expect(
      renderToStaticMarkup(
        renderBanner({
          createdPullRequestsSection: createdPullRequestsFixture,
        }),
      ),
    ).toBe(baseline);
    expect(
      renderToStaticMarkup(
        renderBanner({
          createdPullRequestsSection: createdPullRequestsFixture,
          showAllThreadPullRequests: false,
        }),
      ),
    ).toBe(baseline);
  });

  it("keeps the default banner when the thread only created the branch pull request", () => {
    const onlyBranchPullRequest: ThreadPromptCreatedPullRequestsSection = {
      pullRequests: [createdPullRequestsFixture.pullRequests[1]!],
    };

    expect(
      renderToStaticMarkup(
        renderBanner({
          createdPullRequestsSection: onlyBranchPullRequest,
          showAllThreadPullRequests: true,
        }),
      ),
    ).toBe(renderToStaticMarkup(renderBanner()));
  });

  it("counts only the pull requests the branch chip does not already show", () => {
    renderThreadPullRequests();

    expect(
      screen.getByRole("button", { name: THREAD_PULL_REQUESTS_TOGGLE_NAME }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Pull request acme/bb#128" }),
    ).toBeNull();
  });

  it("keeps the branch pull request number visible beside thread pull requests", () => {
    renderThreadPullRequests();

    expect(
      screen.getByRole("link", { name: /Pull request 128:/ }).textContent,
    ).toContain("PR #128");
  });

  it("drops the repository owner from inline chips but keeps it in the title", () => {
    renderThreadPullRequests();

    const chip = screen.getByRole("link", {
      name: "Pull request acme/docs#12",
    });
    expect(chip.textContent).toBe("docs#12");
    expect(chip.querySelector("span")?.title).toBe("acme/docs#12");
  });

  it("collapses the inline chips without measuring the viewport", () => {
    const markup = renderToStaticMarkup(
      renderBanner({
        createdPullRequestsSection: createdPullRequestsFixture,
        showAllThreadPullRequests: true,
      }),
    );

    expect(markup).toContain('data-promptbox-hide-compact=""><li');
    expect(markup).toContain('data-promptbox-compact-label="">3<');
  });

  it("expands thread pull requests in place in creation order", () => {
    renderThreadPullRequests({ expandedSection: "pullRequests" });

    const body = screen.getByRole("region", {
      name: THREAD_PULL_REQUESTS_TOGGLE_NAME,
    });
    expect(
      within(body)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["acme/docs#12", "acme/infra#7", "acme/api#5"]);
    expect(screen.queryAllByRole("menuitem")).toEqual([]);
  });

  it("lists thread pull requests without inventing status for them", () => {
    renderThreadPullRequests({ expandedSection: "pullRequests" });

    const body = screen.getByRole("region", {
      name: THREAD_PULL_REQUESTS_TOGGLE_NAME,
    });
    for (const link of within(body).getAllByRole("link")) {
      expect(link.querySelector("[data-icon]")).toBeNull();
      expect(link.querySelector("img")).toBeNull();
    }
  });

  it("does not mount the thread pull request list until it first expands", () => {
    const { rerender } = renderThreadPullRequests();
    expect(
      screen.queryByRole("link", { name: "Pull request acme/api#5" }),
    ).toBeNull();

    rerender(
      renderBanner({
        createdPullRequestsSection: createdPullRequestsFixture,
        showAllThreadPullRequests: true,
        expandedSection: "pullRequests",
      }),
    );
    expect(
      screen.getByRole("link", { name: "Pull request acme/api#5" }),
    ).toBeTruthy();
  });

  it("surfaces thread pull requests when no pull request tracks the branch", () => {
    renderThreadPullRequests({ pullRequest: null });

    const toggle = screen.getByRole("button", {
      name: "4 PRs created by this thread",
    });
    expect(toggle.textContent).toContain("+2 more");
  });
});
