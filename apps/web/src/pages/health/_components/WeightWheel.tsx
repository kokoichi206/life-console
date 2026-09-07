import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { cn } from "../../../lib/class-names";

const ROW_HEIGHT = 48;

export const WeightWheel = ({ label, value, minimum, maximum, onChange }: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly onChange: (value: number) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wheel = scrollRef.current!;
    // 指で動かしている途中の端数は残し、親から値が変わったときだけ位置を合わせる。
    if (Math.round(wheel.scrollTop / ROW_HEIGHT) + minimum !== value) {
      wheel.scrollTop = (value - minimum) * ROW_HEIGHT;
    }
  }, [value, minimum]);

  const selectValue = (next: number) => {
    scrollRef.current!.scrollTop = (next - minimum) * ROW_HEIGHT;
    onChange(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowUp: value + 1,
      ArrowDown: value - 1,
      PageUp: value + 10,
      PageDown: value - 10,
      Home: minimum,
      End: maximum,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectValue(Math.min(maximum, Math.max(minimum, next)));
  };

  return (
    <div
      ref={scrollRef}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      onKeyDown={handleKeyDown}
      onScroll={(event) => onChange(Math.round(event.currentTarget.scrollTop / ROW_HEIGHT) + minimum)}
      className="relative z-10 h-60 touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl py-24 text-center tabular-nums outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)" }}
    >
      {Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map((number) => (
        <div
          key={number}
          aria-hidden="true"
          onClick={() => selectValue(number)}
          className={cn("flex h-12 cursor-pointer snap-center items-center justify-center text-3xl font-medium transition-[color,opacity] select-none", number === value ? "text-foreground dark:text-white" : "text-muted-foreground/60 dark:text-white/40")}
        >
          {number}
        </div>
      ))}
    </div>
  );
};
