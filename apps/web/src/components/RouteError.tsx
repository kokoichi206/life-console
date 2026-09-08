import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { Eyebrow, Panel } from "./DesignSystem";
import { Button } from "./ui/Button";

export const RouteError = ({ error }: ErrorComponentProps) => {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();
  useEffect(() => {
    // 別ページへ移動した場合も、失敗した Query を再取得できるようにする。
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  return (
    <Panel className="mx-auto mt-20 max-w-xl gap-4 px-5">
      <Eyebrow>REQUEST FAILED</Eyebrow>
      <h1 className="text-xl font-semibold">データを読み込めませんでした。</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button className="w-fit" type="button" onClick={() => void router.invalidate()}>再読み込み</Button>
    </Panel>
  );
};
