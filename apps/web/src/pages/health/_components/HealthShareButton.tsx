import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "../../../api";
import { FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { parseSharedHealthSearch, type HealthSearch } from "../health-search";

export const HealthShareButton = ({ search }: { readonly search: HealthSearch }) => {
  const share = useQuery({ queryKey: ["health-share-link"], queryFn: api.healthShare, staleTime: 0, gcTime: 0 });
  const copy = useMutation({
    mutationFn: async (path: string) => {
      const url = new URL(path, window.location.origin);
      for (const [key, value] of Object.entries(parseSharedHealthSearch(search))) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
      await navigator.clipboard.writeText(url.toString());
    },
  });
  return (
    <>
      <Button variant="outline" className="h-11 min-w-0 rounded-xl px-1 text-xs whitespace-normal sm:px-5 sm:text-sm" disabled={share.data == null || copy.isPending} onClick={() => { if (share.data != null) copy.mutate(share.data); }}>共有リンク</Button>
      {(copy.isSuccess || share.data === null || share.error !== null || copy.error !== null) && (
        <div className="col-span-full row-start-2 space-y-2">
          {copy.isSuccess && <p role="status" className="text-sm text-muted-foreground">共有リンクをコピーしました。リンクを知っている人が健康ページを閲覧できます。</p>}
          {share.data === null && <p className="text-xs text-muted-foreground">共有リンクは未設定です。</p>}
          {share.error !== null && <FormError>{share.error.message}</FormError>}
          {copy.error !== null && <FormError>共有リンクをコピーできませんでした。</FormError>}
        </div>
      )}
    </>
  );
};
