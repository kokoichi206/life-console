type Props = {
  readonly title: string;
  readonly actions?: React.ReactNode;
};

export const PageHeader = ({ title, actions }: Props) => (
  <header className="mb-6 flex items-end justify-between gap-7 border-b pb-5 max-md:items-start">
    <h1 className="min-w-0 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
    {actions !== undefined && <div className="shrink-0">{actions}</div>}
  </header>
);
