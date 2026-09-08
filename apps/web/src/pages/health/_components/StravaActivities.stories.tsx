import type { StravaActivityPage } from "@life-console/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";

import { StravaActivities } from "./StravaActivities";

const firstPage: StravaActivityPage = { activities: [{ id: "123", name: "架空の朝ラン", sportType: "Run", occurredAt: "2026-09-08T00:00:00Z", distanceMeters: 15000, movingSeconds: 5400, elapsedSeconds: 5600, averageHeartrate: 145 }, { id: "456", name: "架空の筋トレ", sportType: "WeightTraining", occurredAt: "2026-09-09T00:00:00Z", distanceMeters: 0, movingSeconds: 1800, elapsedSeconds: 1800, averageHeartrate: null }], nextPage: 2 };
const connected = http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: 42 } }));
const pages = http.get("*/api/v1/strava/activities", ({ request }) => HttpResponse.json({ data: new URL(request.url).searchParams.get("page") === "1" ? firstPage : { activities: [], nextPage: null } }));
const meta = {
  title: "Pages/健康/Strava の運動記録",
  component: StravaActivities,
  args: { from: "2026-08-31", to: "2026-09-13", weights: [], meals: [], onSelectWeek: fn() },
  parameters: { msw: { handlers: [connected, pages] } },
} satisfies Meta<typeof StravaActivities>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recorded: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const table = await canvas.findByRole("table", { name: "週ごとの運動・体重・食事" });
    await expect(table).toHaveTextContent("15.0 km");
    await expect(table).toHaveTextContent("0.0 km");
    await userEvent.click(canvas.getByRole("button", { name: "2026-09-07 〜 2026-09-13" }));
    await expect(args.onSelectWeek).toHaveBeenCalledWith({ from: "2026-09-07", to: "2026-09-13" });
    await userEvent.click(canvas.getByText("期間内の運動 2 件"));
    await expect(canvas.getAllByRole("link", { name: "View on Strava" })[0]).toHaveAttribute("href", "https://www.strava.com/activities/123");
    await expect(canvas.getByText(/平均心拍 145 bpm/)).toBeVisible();
  },
};
export const Dark: Story = { ...Recorded, globals: { theme: "dark" } };
export const Narrow: Story = { ...Recorded, decorators: [(Story) => <div style={{ maxWidth: 350 }}><Story /></div>] };
export const NotConnected: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: null } }))] } } };
export const NotConfigured: Story = { parameters: { msw: { handlers: [http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: false, athleteId: null } }))] } } };
export const Loading: Story = { parameters: { msw: { handlers: [connected, http.get("*/api/v1/strava/activities", async () => {
  await delay("infinite");
})] } } };
export const Empty: Story = { parameters: { msw: { handlers: [connected, http.get("*/api/v1/strava/activities", () => HttpResponse.json({ data: { activities: [], nextPage: null } }))] } } };
export const PartialFailure: Story = {
  parameters: { msw: { handlers: [connected, http.get("*/api/v1/strava/activities", ({ request }) => new URL(request.url).searchParams.get("page") === "1" ? HttpResponse.json({ data: firstPage }) : HttpResponse.json({ error: { message: "Strava の API 利用上限に達しました。" } }, { status: 502 }))] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/期間全体を取得できていないため/)).toBeVisible();
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
  },
};
export const Disconnect: Story = {
  parameters: { msw: { handlers: (() => {
    let isConnected = true;
    return [http.get("*/api/v1/strava/status", () => HttpResponse.json({ data: { configured: true, athleteId: isConnected ? 42 : null } })), pages, http.delete("*/api/v1/strava/connection", async () => {
      await delay(500);
      isConnected = false;
      return HttpResponse.json({ data: null });
    })];
  })() } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("table");
    await userEvent.click(canvas.getByRole("button", { name: "接続を解除" }));
    await expect(await canvas.findByText("Strava の接続を解除しています。")).toBeVisible();
    await expect(canvas.queryByText(/期間内の運動を取得しています/)).not.toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Connect with Strava" })).toBeVisible();
    await waitFor(() => expect(canvas.queryByRole("table")).not.toBeInTheDocument());
  },
};
