import noDirectEnvAccess from "./no-direct-env-access/rule.js";
import noDiscardedResult from "./no-discarded-result/rule.js";
import noRelativeImportsAcrossLayers from "./no-relative-imports-across-layers/rule.js";
import noThrowStatement from "./no-throw-statement/rule.js";
import requireResultReturnType from "./require-result-return-type/rule.js";
import requireUiStorybookStory from "./require-ui-storybook-story/rule.js";

export default {
  rules: {
    "no-direct-env-access": noDirectEnvAccess,
    "no-discarded-result": noDiscardedResult,
    "no-relative-imports-across-layers": noRelativeImportsAcrossLayers,
    "no-throw-statement": noThrowStatement,
    "require-result-return-type": requireResultReturnType,
    "require-ui-storybook-story": requireUiStorybookStory,
  },
};
