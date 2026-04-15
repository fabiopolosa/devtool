import type { DagRunnerOptions } from "./types.js";
import { DagRunner } from "./runner.js";

// Backward-compatible alias kept for existing imports.
export type JobRunnerOptions = DagRunnerOptions;
export class JobRunner extends DagRunner {}
