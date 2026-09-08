import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { router } from "./router";

// ルートの型が any に広がると、期待したエラーが消えて typecheck が失敗する。
export const verifyRouterTypes = () => {
  <Link to="/tasks" search={{ view: "tasks" }} />;
  <Link to="/health" search={{ entry: "weight" }} />;
  <Link from="/tasks" to="/tasks" search={(previous) => ({ ...previous, taskId: undefined })} />;
  // @ts-expect-error 存在しない遷移先を許可しない。
  <Link to="/not-a-real-route" />;
  // @ts-expect-error 命令的な遷移でも存在しない path を許可しない。
  void router.navigate({ to: "/not-a-real-route" });
  // @ts-expect-error 遷移先で未定義の search を許可しない。
  <Link to="/operations" search={{ entry: "note" }} />;
  // @ts-expect-error search の値を任意の文字列へ広げない。
  <Link to="/tasks" search={{ view: "invalid" }} />;
};

export const useRouterTypeChecks = () => {
  const navigate = useNavigate({ from: "/health" });
  void navigate({ search: { entry: "meal" } });
  void navigate({ search: (previous) => ({ ...previous, entry: undefined, meal: undefined }) });
  // @ts-expect-error hook 経由でも存在しない path を許可しない。
  void navigate({ to: "/not-a-real-route" });
  // @ts-expect-error hook の対象も登録済みのルートに限定する。
  useSearch({ from: "/not-a-real-route" });
};
