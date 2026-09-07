import { ESLintUtils } from "@typescript-eslint/utils";
import ts from "typescript";

import { isResultType } from "../../lib/result-type.js";

export default {
  meta: {
    type: "problem",
    docs: { description: "公開する業務処理と factory のメソッドに Result 型を要求する。" },
    schema: [],
    messages: { required: "{{name}} は Result<T, E> または Promise<Result<T, E>> を返してください。" },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const check = (node, name) => {
      const location = services.esTreeNodeToTSNodeMap.get(node);
      const signatures = checker.getTypeAtLocation(location).getCallSignatures();
      for (const signature of signatures) {
        const returned = checker.getReturnTypeOfSignature(signature);
        if (isResultType(checker, returned, location)) continue;
        const awaited = checker.getAwaitedType(returned);
        const methods = !awaited || (awaited.flags & ts.TypeFlags.Object) === 0 ? [] : awaited.getProperties().flatMap((property) => checker.getTypeOfSymbolAtLocation(property, location).getCallSignatures().map((method) => ({ property, method })));
        if (methods.length === 0) context.report({ node, messageId: "required", data: { name } });
        for (const { property, method } of methods) {
          if (!isResultType(checker, checker.getReturnTypeOfSignature(method), location)) context.report({ node, messageId: "required", data: { name: `${name}.${property.name}` } });
        }
      }
    };
    return {
      "ExportNamedDeclaration > FunctionDeclaration"(node) { check(node, node.id.name); },
      "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
        if (node.init) check(node.init, node.id.name);
      },
      "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression > Property"(node) {
        check(node.value, node.key.name);
      },
    };
  },
};
