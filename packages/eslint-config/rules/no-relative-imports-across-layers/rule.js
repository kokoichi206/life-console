const LAYERS = ["handlers", "usecases", "repositories"];

const layerOf = (filename) => LAYERS.find((layer) => filename.includes(`/src/${layer}/`));

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Cross-layer imports must use package aliases so architecture stays visible.",
    },
    schema: [],
    messages: {
      forbidden: "レイヤーをまたぐ相対 import は禁止です。アプリ内 alias または package の公開口を使ってください。",
    },
  },
  create(context) {
    const sourceLayer = layerOf(context.filename);
    if (!sourceLayer) return {};

    return {
      ImportDeclaration(node) {
        const importedPath = node.source.value;
        if (typeof importedPath !== "string" || !importedPath.startsWith(".")) return;
        if (LAYERS.some((layer) => importedPath.includes(`/${layer}/`))) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};
