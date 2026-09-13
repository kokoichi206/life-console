import type { AgentQuestion } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../../api";
import { EmptyState, Field, FormError, Panel, SectionHeading } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Textarea } from "../../../components/ui/textarea";

const QuestionForm = ({ question, onAnswered }: { readonly question: AgentQuestion; readonly onAnswered: () => void }) => {
  const draftKey = `agent-question-answer:${question.id}`;
  const [answer, setAnswer] = useState(() => sessionStorage.getItem(draftKey) ?? "");
  const client = useQueryClient();
  const submitAnswer = useMutation({
    mutationFn: () => api.answerAgentQuestion(question.id, answer),
    onSuccess: async () => {
      sessionStorage.removeItem(draftKey);
      onAnswered();
      await client.invalidateQueries({ queryKey: ["agent-questions"] });
      await client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  return (
    <form
      className="space-y-3 border-t py-4 first:border-t-0"
      onSubmit={(event) => {
        event.preventDefault();
        submitAnswer.mutate();
      }}
    >
      <h3 className="text-sm font-semibold">{question.taskTitle}</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{question.question}</p>
      <Field label="回答・修正指示">
        <Textarea
          required
          maxLength={10_000}
          rows={3}
          value={answer}
          disabled={submitAnswer.isPending}
          onChange={(event) => {
            setAnswer(event.target.value);
            sessionStorage.setItem(draftKey, event.target.value);
          }}
        />
      </Field>
      <Button type="submit" disabled={submitAnswer.isPending || answer.trim() === ""}>{submitAnswer.isPending ? "回答を保存中" : "agent に回答する"}</Button>
      {submitAnswer.error !== null && <FormError>{submitAnswer.error.message}</FormError>}
    </form>
  );
};

export const AgentQuestions = () => {
  const questions = useQuery({ queryKey: ["agent-questions"], queryFn: api.agentQuestions, refetchInterval: 5_000 });
  const [answered, setAnswered] = useState(false);
  return (
    <Panel className="mb-4">
      <SectionHeading eyebrow="AGENT" title="あなたの確認待ち" />
      <div className="px-5">
        <p className="text-xs text-muted-foreground">agent からの質問に回答・修正指示を返せます。回答は同じ作業を進めるために使われます。</p>
        {answered && <p role="status" className="mt-3 text-sm">回答を保存しました。</p>}
        {questions.isPending && <p className="py-4 text-sm">確認待ちを読み込んでいます。</p>}
        {questions.isError && <FormError>{questions.error.message}</FormError>}
        {questions.data?.map((question) => <QuestionForm key={question.id} question={question} onAnswered={() => setAnswered(true)} />)}
        {questions.isSuccess && questions.data.length === 0 && <EmptyState>今、あなたの回答を待っている agent はいません。</EmptyState>}
      </div>
    </Panel>
  );
};
