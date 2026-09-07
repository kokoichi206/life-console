type Props = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: React.ReactNode;
};

export const PageHeader = ({ eyebrow, title, description, actions }: Props) => (
  <header className="mb-6 flex items-end justify-between gap-7 border-b pb-5 max-md:items-start">
    <div className="min-w-0">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
      {description !== undefined && <p className="mt-1.5 max-w-3xl text-xs leading-6 text-muted-foreground">{description}</p>}
    </div>
    {actions !== undefined && <div className="shrink-0">{actions}</div>}
  </header>
);
import { Eyebrow } from "./DesignSystem";
