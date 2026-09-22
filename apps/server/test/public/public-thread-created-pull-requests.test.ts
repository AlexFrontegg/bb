import { describe, expect, it } from "vitest";
import { markProjectDeleted, markThreadDeleted } from "@bb/db";
import { turnScope, type ThreadEventItem } from "@bb/domain";
import {
  apiErrorSchema,
  threadCreatedPullRequestsResponseSchema,
} from "@bb/server-contract";
import { readJson } from "../helpers/json.js";
import { seedEvent, seedThread, seedThreadFixture } from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

const TURN_ID = "turn-1";

function commandItem(args: {
  id: string;
  command: string;
  output?: string;
  exitCode?: number;
}): ThreadEventItem {
  return {
    type: "commandExecution",
    id: args.id,
    command: args.command,
    cwd: "/work/repo",
    status: "completed",
    approvalStatus: null,
    exitCode: args.exitCode ?? 0,
    aggregatedOutput: args.output ?? "",
  };
}

function seedCompletedItem(
  harness: TestAppHarness,
  args: { threadId: string; sequence: number; item: ThreadEventItem },
): void {
  seedEvent(harness.deps, {
    threadId: args.threadId,
    providerThreadId: "provider-session",
    scope: turnScope(TURN_ID),
    sequence: args.sequence,
    type: "item/completed",
    data: { item: args.item },
  });
}

async function readCreatedPullRequests(
  harness: TestAppHarness,
  threadId: string,
) {
  const response = await harness.app.request(
    `/api/v1/threads/${threadId}/created-pull-requests`,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return threadCreatedPullRequestsResponseSchema.parse(
    await readJson(response),
  );
}

async function expectThreadNotFound(
  harness: TestAppHarness,
  threadId: string,
): Promise<void> {
  const response = await harness.app.request(
    `/api/v1/threads/${threadId}/created-pull-requests`,
  );
  expect(response.status).toBe(404);
  expect(apiErrorSchema.parse(await readJson(response))).toMatchObject({
    code: "thread_not_found",
  });
}

describe("GET /threads/:id/created-pull-requests", () => {
  it("returns every pull request the thread created, across repositories, in sequence order", async () => {
    await withTestHarness(async (harness) => {
      const { thread } = seedThreadFixture(harness);
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 2,
        item: commandItem({
          id: "cmd-status",
          command: "git status --short",
          output: "M apps/server/src/routes/threads/data.ts\n",
        }),
      });
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 3,
        item: commandItem({
          id: "cmd-pr-app",
          command: "gh pr create --base main --title 'Add banner'",
          output:
            "Creating pull request for bb/banner into main\nhttps://github.com/acme/bb/pull/42\n",
        }),
      });
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 4,
        item: commandItem({
          id: "cmd-pr-failed",
          command: "gh pr create --base main",
          exitCode: 1,
          output: "https://github.com/acme/bb/pull/99\n",
        }),
      });
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 5,
        item: {
          type: "toolCall",
          id: "tool-pr-tools",
          tool: "Bash",
          arguments: { command: "cd ../tools && gh pr create --fill" },
          status: "completed",
          result: "https://github.com/acme/tools/pull/7\n",
        },
      });

      expect(await readCreatedPullRequests(harness, thread.id)).toEqual({
        pullRequests: [
          {
            repo: "acme/bb",
            number: 42,
            url: "https://github.com/acme/bb/pull/42",
            seq: 3,
          },
          {
            repo: "acme/tools",
            number: 7,
            url: "https://github.com/acme/tools/pull/7",
            seq: 5,
          },
        ],
      });
    });
  });

  it("returns an empty list for a thread whose events created no pull requests", async () => {
    await withTestHarness(async (harness) => {
      const { thread } = seedThreadFixture(harness);
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 1,
        item: commandItem({
          id: "cmd-view",
          command: "gh pr view 42",
          output: "https://github.com/acme/bb/pull/42\n",
        }),
      });

      expect(await readCreatedPullRequests(harness, thread.id)).toEqual({
        pullRequests: [],
      });
    });
  });

  it("does not expose pull requests created by another thread", async () => {
    await withTestHarness(async (harness) => {
      const { project, environment, thread } = seedThreadFixture(harness);
      seedCompletedItem(harness, {
        threadId: thread.id,
        sequence: 1,
        item: commandItem({
          id: "cmd-pr-other",
          command: "gh pr create --fill",
          output: "https://github.com/acme/bb/pull/5\n",
        }),
      });
      expect(await readCreatedPullRequests(harness, thread.id)).toMatchObject({
        pullRequests: [{ number: 5 }],
      });

      const sibling = seedThread(harness.deps, {
        projectId: project.id,
        environmentId: environment.id,
      });
      expect(await readCreatedPullRequests(harness, sibling.id)).toEqual({
        pullRequests: [],
      });
    });
  });

  it("returns 404 for unknown, deleted, and deleted-project threads", async () => {
    await withTestHarness(async (harness) => {
      await expectThreadNotFound(harness, "thr_missing");

      const deletedThread = seedThreadFixture(harness);
      expect(
        markThreadDeleted(harness.db, harness.hub, {
          threadId: deletedThread.thread.id,
        }),
      ).not.toBeNull();
      await expectThreadNotFound(harness, deletedThread.thread.id);

      const deletedProject = seedThreadFixture(harness);
      markProjectDeleted(harness.db, harness.hub, {
        projectId: deletedProject.project.id,
      });
      await expectThreadNotFound(harness, deletedProject.thread.id);
    });
  });
});
