import type { ShoppingList } from "@life-console/contracts";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { api } from "../../api";
import { EmptyState, Field, FormError, Panel } from "../../components/DesignSystem";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";

import { shoppingQuery, useShoppingMutation } from "./queries";

type ShoppingItem = ShoppingList["items"][number];
type ShoppingPlace = ShoppingList["places"][number];

type PurchaseChange = { readonly item: ShoppingItem; readonly purchased: boolean };
type ChangePurchase = (change: PurchaseChange) => void;

const ItemEditor = ({ item, places, close, changePurchase }: { readonly item: ShoppingItem; readonly places: ShoppingList["places"]; readonly close: () => void; readonly changePurchase: ChangePurchase }) => {
  const [name, setName] = useState(item.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rename = useShoppingMutation(() => api.updateShoppingItem(item.id, { name }), close);
  const link = useShoppingMutation(({ placeId, linked }: { readonly placeId: string; readonly linked: boolean }) => api.setShoppingPlace(item.id, placeId, linked));
  const remove = useShoppingMutation(() => api.deleteShoppingItem(item.id), close);
  const busy = useIsMutating({ mutationKey: ["shopping"] }) > 0;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          rename.mutate();
        }}
        className="space-y-2"
      >
        <Field label="品名を変更"><Input required maxLength={240} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></Field>
        <Button type="submit" size="sm" disabled={busy}>品名を保存</Button>
      </form>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">買える場所（複数可）</p>
        <div className="flex flex-wrap gap-2">
          {places.map((place) => <Button key={place.id} type="button" size="sm" variant={item.placeIds.includes(place.id) ? "default" : "outline"} aria-pressed={item.placeIds.includes(place.id)} disabled={busy} onClick={() => link.mutate({ placeId: place.id, linked: !item.placeIds.includes(place.id) })}>{place.name}</Button>)}
        </div>
        <p className="text-xs text-muted-foreground">どこかで買ったら、ほかの場所でも購入済みになります。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => changePurchase({ item, purchased: item.purchasedAt === null })}>{item.purchasedAt === null ? "購入済みにする" : "未購入に戻す"}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={close}>閉じる</Button>
        {!confirmDelete
          ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>削除</Button>
          : (
              <>
                <Button variant="destructive" size="sm" disabled={busy} onClick={() => remove.mutate()}>すべての場所から削除する</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDelete(false)}>やめる</Button>
              </>
            )}
      </div>
      {[rename.error, link.error, remove.error].map((error, index) => error !== null && <FormError key={index}>{error.message}</FormError>)}
    </div>
  );
};

const ShoppingRow = ({ item, places, changePurchase }: { readonly item: ShoppingItem; readonly places: ShoppingList["places"]; readonly changePurchase: ChangePurchase }) => {
  const search = useSearch({ from: "/todos" });
  const navigate = useNavigate({ from: "/todos" });
  const busy = useIsMutating({ mutationKey: ["shopping"] }) > 0;
  const gesture = useRef<{ pointerId: number; x: number; y: number; horizontal: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const action = item.purchasedAt === null ? "購入済みにする" : "未購入に戻す";
  const resetSwipe = () => {
    gesture.current = null;
    setOffset(0);
  };
  return (
    <li className="relative overflow-hidden border-t" aria-label={item.name}>
      <div aria-hidden="true" className="absolute inset-0 flex items-center bg-primary/15 px-3 text-sm font-medium text-foreground">
        {offset >= 96 ? "離して確定" : action}
      </div>
      <div
        className="relative touch-pan-y touch-pinch-zoom space-y-2 bg-card py-3"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(event) => {
          if (busy || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
          gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (start === null || start.pointerId !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!start.horizontal) {
            if (dx < -10 || (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx))) {
              resetSwipe();
              return;
            }
            if (dx < 10 || dx <= Math.abs(dy) * 1.5) return;
            start.horizontal = true;
          }
          setOffset(Math.min(Math.max(dx, 0), 140));
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          if (start?.pointerId !== event.pointerId) return;
          if (!busy && start.horizontal && event.clientX - start.x >= 96) changePurchase({ item, purchased: item.purchasedAt === null });
          resetSwipe();
        }}
        onPointerCancel={resetSwipe}
        onLostPointerCapture={resetSwipe}
      >
        <div className="flex min-h-11 items-center gap-3">
          <span className={`min-w-0 flex-1 select-none break-words text-sm ${item.purchasedAt !== null ? "text-muted-foreground line-through" : ""}`}>{item.name}</span>
          <Button variant="outline" size="sm" className="hidden shrink-0 [@media(any-pointer:fine)]:inline-flex" disabled={busy} aria-label={`${item.name}を${action}`} onClick={() => changePurchase({ item, purchased: item.purchasedAt === null })}>{action}</Button>
          <Button variant="ghost" size="sm" disabled={busy || (search.itemId !== undefined && search.itemId !== item.id)} onClick={() => { void navigate({ search: (previous) => ({ ...previous, itemId: item.id }), hash: "shopping-item-editor" }); }} aria-expanded={search.itemId === item.id} aria-label={`${item.name}の編集`}>編集</Button>
        </div>
        {item.placeIds.length > 1 && <p className="text-xs text-muted-foreground">{places.filter((place) => item.placeIds.includes(place.id)).map((place) => place.name).join("・")}</p>}
      </div>
    </li>
  );
};

const PlaceSection = ({ place, shopping, completed, changePurchase }: { readonly place: ShoppingPlace; readonly shopping: ShoppingList; readonly completed: boolean; readonly changePurchase: ChangePurchase }) => {
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false);
  const create = useShoppingMutation(() => api.createShoppingItem(place.id, name), () => setName(""));
  const rename = useShoppingMutation(() => api.renameShoppingPlace(place.id, editingName!), () => setEditingName(null));
  const link = useShoppingMutation((itemId: string) => api.setShoppingPlace(itemId, place.id, true));
  const items = shopping.items.filter((item) => item.placeIds.includes(place.id) && (item.purchasedAt !== null) === completed);
  const existing = shopping.items.filter((item) => !item.placeIds.includes(place.id) && item.purchasedAt === null);
  return (
    <section aria-label={place.name}>
      <Panel className="px-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="break-words font-semibold">
            {place.name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {items.length}
              {" "}
              件
            </span>
          </h3>
          <Button variant="ghost" size="sm" aria-label={`${place.name}の名前を変更`} onClick={() => setEditingName(place.name)}>名前を変更</Button>
        </div>
        {editingName !== null && (
          <form
            className="mb-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate();
            }}
          >
            <Field label="場所の名前"><Input required maxLength={240} value={editingName} disabled={rename.isPending} onChange={(event) => setEditingName(event.target.value)} /></Field>
            <Button type="submit" size="sm" disabled={rename.isPending}>保存</Button>
            <Button type="button" variant="ghost" size="sm" disabled={rename.isPending} onClick={() => setEditingName(null)}>やめる</Button>
            {rename.error !== null && <FormError>{rename.error.message}</FormError>}
          </form>
        )}
        {!completed && (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate();
              }}
              className="mb-2 flex items-end gap-2"
            >
              <Field label={`${place.name}で買うもの`} className="min-w-0 flex-1"><Input required maxLength={240} placeholder="品名を入力" value={name} disabled={create.isPending} onChange={(event) => setName(event.target.value)} /></Field>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "追加中…" : "追加"}</Button>
            </form>
            {create.error !== null && <FormError>{create.error.message}</FormError>}
            <Button variant="link" size="sm" aria-expanded={showExisting} onClick={() => setShowExisting(!showExisting)}>登録済みの品をここにも追加</Button>
            {showExisting && (
              <div className="my-3 space-y-2 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">同じ品を買える場所として追加します。</p>
                <div className="flex flex-wrap gap-2">{existing.map((item) => <Button key={item.id} variant="outline" size="sm" disabled={link.isPending} onClick={() => link.mutate(item.id)}>{item.name}</Button>)}</div>
                {existing.length === 0 && <p className="text-xs text-muted-foreground">追加できる未購入品はありません。</p>}
                {link.error !== null && <FormError>{link.error.message}</FormError>}
              </div>
            )}
          </>
        )}
        <ul>{items.map((item) => <ShoppingRow key={item.id} item={item} places={shopping.places} changePurchase={changePurchase} />)}</ul>
        {items.length === 0 && <p className="py-4 text-sm text-muted-foreground">{completed ? "購入済みの品はありません。" : "買うものはありません。"}</p>}
      </Panel>
    </section>
  );
};

export const ShoppingBoard = () => {
  const navigate = useNavigate({ from: "/todos" });
  const search = useSearch({ from: "/todos" });
  const query = useQuery(shoppingQuery);
  const [placeName, setPlaceName] = useState("");
  const createPlace = useShoppingMutation(() => api.createShoppingPlace(placeName), () => setPlaceName(""));
  const [undoChanges, setUndoChanges] = useState<PurchaseChange[]>([]);
  const purchase = useShoppingMutation((change: PurchaseChange & { readonly undo: boolean }) => api.updateShoppingItem(change.item.id, { purchased: change.purchased }), (change) => {
    setUndoChanges((previous) => change.undo ? previous.slice(0, previous.findLastIndex((entry) => entry.item.id === change.item.id)) : [...previous, change]);
  });
  const changePurchase: ChangePurchase = (change) => purchase.mutate({ ...change, undo: false });
  const undoChange = undoChanges.filter((change) => query.data?.items.some((item) => item.id === change.item.id)).at(-1);
  const busy = useIsMutating({ mutationKey: ["shopping"] }) > 0;
  if (query.isPending) return <p role="status">買い物を読み込んでいます。</p>;
  if (query.isError && query.data === undefined) return (
    <div className="space-y-2">
      <FormError>{query.error.message}</FormError>
      <Button variant="outline" onClick={() => { void query.refetch(); }}>再読み込み</Button>
    </div>
  );
  const shopping = query.data;
  const editingItem = shopping.items.find((item) => item.id === search.itemId);
  const unassigned = shopping.items.filter((item) => item.placeIds.length === 0 && (item.purchasedAt !== null) === (search.completed === true));
  return (
    <section aria-label="買い物" className="space-y-4">
      {query.isError && (
        <div className="space-y-2">
          <FormError>一覧の更新に失敗しました。前回の内容を表示しています。</FormError>
          <Button variant="outline" onClick={() => { void query.refetch(); }}>再読み込み</Button>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold">{search.completed ? "購入済み" : "買い物"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">行を右にスワイプして、離すと確定。編集からも購入状態を変更できます。</p>
      </div>
      {editingItem !== undefined && (
        <section id="shopping-item-editor" aria-label="買うものを編集" className="space-y-2">
          <h3 className="font-semibold">買うものを編集</h3>
          <ItemEditor changePurchase={changePurchase} key={editingItem.id} item={editingItem} places={shopping.places} close={() => { void navigate({ search: (previous) => ({ ...previous, itemId: undefined }) }); }} />
        </section>
      )}
      {search.itemId !== undefined && editingItem === undefined && (
        <div className="space-y-2">
          <FormError>買うものが見つかりません。</FormError>
          <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, itemId: undefined })} className={buttonVariants({ variant: "outline", size: "sm" })}>編集を閉じる</Link>
        </div>
      )}
      <nav aria-label="買う場所" className="flex flex-wrap gap-2">
        <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, placeId: undefined })} aria-current={search.placeId === undefined ? "page" : undefined} className={buttonVariants({ variant: search.placeId === undefined ? "default" : "outline", size: "sm" })}>すべての場所</Link>
        {shopping.places.map((place) => <Link key={place.id} from="/todos" to="/todos" search={(previous) => ({ ...previous, placeId: place.id })} aria-current={search.placeId === place.id ? "page" : undefined} className={buttonVariants({ variant: search.placeId === place.id ? "default" : "outline", size: "sm" })}>{place.name}</Link>)}
      </nav>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {shopping.places.map((place) => <div key={place.id} hidden={search.placeId !== undefined && search.placeId !== place.id}><PlaceSection place={place} shopping={shopping} completed={search.completed === true} changePurchase={changePurchase} /></div>)}
      </div>
      {search.placeId !== undefined && !shopping.places.some((place) => place.id === search.placeId) && <FormError>買う場所が見つかりません。『すべての場所』から開き直してください。</FormError>}
      {unassigned.length > 0 && (
        <Panel className="px-4">
          <h3 className="font-semibold">場所なし</h3>
          <p className="mt-1 text-xs text-muted-foreground">編集から、買える場所を付けられます。</p>
          <ul>{unassigned.map((item) => <ShoppingRow key={item.id} item={item} places={shopping.places} changePurchase={changePurchase} />)}</ul>
        </Panel>
      )}
      {shopping.places.length === 0 && <EmptyState>まず、買う場所を追加してください。</EmptyState>}
      <form
        className="flex max-w-lg items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          createPlace.mutate();
        }}
      >
        <Field label="買う場所を追加" className="min-w-0 flex-1"><Input required maxLength={240} placeholder="スーパー、薬局など" value={placeName} disabled={createPlace.isPending} onChange={(event) => setPlaceName(event.target.value)} /></Field>
        <Button type="submit" variant="outline" disabled={createPlace.isPending}>場所を追加</Button>
      </form>
      {purchase.isPending && <p role="status" className="text-sm text-muted-foreground">購入状態を保存しています。</p>}
      {purchase.error !== null && undoChange === undefined && <FormError>{purchase.error.message}</FormError>}
      {undoChange !== undefined && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-lg rounded-xl border bg-card p-3 shadow-lg md:bottom-6" aria-label="購入状態の取り消し">
          <p role="status" className="break-words text-sm">
            {undoChange.item.name}
            を
            {undoChange.purchased ? "購入済みにしました" : "未購入に戻しました"}
          </p>
          {purchase.error !== null && <FormError>{purchase.error.message}</FormError>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => purchase.mutate({ item: undoChange.item, purchased: !undoChange.purchased, undo: true })}>元に戻す</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUndoChanges([])}>閉じる</Button>
          </div>
        </div>
      )}
      {createPlace.error !== null && <FormError>{createPlace.error.message}</FormError>}
    </section>
  );
};
