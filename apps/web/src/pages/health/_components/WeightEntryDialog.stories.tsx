import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { useState } from "react";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import { Button } from "../../../components/ui/Button";

import { WeightEntryDialog } from "./WeightEntryDialog";

const savedWeight = fn();
const meta = {
  title: "Health/体重を記録",
  component: WeightEntryDialog,
  args: {
    open: true,
    previousWeight: { id: "previous", source: "manual", weightKg: 81.4, occurredAt: "2026-09-07T08:00:00+09:00", recordedAt: "2026-09-06T23:00:00Z" },
    onOpenChange: fn(),
  },
  render: function WeightEntryPreview(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)}>記録画面を開く</Button>
        <WeightEntryDialog
          {...args}
          open={open}
          onOpenChange={(next) => {
            args.onOpenChange(next);
            setOpen(next);
          }}
        />
      </>
    );
  },
  parameters: {
    layout: "fullscreen",
    msw: { handlers: [http.post("*/api/v1/weights", async ({ request }) => {
      savedWeight(await request.json());
      return HttpResponse.json({ data: null });
    })] },
  },
  beforeEach: () => { savedWeight.mockClear(); },
} satisfies Meta<typeof WeightEntryDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PreviousWeight: Story = {
  name: "前回の体重から記録",
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(await screen.findByRole("spinbutton", { name: "体重の整数部" })).toHaveAttribute("aria-valuenow", "81");
    await expect(screen.getByRole("spinbutton", { name: "体重の小数部" })).toHaveAttribute("aria-valuenow", "4");
    await expect(screen.getByText("前回 81.4 kg から調整")).toBeVisible();
  },
};
export const Dark: Story = { name: "ダーク", globals: { theme: "dark" } };
export const FirstRecord: Story = {
  name: "初めての記録",
  args: { previousWeight: undefined },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(await screen.findByRole("spinbutton", { name: "体重 (kg)" })).toHaveValue(null);
    await expect(screen.getByRole("button", { name: "体重を保存" })).toBeDisabled();
  },
};
export const SaveSelectedWeightAndTime: Story = {
  name: "値と計測日時を変えて保存",
  play: async ({ canvasElement, userEvent, args }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const decimal = await screen.findByRole("spinbutton", { name: "体重の小数部" });
    await userEvent.click(decimal);
    await userEvent.keyboard("{ArrowUp}");
    await expect(decimal).toHaveAttribute("aria-valuenow", "5");
    await fireEvent.change(screen.getByLabelText("計測日"), { target: { value: "2026-09-06" } });
    await fireEvent.change(screen.getByLabelText("計測時刻"), { target: { value: "07:35" } });
    await userEvent.click(screen.getByRole("button", { name: "体重を保存" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(savedWeight).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 81.5, occurredAt: new Date("2026-09-06T07:35").toISOString(), source: "manual" }));
  },
};
export const SaveFailure: Story = {
  name: "保存できなかったとき",
  parameters: { msw: { handlers: [http.post("*/api/v1/weights", () => HttpResponse.json({ error: { message: "保存できませんでした。接続を確認して、もう一度お試しください。" } }, { status: 503 }))] } },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("button", { name: "体重を保存" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
    await expect(screen.getByRole("spinbutton", { name: "体重の小数部" })).toHaveAttribute("aria-valuenow", "4");
  },
};
export const Saving: Story = {
  name: "保存中",
  parameters: { msw: { handlers: [http.post("*/api/v1/weights", async () => {
    await delay("infinite");
    return HttpResponse.json({ data: null });
  })] } },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("button", { name: "体重を保存" }));
    await expect(screen.getByRole("button", { name: "保存しています…" })).toBeDisabled();
  },
};
