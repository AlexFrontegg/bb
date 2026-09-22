import {
  hydrateRetainedEventOutputRows,
  listCompletedItemEventRowsByItemKinds,
} from "@bb/db";
import type { DbConnection } from "@bb/db";
import type {
  ThreadCreatedPullRequest,
  ThreadEventItem,
  ThreadEventItemType,
} from "@bb/domain";
import { parseStoredEvent } from "./thread-data.js";

export interface ThreadCreatedPullRequestCandidate {
  item: ThreadEventItem;
  seq: number;
}

const PULL_REQUEST_CREATION_ITEM_KINDS = [
  "commandExecution",
  "toolCall",
] as const satisfies readonly ThreadEventItemType[];

const PULL_REQUEST_CREATE_COMMAND_PATTERN =
  /(?:^|[\s;&|(])gh\s+pr\s+create(?=\s|$)/u;

const PULL_REQUEST_URL_PATH_SEGMENT = "/pull/";

const CREATED_PULL_REQUEST_URL_LINE_PATTERN =
  /^[ \t]*(https:\/\/[^\s/]+\/([^\s/]+\/[^\s/]+)\/pull\/([0-9]+))[ \t]*$/u;

interface PullRequestCreationInvocation {
  command: string;
  output: string;
}

function readPullRequestCreationInvocation(
  item: ThreadEventItem,
): PullRequestCreationInvocation | null {
  if (item.type === "commandExecution") {
    if (item.status !== "completed" || item.exitCode !== 0) {
      return null;
    }
    return {
      command: item.command,
      output: item.aggregatedOutput ?? "",
    };
  }
  if (item.type === "toolCall") {
    const command = item.arguments?.command;
    if (
      item.status !== "completed" ||
      item.error !== undefined ||
      typeof command !== "string"
    ) {
      return null;
    }
    return {
      command,
      output: typeof item.result === "string" ? item.result : "",
    };
  }
  return null;
}

function readPullRequestsFromOutput(
  output: string,
  seq: number,
): ThreadCreatedPullRequest[] {
  const pullRequests: ThreadCreatedPullRequest[] = [];
  for (const line of output.split("\n")) {
    const match = CREATED_PULL_REQUEST_URL_LINE_PATTERN.exec(
      line.replace(/\r$/u, ""),
    );
    if (!match) {
      continue;
    }
    const [, url, repo, number] = match;
    if (url === undefined || repo === undefined || number === undefined) {
      continue;
    }
    pullRequests.push({ repo, number: Number(number), url, seq });
  }
  return pullRequests;
}

export function extractThreadCreatedPullRequests(
  candidates: readonly ThreadCreatedPullRequestCandidate[],
): ThreadCreatedPullRequest[] {
  const byRepoAndNumber = new Map<string, ThreadCreatedPullRequest>();
  for (const candidate of [...candidates].sort((a, b) => a.seq - b.seq)) {
    const invocation = readPullRequestCreationInvocation(candidate.item);
    if (
      !invocation ||
      !PULL_REQUEST_CREATE_COMMAND_PATTERN.test(invocation.command)
    ) {
      continue;
    }
    for (const pullRequest of readPullRequestsFromOutput(
      invocation.output,
      candidate.seq,
    )) {
      const key = `${pullRequest.repo}#${pullRequest.number}`;
      if (!byRepoAndNumber.has(key)) {
        byRepoAndNumber.set(key, pullRequest);
      }
    }
  }
  return [...byRepoAndNumber.values()].sort((a, b) => a.seq - b.seq);
}

export function listThreadCreatedPullRequests(
  db: DbConnection,
  threadId: string,
): ThreadCreatedPullRequest[] {
  const rows = listCompletedItemEventRowsByItemKinds(db, {
    itemKinds: PULL_REQUEST_CREATION_ITEM_KINDS,
    threadId,
  });
  const candidates = hydrateRetainedEventOutputRows(db, rows)
    .filter((row) => row.data.includes(PULL_REQUEST_URL_PATH_SEGMENT))
    .flatMap((row) => {
      const event = parseStoredEvent(row);
      return event.type === "item/completed"
        ? [{ item: event.item, seq: row.sequence }]
        : [];
    });
  return extractThreadCreatedPullRequests(candidates);
}
