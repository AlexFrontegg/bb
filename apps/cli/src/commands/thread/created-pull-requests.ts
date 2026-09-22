import { Command } from "commander";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import { outputJson, requireThreadIdOrSelf } from "../helpers.js";

export function registerCreatedPullRequestsCommand(
  parent: Command,
  getUrl: () => string,
): void {
  parent
    .command("created-pull-requests [id]")
    .description("List the pull requests this thread's agent created")
    .option("--self", "Use the current thread")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(
        async (
          id: string | undefined,
          opts: { self?: boolean; json?: boolean },
        ) => {
          const threadId = requireThreadIdOrSelf(id, opts);
          const result = await createCliBbSdk(
            getUrl(),
          ).threads.createdPullRequests({ threadId });
          if (outputJson(opts, result)) return;
          if (result.pullRequests.length === 0) {
            console.log("This thread created no pull requests.");
            return;
          }
          for (const pullRequest of result.pullRequests) {
            console.log(
              `${pullRequest.repo}#${pullRequest.number}\t${pullRequest.url}`,
            );
          }
        },
      ),
    );
}
