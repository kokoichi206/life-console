export default {
  meta: {
    type: "problem",
    docs: {
      description: "Expected application errors must be returned as Result values.",
    },
    schema: [],
    messages: {
      forbidden: "handler/usecase/repository では throw せず Result を返してください。",
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({ node, messageId: "forbidden" });
      },
    };
  },
};
