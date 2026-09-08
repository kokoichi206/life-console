import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type CSSProperties, type FormEvent } from "react";

import { api } from "../../api";
import { EmptyState, Eyebrow, Field, FormError, MetricCard, Panel, SectionHeading } from "../../components/DesignSystem";
import { LineChart } from "../../components/LineChart";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Textarea } from "../../components/ui/textarea";

import { financeQuery } from "./queries";

const money = (value: number): string => new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
}).format(value);

const localDateTime = (): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export const FinancePage = () => {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(financeQuery);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [amountYen, setAmountYen] = useState("");
  const [category, setCategory] = useState("食費");
  const [paymentMethod, setPaymentMethod] = useState("カード");
  const [payee, setPayee] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [accountName, setAccountName] = useState("");
  const [assetKind, setAssetKind] = useState<"cash" | "investment" | "debt">("cash");
  const [balanceYen, setBalanceYen] = useState("");
  const [analysisMonth, setAnalysisMonth] = useState(new Date().toISOString().slice(0, 7));
  const [adjustmentTransactionId, setAdjustmentTransactionId] = useState("");
  const [adjustmentYen, setAdjustmentYen] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const createTransaction = useMutation({
    mutationFn: api.createFinanceTransaction,
    onSuccess: async () => {
      setAmountYen("");
      setPayee("");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const createBalance = useMutation({
    mutationFn: api.createAssetBalance,
    onSuccess: async () => {
      setBalanceYen("");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });
  const createAdjustment = useMutation({
    mutationFn: api.createFinanceAdjustment,
    onSuccess: async () => {
      setAdjustmentYen("");
      setAdjustmentReason("");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });
  const submitTransaction = (event: FormEvent) => {
    event.preventDefault();
    createTransaction.mutate({
      source: "manual",
      sourceTransactionId: crypto.randomUUID(),
      kind,
      amountYen: Number(amountYen),
      category,
      paymentMethod,
      payee,
      occurredAt: new Date(occurredAt).toISOString(),
    });
  };
  const submitBalance = (event: FormEvent) => {
    event.preventDefault();
    createBalance.mutate({
      accountName,
      assetKind,
      amountYen: Number(balanceYen),
      occurredAt: new Date(occurredAt).toISOString(),
    });
  };
  const submitAdjustment = (event: FormEvent) => {
    event.preventDefault();
    createAdjustment.mutate({
      transactionId: adjustmentTransactionId,
      amountDeltaYen: Number(adjustmentYen),
      reason: adjustmentReason,
    });
  };
  const allocationTotal = data.assetAllocation.reduce((sum, entry) => sum + Math.abs(entry.amountYen), 0);
  const cashAllocationPercentage = (data.assetAllocation.find((entry) => entry.assetKind === "cash")?.amountYen ?? 0) / Math.max(1, allocationTotal) * 100;
  const investmentAllocationPercentage = (data.assetAllocation.find((entry) => entry.assetKind === "investment")?.amountYen ?? 0) / Math.max(1, allocationTotal) * 100;
  const periodTransactions = data.transactions.filter((transaction) => transaction.occurredAt.startsWith(analysisMonth));
  const periodIncomeYen = periodTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transaction.adjustedAmountYen, 0);
  const periodExpenseYen = periodTransactions.filter((transaction) => transaction.kind === "expense").reduce((sum, transaction) => sum + transaction.adjustedAmountYen, 0);
  const periodCategories = Array.from(periodTransactions.filter((transaction) => transaction.kind === "expense").reduce((categories, transaction) => {
    categories.set(transaction.category, (categories.get(transaction.category) ?? 0) + transaction.adjustedAmountYen);
    return categories;
  }, new Map<string, number>()).entries()).map(([periodCategory, periodAmountYen]) => ({
    category: periodCategory,
    amountYen: periodAmountYen,
  })).toSorted((left, right) => right.amountYen - left.amountYen);
  const periodPaymentMethods = Array.from(periodTransactions.filter((transaction) => transaction.kind === "expense").reduce((paymentMethods, transaction) => {
    paymentMethods.set(transaction.paymentMethod, (paymentMethods.get(transaction.paymentMethod) ?? 0) + transaction.adjustedAmountYen);
    return paymentMethods;
  }, new Map<string, number>()).entries()).map(([method, periodAmountYen]) => ({
    paymentMethod: method,
    amountYen: periodAmountYen,
  })).toSorted((left, right) => right.amountYen - left.amountYen);

  return (
    <>
      <PageHeader
        title="収支と資産"
        actions={(
          <Field label="集計月" className="min-w-36">
            <Input type="month" value={analysisMonth} onChange={(event) => setAnalysisMonth(event.target.value)} />
          </Field>
        )}
      />
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="収入" value={<span className="text-xl">{money(periodIncomeYen)}</span>} detail={analysisMonth} tone="primary" />
        <MetricCard label="支出" value={<span className="text-xl">{money(periodExpenseYen)}</span>} detail="カテゴリ別に集計" tone="orange" />
        <MetricCard label="収支" value={<span className="text-xl">{money(periodIncomeYen - periodExpenseYen)}</span>} detail="収入 − 支出" tone="blue" />
        <MetricCard label="純資産" value={<span className="text-xl">{money(data.netWorthYen)}</span>} detail="資産 − 負債" tone="gold" />
      </section>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading eyebrow="EXPENSES" title="カテゴリ別支出" />
          <div className="grid gap-3 px-5">
            {periodCategories.map((entry) => (
              <div key={entry.category} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-xs">
                <span className="truncate text-muted-foreground">{entry.category}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${periodExpenseYen === 0 ? 0 : entry.amountYen / periodExpenseYen * 100}%` }} /></div>
                <strong className="text-right tabular-nums">{money(entry.amountYen)}</strong>
              </div>
            ))}
            {periodCategories.length === 0 && <EmptyState>この月の支出はありません。</EmptyState>}
          </div>
          <h3 className="mt-6 px-5 text-xs font-semibold">支払手段</h3>
          <div className="mt-3 flex flex-wrap gap-2 px-5">
            {periodPaymentMethods.map((entry) => (
              <Badge variant="secondary" key={entry.paymentMethod}>
                {entry.paymentMethod}
                {" "}
                {money(entry.amountYen)}
              </Badge>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionHeading eyebrow="ALLOCATION" title="資産配分" />
          <div
            className="relative mx-auto grid aspect-square w-44 place-items-center rounded-full bg-[conic-gradient(var(--chart-1)_0_var(--cash),var(--chart-4)_var(--cash)_var(--investment),var(--chart-2)_var(--investment)_100%)] before:absolute before:size-28 before:rounded-full before:bg-card"
            style={{
              "--cash": `${cashAllocationPercentage}%`,
              "--investment": `${cashAllocationPercentage + investmentAllocationPercentage}%`,
            } as CSSProperties}
          >
            <span className="relative z-10 text-center text-sm font-semibold tabular-nums">
              {money(data.netWorthYen)}
              <small className="mt-1 block text-[0.65rem] font-normal text-muted-foreground">純資産</small>
            </span>
          </div>
          <div className="mt-5 grid gap-2 px-5">
            {data.assetAllocation.map((entry) => (
              <div key={entry.assetKind} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
                <span className={`size-2 rounded-full ${entry.assetKind === "cash" ? "bg-chart-1" : entry.assetKind === "investment" ? "bg-chart-4" : "bg-chart-2"}`} />
                <span>{({ cash: "現金", investment: "金融資産", debt: "負債" }[entry.assetKind] ?? entry.assetKind)}</span>
                <strong className="tabular-nums">{money(entry.amountYen)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel className="mb-4">
        <SectionHeading eyebrow="NET WORTH" title="純資産の推移" />
        <div className="px-5"><LineChart points={data.assetHistory.map((entry) => ({ label: new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(entry.occurredAt)), value: entry.netWorthYen }))} valueSuffix=" 円" /></div>
      </Panel>
      <div className="mb-4 grid items-start gap-4 xl:grid-cols-2">
        <form id="expense-entry" onSubmit={submitTransaction}>
          <Panel className="gap-4 px-5">
            <div className="space-y-1.5">
              <Eyebrow>TRANSACTION</Eyebrow>
              <h2 className="text-base font-semibold">収支を記録</h2>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
              <Button type="button" variant={kind === "expense" ? "default" : "ghost"} onClick={() => setKind("expense")}>支出</Button>
              <Button type="button" variant={kind === "income" ? "default" : "ghost"} onClick={() => setKind("income")}>収入</Button>
            </div>
            <Field label="金額"><Input required type="number" min="1" inputMode="numeric" value={amountYen} onChange={(event) => setAmountYen(event.target.value)} /></Field>
            <Field label="カテゴリ"><Input required value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
            <Field label="支払手段"><Input required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} /></Field>
            <Field label="支払先"><Input value={payee} onChange={(event) => setPayee(event.target.value)} /></Field>
            <Field label="日時"><Input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
            <Button type="submit" size="lg" className="w-full" disabled={createTransaction.isPending}>保存する</Button>
            {createTransaction.error !== null && <FormError>{createTransaction.error.message}</FormError>}
          </Panel>
        </form>
        <form onSubmit={submitBalance}>
          <Panel className="gap-4 px-5">
            <div className="space-y-1.5">
              <Eyebrow>BALANCE</Eyebrow>
              <h2 className="text-base font-semibold">残高を記録</h2>
            </div>
            <Field label="口座名"><Input required value={accountName} onChange={(event) => setAccountName(event.target.value)} /></Field>
            <Field label="種類">
              <NativeSelect className="w-full" value={assetKind} onChange={(event) => setAssetKind(event.target.value as typeof assetKind)}>
                <option value="cash">現金</option>
                <option value="investment">金融資産</option>
                <option value="debt">負債</option>
              </NativeSelect>
            </Field>
            <Field label="残高"><Input required type="number" inputMode="numeric" value={balanceYen} onChange={(event) => setBalanceYen(event.target.value)} /></Field>
            <Field label="時点"><Input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
            <Button type="submit" size="lg" className="w-full" disabled={createBalance.isPending}>残高を保存</Button>
            {createBalance.error !== null && <FormError>{createBalance.error.message}</FormError>}
          </Panel>
        </form>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <form onSubmit={submitAdjustment}>
          <Panel className="gap-4 px-5">
            <div className="space-y-1.5">
              <Eyebrow>ADJUSTMENT</Eyebrow>
              <h2 className="text-base font-semibold">取引を補正</h2>
            </div>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">取込元は変更せず、差額を別レコードとして追加します。</p>
            <Field label="対象取引">
              <NativeSelect className="w-full" required value={adjustmentTransactionId} onChange={(event) => setAdjustmentTransactionId(event.target.value)}>
                <option value="">選択してください</option>
                {data.transactions.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {new Date(transaction.occurredAt).toLocaleDateString("ja-JP")}
                    {" "}
                    {transaction.payee || transaction.category}
                    {" "}
                    {money(transaction.adjustedAmountYen)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="差額"><Input required type="number" inputMode="numeric" value={adjustmentYen} onChange={(event) => setAdjustmentYen(event.target.value)} /></Field>
            <Field label="理由"><Textarea required rows={3} maxLength={500} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} /></Field>
            <Button type="submit" size="lg" className="w-full" disabled={createAdjustment.isPending}>補正を追加</Button>
            {createAdjustment.error !== null && <FormError>{createAdjustment.error.message}</FormError>}
          </Panel>
        </form>
        <Panel>
          <SectionHeading eyebrow="HISTORY" title="補正履歴" />
          <div className="px-5">
            {data.adjustments.map((adjustment) => (
              <article key={adjustment.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t py-3 first:border-t-0">
                <div className="min-w-0">
                  <strong className="block truncate text-xs">{adjustment.reason}</strong>
                  <small className="text-[0.65rem] text-muted-foreground">{new Date(adjustment.createdAt).toLocaleString("ja-JP")}</small>
                </div>
                <span className="text-xs font-semibold tabular-nums">
                  {adjustment.amountDeltaYen > 0 ? "+" : ""}
                  {money(adjustment.amountDeltaYen)}
                </span>
              </article>
            ))}
            {data.adjustments.length === 0 && <EmptyState>補正履歴はありません。</EmptyState>}
          </div>
        </Panel>
      </div>
    </>
  );
};
