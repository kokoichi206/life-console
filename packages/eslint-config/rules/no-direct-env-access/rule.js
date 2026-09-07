export default {
  meta: {
    type: "problem",
    docs: { description: "環境変数は検証境界からだけ読み込む。" },
    schema: [],
    messages: { boundary: "環境変数を直接読まず、Zod で検証済みの設定を使ってください。" },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const key = node.computed ? node.property.value : node.property.name;
        if (key !== "env") return;
        const object = node.object;
        if ((object.type === "Identifier" && object.name === "process") || (object.type === "MetaProperty" && object.meta.name === "import")) context.report({ node, messageId: "boundary" });
      },
    };
  },
};
