import { ESLintUtils } from "@typescript-eslint/utils";

import { isResultType } from "../../lib/result-type.js";

export default {
  meta: {
    type: "problem",
    docs: { description: "Result を返す呼び出しの結果を捨てない。" },
    schema: [],
    messages: { discarded: "Result を捨てず、呼び出し側へ返すか ok を判定してください。" },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    return {
      ExpressionStatement(node) {
        let expression = node.expression;
        if (expression.type === "UnaryExpression" && expression.operator === "void") expression = expression.argument;
        if (expression.type === "AwaitExpression") expression = expression.argument;
        const location = services.esTreeNodeToTSNodeMap.get(expression);
        if (isResultType(checker, checker.getTypeAtLocation(location), location)) context.report({ node, messageId: "discarded" });
      },
    };
  },
};
