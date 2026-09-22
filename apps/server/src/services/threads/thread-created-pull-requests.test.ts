import type { ThreadEventItem } from "@bb/domain";
import { describe, expect, it } from "vitest";
import {
  extractThreadCreatedPullRequests,
  type ThreadCreatedPullRequestCandidate,
} from "./thread-created-pull-requests.js";

function commandItem(
  overrides: Partial<Extract<ThreadEventItem, { type: "commandExecution" }>>,
): ThreadEventItem {
  return {
    type: "commandExecution",
    id: "item-1",
    command: "gh pr create --fill",
    cwd: "/work/repo",
    status: "completed",
    approvalStatus: null,
    exitCode: 0,
    ...overrides,
  };
}

function candidate(
  seq: number,
  overrides: Partial<Extract<ThreadEventItem, { type: "commandExecution" }>>,
): ThreadCreatedPullRequestCandidate {
  return { item: commandItem({ id: `item-${seq}`, ...overrides }), seq };
}

describe("extractThreadCreatedPullRequests", () => {
  it("collects a pull request created in each repository the thread touched", () => {
    expect(
      extractThreadCreatedPullRequests([
        candidate(12, {
          command: "gh pr create --base main --title 'Add banner'",
          aggregatedOutput: "https://github.com/acme/bb/pull/42\n",
        }),
        candidate(30, {
          command:
            "cd ../other && rtk gh pr create --repo acme/tools --base main",
          aggregatedOutput: "https://github.com/acme/tools/pull/7\n\n",
        }),
      ]),
    ).toEqual([
      {
        repo: "acme/bb",
        number: 42,
        url: "https://github.com/acme/bb/pull/42",
        seq: 12,
      },
      {
        repo: "acme/tools",
        number: 7,
        url: "https://github.com/acme/tools/pull/7",
        seq: 30,
      },
    ]);
  });

  it("ignores pull request urls the thread only read or mentioned", () => {
    expect(
      extractThreadCreatedPullRequests([
        candidate(1, {
          command: "gh pr list --json url",
          aggregatedOutput: "https://github.com/acme/bb/pull/42\n",
        }),
        candidate(2, {
          command: "gh pr view 42 --json url",
          aggregatedOutput: "https://github.com/acme/bb/pull/42\n",
        }),
        candidate(3, {
          command: "cat notes.md",
          aggregatedOutput:
            "Superseded by https://github.com/acme/bb/pull/42\nhttps://github.com/acme/bb/pull/43\n",
        }),
        {
          item: {
            type: "agentMessage",
            id: "item-4",
            text: "Opened https://github.com/acme/bb/pull/44",
          },
          seq: 4,
        },
      ]),
    ).toEqual([]);
  });

  it("ignores a failed creation attempt and the branch compare link git push prints", () => {
    expect(
      extractThreadCreatedPullRequests([
        candidate(5, {
          command: "git push -u origin feat && gh pr create --fill",
          status: "failed",
          exitCode: 1,
          aggregatedOutput:
            "remote: Create a pull request by visiting:\nhttps://github.com/acme/bb/pull/new/feat\n",
        }),
      ]),
    ).toEqual([]);
  });

  it("keeps the first sequence when the same pull request is reported twice", () => {
    expect(
      extractThreadCreatedPullRequests([
        candidate(20, {
          command: "gh pr create --fill",
          aggregatedOutput: "https://github.com/acme/bb/pull/42\n",
        }),
        candidate(21, {
          command: "gh pr create --fill",
          aggregatedOutput:
            "a pull request already exists\nhttps://github.com/acme/bb/pull/42\n",
        }),
      ]),
    ).toEqual([
      {
        repo: "acme/bb",
        number: 42,
        url: "https://github.com/acme/bb/pull/42",
        seq: 20,
      },
    ]);
  });

  it("orders results by the sequence the pull request was created at", () => {
    const ordered = extractThreadCreatedPullRequests([
      candidate(90, {
        command: "gh pr create --fill",
        aggregatedOutput: "https://github.com/acme/bb/pull/9\r\n",
      }),
      candidate(10, {
        command: "gh pr create --fill",
        aggregatedOutput: "  https://github.com/acme/bb/pull/3  \n",
      }),
      candidate(50, {
        command: "gh pr create --fill",
        aggregatedOutput: "https://ghe.acme.dev/acme/internal/pull/5\n",
      }),
    ]);
    expect(ordered.map((pullRequest) => pullRequest.seq)).toEqual([10, 50, 90]);
    expect(ordered.map((pullRequest) => pullRequest.repo)).toEqual([
      "acme/bb",
      "acme/internal",
      "acme/bb",
    ]);
  });

  it("reads a pull request created through a shell tool call", () => {
    expect(
      extractThreadCreatedPullRequests([
        {
          item: {
            type: "toolCall",
            id: "item-6",
            tool: "shell",
            arguments: { command: "gh pr create --fill" },
            status: "completed",
            result: "https://github.com/acme/bb/pull/11\n",
          },
          seq: 6,
        },
        {
          item: {
            type: "toolCall",
            id: "item-7",
            tool: "read",
            arguments: { path: "notes.md" },
            status: "completed",
            result: "https://github.com/acme/bb/pull/12\n",
          },
          seq: 7,
        },
      ]),
    ).toEqual([
      {
        repo: "acme/bb",
        number: 11,
        url: "https://github.com/acme/bb/pull/11",
        seq: 6,
      },
    ]);
  });
});
