import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import { Button } from "../../../components/ui/Button";

import { MealEntryDialog } from "./MealEntryDialog";

const savedMeal = fn();
const uploadedPhoto = fn();
const photoFile = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const png = Uint8Array.from(atob(canvas.toDataURL("image/png").slice("data:image/png;base64,".length)), (char) => char.charCodeAt(0));
  return new File([png], "meal.png", { type: "image/png" });
};
const meta = {
  title: "Health/食事を記録",
  component: MealEntryDialog,
  args: { open: true, onOpenChange: fn() },
  render: function MealEntryPreview(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)}>記録画面を開く</Button>
        <MealEntryDialog
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
    msw: { handlers: [
      http.post("*/api/v1/meals", async ({ request }) => {
        savedMeal(await request.json());
        return HttpResponse.json({ data: null });
      }),
      http.post("*/api/v1/meal-photos/upload", ({ request }) => HttpResponse.json({ data: {
        photoId: "meal-photo", uploadUrl: new URL("/__meal-photo", request.url).href, requiredHeaders: { "Content-Type": "image/jpeg" }, expiresAt: "2026-09-08T00:00:00Z",
      } })),
      http.put("*/__meal-photo", async ({ request }) => {
        const bytes = new Uint8Array(await request.arrayBuffer());
        uploadedPhoto({ contentType: request.headers.get("Content-Type"), signature: Array.from(bytes.slice(0, 2)), size: bytes.length });
        return new HttpResponse(null, { status: 204 });
      }),
    ] },
  },
  beforeEach: () => {
    savedMeal.mockClear();
    uploadedPhoto.mockClear();
  },
} satisfies Meta<typeof MealEntryDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  name: "写真かメモを入力",
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(await screen.findByRole("button", { name: "食事を保存" })).toBeDisabled();
    await expect(screen.getByLabelText("食事の日時")).toBeRequired();
    await expect(screen.getByLabelText("保存済みの写真")).not.toHaveAttribute("capture");
    await expect(screen.getByLabelText("カメラで撮影する写真")).toHaveAttribute("capture", "environment");
  },
};
export const Dark: Story = { name: "ダーク", globals: { theme: "dark" } };
export const SaveMemo: Story = {
  name: "メモと日時を保存",
  play: async ({ canvasElement, userEvent, args }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.type(await screen.findByLabelText("メモ"), "おにぎりと味噌汁");
    await userEvent.selectOptions(screen.getByLabelText("食事区分"), "breakfast");
    fireEvent.change(screen.getByLabelText("食事の日時"), { target: { value: "2026-09-08T07:30" } });
    await userEvent.click(screen.getByRole("button", { name: "食事を保存" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(savedMeal).toHaveBeenCalledWith(expect.objectContaining({ memo: "おにぎりと味噌汁", mealKind: "breakfast", photoId: null, occurredAt: new Date("2026-09-08T07:30").toISOString() }));
    await userEvent.click(screen.getByRole("button", { name: "記録画面を開く" }));
    await expect(await screen.findByLabelText("メモ")).toHaveValue("");
  },
};
export const SavePhoto: Story = {
  name: "写真だけで保存",
  play: async ({ canvasElement, userEvent, args }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.upload(await screen.findByLabelText("保存済みの写真"), photoFile());
    await expect(await screen.findByRole("img", { name: "選択した食事の写真" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "食事を保存" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(uploadedPhoto).toHaveBeenCalledWith(expect.objectContaining({ contentType: "image/jpeg", signature: [255, 216] }));
    await expect(savedMeal).toHaveBeenCalledWith(expect.objectContaining({ photoId: "meal-photo", memo: "" }));
  },
};
export const SaveFailure: Story = {
  name: "保存できなかったとき",
  parameters: { msw: { handlers: [http.post("*/api/v1/meals", () => HttpResponse.json({ error: { message: "保存できませんでした。" } }, { status: 503 }))] } },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.type(await screen.findByLabelText("メモ"), "カレー");
    await userEvent.click(screen.getByRole("button", { name: "食事を保存" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
    await expect(screen.getByLabelText("メモ")).toHaveValue("カレー");
  },
};
export const Saving: Story = {
  name: "保存中",
  parameters: { msw: { handlers: [http.post("*/api/v1/meals", async () => {
    await delay("infinite");
    return HttpResponse.json({ data: null });
  })] } },
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.type(await screen.findByLabelText("メモ"), "カレー");
    await userEvent.click(screen.getByRole("button", { name: "食事を保存" }));
    await expect(screen.getByRole("button", { name: "保存しています…" })).toBeDisabled();
    await expect(screen.getByLabelText("保存済みの写真")).toBeDisabled();
    await expect(screen.getByRole("button", { name: "写真を選ぶ" })).toBeDisabled();
    await expect(screen.getByRole("button", { name: "カメラで撮る" })).toBeDisabled();
    await expect(screen.getByLabelText("食事区分")).toBeDisabled();
    await expect(screen.getByLabelText("メモ")).toBeDisabled();
  },
};

export const ReplacePhoto: Story = {
  name: "写真の選び直しと取り消し",
  play: async ({ canvasElement, userEvent }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.upload(await screen.findByLabelText("保存済みの写真"), photoFile());
    await expect(await screen.findByRole("img", { name: "選択した食事の写真" })).toBeVisible();
    await userEvent.upload(screen.getByLabelText("カメラで撮影する写真"), photoFile());
    await expect(screen.getAllByRole("img", { name: "選択した食事の写真" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "選択した写真を取り消す" }));
    await expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "食事を保存" })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("保存済みの写真"), photoFile());
    await expect(await screen.findByRole("img", { name: "選択した食事の写真" })).toBeVisible();
    await expect(screen.getByRole("button", { name: "食事を保存" })).toBeEnabled();
  },
};
