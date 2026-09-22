import { z } from "zod";

export const threadCreatedPullRequestSchema = z
  .object({
    repo: z.string().regex(/^[^\s/]+\/[^\s/]+$/u),
    number: z.number().int().positive(),
    url: z.string().url(),
    seq: z.number().int().nonnegative(),
  })
  .strict();
export type ThreadCreatedPullRequest = z.infer<
  typeof threadCreatedPullRequestSchema
>;
