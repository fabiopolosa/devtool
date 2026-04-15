import noDirectPromptBuild from "./no-direct-prompt-build.mjs";
import noSubpromptsOutsideBuilder from "./no-subprompts-outside-builder.mjs";
import noBrainstormPlanLegacy from "./no-brainstormplan-legacy.mjs";
import noOrchestrationOutsideRuflo from "./no-orchestration-outside-ruflo.mjs";

export default {
  rules: {
    "no-direct-prompt-build": noDirectPromptBuild,
    "no-subprompts-outside-builder": noSubpromptsOutsideBuilder,
    "no-brainstormplan-legacy": noBrainstormPlanLegacy,
    "no-orchestration-outside-ruflo": noOrchestrationOutsideRuflo
  }
};
