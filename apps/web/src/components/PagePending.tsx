import { Panel } from "./DesignSystem";
import { PageHeader } from "./PageHeader";

export const PagePending = ({ title, shared = false }: { readonly title: string; readonly shared?: boolean }) => (
  <section aria-label={`${title}の読み込み`}>
    <PageHeader title={title} shared={shared} />
    <p role="status" className="mb-5 text-sm text-muted-foreground">{`${title}を読み込んでいます。`}</p>
    <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-24 rounded-xl bg-muted" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <Panel key={index} mobileLayout="section" className="gap-4 px-5">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="h-44 rounded-lg bg-muted" />
          </Panel>
        ))}
      </div>
    </div>
  </section>
);
