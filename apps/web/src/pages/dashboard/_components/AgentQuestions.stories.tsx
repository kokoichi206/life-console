import type { AgentQuestion } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect } from "storybook/test";

import { AgentQuestions } from "./AgentQuestions";

const question: AgentQuestion = {
  id: "q1", jobId: "j1", taskId: "t1", taskTitle: "調査結果のまとめ方を確認",
  question: "比較対象の調査が終わりました。短い要約と詳しい比較表のどちらでまとめますか。",
  answer: null, createdAt: "2026-09-09T00:00:00.000Z", answeredAt: null,
};
const questionHandlers = (options: { readonly empty?: boolean; readonly readFailure?: boolean; readonly saveFailure?: boolean } = {}) => {
  let answered = options.empty ?? false;
  return [
    http.get("*/api/v1/agent-questions", () => options.readFailure
      ? HttpResponse.json({ error: { message: "確認待ちを取得できませんでした。" } }, { status: 500 })
      : HttpResponse.json({ data: answered ? [] : [question] })),
    http.post("*/api/v1/agent-questions/:id/answer", async ({ request }) => {
      const input = await request.json() as { readonly answer: string };
      if (options.saveFailure) return HttpResponse.json({ error: { message: "回答を保存できませんでした。" } }, { status: 500 });
      await delay(150);
      answered = input.answer.trim().length > 0;
      return HttpResponse.json({ data: null });
    }),
  ];
};
const meta = {
  title: "Pages/ホーム/Agent の確認待ち",
  component: AgentQuestions,
  beforeEach: () => { sessionStorage.removeItem("agent-question-answer:q1"); },
  parameters: { msw: { handlers: questionHandlers() } },
} satisfies Meta<typeof AgentQuestions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const Answer: Story = {
  parameters: { msw: { handlers: questionHandlers() } },
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole("textbox", { name: "回答・修正指示" });
    await userEvent.type(input, "短い要約にしてください。");
    await userEvent.click(canvas.getByRole("button", { name: "agent に回答する" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("回答を保存しました。");
    await expect(await canvas.findByText("今、あなたの回答を待っている agent はいません。")).toBeVisible();
  },
};
export const SaveFailure: Story = {
  parameters: { msw: { handlers: questionHandlers({ saveFailure: true }) } },
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole("textbox", { name: "回答・修正指示" });
    await userEvent.type(input, "比較表にしてください。");
    await userEvent.click(canvas.getByRole("button", { name: "agent に回答する" }));
    await expect(await canvas.findByText("回答を保存できませんでした。")).toBeVisible();
    await expect(input).toHaveValue("比較表にしてください。");
  },
};
export const Empty: Story = { parameters: { msw: { handlers: questionHandlers({ empty: true }) } } };
export const ReadFailure: Story = { parameters: { msw: { handlers: questionHandlers({ readFailure: true }) } } };
export const Loading: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/agent-questions", async () => {
  await delay("infinite");
  return HttpResponse.json({ data: [] });
})] } } };
