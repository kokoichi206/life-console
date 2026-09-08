import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api";
import { FormError, Panel, SectionHeading } from "../../components/DesignSystem";
import { Button } from "../../components/ui/Button";

import { disableBrowserPush, enableBrowserPush, readBrowserPushState, sendBrowserPushTest, type BrowserPushState } from "./browser-push";

type PushSettingsViewProps = {
  readonly state: BrowserPushState | undefined;
  readonly configured: boolean;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly testAccepted: boolean;
  readonly onEnable: () => void;
  readonly onDisable: () => void;
  readonly onTest: () => void;
};
export const PushSettingsView = ({ state, configured, loading, pending, error, testAccepted, onEnable, onDisable, onTest }: PushSettingsViewProps) => {
  const enabled = state?.permission === "granted" && state.registered;
  return (
    <Panel className="mb-4">
      <SectionHeading eyebrow="NOTIFICATIONS" title="この端末への通知" />
      <div className="space-y-3 px-5">
        <p className="text-sm" role="status">
          {loading
            ? "通知設定を確認しています。"
            : state === undefined
              ? "通知設定を確認できませんでした。"
              : !state.supported
                  ? "このブラウザでは通知を利用できません。iPhone・iPad はホーム画面に追加したアプリから開いてください。"
                  : state.permission === "denied"
                    ? "通知がブロックされています。ブラウザまたは端末の設定で許可してください。"
                    : !configured
                        ? "この環境では通知の準備ができていません。"
                        : enabled ? "この端末への通知は有効です。" : "この端末への通知は無効です。"}
        </p>
        <p className="text-xs text-muted-foreground">通知を押すと『同期・実行状況』を開きます。通知の許可は端末ごとに設定します。</p>
        <div className="flex flex-wrap gap-2">
          {!enabled && <Button type="button" disabled={loading || pending || !configured || state?.supported !== true || state.permission === "denied"} onClick={onEnable}>この端末で通知を有効にする</Button>}
          {state?.subscribed === true && <Button type="button" variant="outline" disabled={pending} onClick={onDisable}>この端末の通知を無効にする</Button>}
          {enabled && <Button type="button" variant="outline" disabled={pending || !configured} onClick={onTest}>テスト通知を送る</Button>}
        </div>
        {testAccepted && <p className="text-sm" role="status">通知サービスが送信を受け付けました。この端末に通知が届いたか確認してください。</p>}
        {error !== null && <FormError>{error}</FormError>}
      </div>
    </Panel>
  );
};

export const PushNotificationSettings = () => {
  const queryClient = useQueryClient();
  const configuration = useQuery({ queryKey: ["push-configuration"], queryFn: api.pushConfiguration });
  const browser = useQuery({ queryKey: ["browser-push"], queryFn: readBrowserPushState });
  const mutation = useMutation({
    mutationFn: async (action: "enable" | "disable" | "test") => {
      if (action === "disable") return disableBrowserPush();
      if (action === "test") return sendBrowserPushTest();
      return enableBrowserPush(configuration.data!.publicKey!);
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: ["browser-push"] }),
  });
  return (
    <PushSettingsView
      state={browser.data}
      configured={configuration.data?.publicKey != null}
      loading={browser.isPending || configuration.isPending}
      pending={mutation.isPending}
      error={(mutation.error ?? browser.error ?? configuration.error)?.message ?? null}
      testAccepted={mutation.isSuccess && mutation.variables === "test"}
      onEnable={() => mutation.mutate("enable")}
      onDisable={() => mutation.mutate("disable")}
      onTest={() => mutation.mutate("test")}
    />
  );
};
