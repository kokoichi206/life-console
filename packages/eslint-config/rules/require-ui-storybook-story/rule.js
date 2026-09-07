import { existsSync } from "node:fs";
import { basename } from "node:path";

export default {
  meta: {
    type: "problem",
    docs: { description: "共通 UI の隣に Storybook story を要求する。" },
    schema: [],
    messages: { missing: "{{story}} をコンポーネントの隣に作成してください。" },
  },
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith(".tsx") || /\.(stories|test|spec)\.tsx$/.test(filename) || basename(filename) === "index.tsx") return {};
    return {
      Program(node) {
        const story = filename.replace(/\.tsx$/, ".stories.tsx");
        if (!existsSync(story)) context.report({ node, messageId: "missing", data: { story: basename(story) } });
      },
    };
  },
};
