import { ThemeMenu } from "./ThemeMenu";

type Props = {
  readonly title: string;
  readonly actions?: React.ReactNode;
  readonly shared?: boolean;
};

export const PageHeader = ({ title, actions, shared = false }: Props) => (
  <header className="mb-6 flex flex-wrap items-center gap-3 border-b pb-5">
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 max-sm:basis-full">
      <h1 className="min-w-0 text-2xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
      <ThemeMenu alwaysVisible={shared} />
    </div>
    {actions !== undefined && <div className="ml-auto shrink-0">{actions}</div>}
  </header>
);
