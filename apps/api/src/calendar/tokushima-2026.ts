import type { CollectionSettings } from "@life-console/contracts";

export const collectionPeriod = { validFrom: "2026-04-01", validThrough: "2027-03-31", sourceUrl: "https://www.city.tokushima.tokushima.jp/kurashi/recycle/gomi/R08gomischedule.html" } as const;
const categories = ["burnable", "nonburnable", "plastic", "cans", "pet", "paper"] as const;
type Category = typeof categories[number];
const titles: Record<Category, string> = { burnable: "燃やすしかないごみ", nonburnable: "燃やせないごみ", plastic: "プラマーク", cans: "缶・びん", pet: "ペットボトル", paper: "古紙類" };
// 隔週・4 週周期を曜日から推測せず、公式の月別表の実日付を保持する。
const monthlyDates = {
  C: {
    nonburnable: [[1, 29], [27], [24], [22], [19], [16], [14], [11], [9], [6], [3], [3, 31]],
    plastic: [[8, 22], [6, 20], [3, 17], [1, 15, 29], [12, 26], [9, 23], [7, 21], [4, 18], [2, 16, 30], [13, 27], [10, 24], [10, 24]],
    cans: [[9], [7], [4], [2, 30], [27], [24], [22], [19], [17], [21], [18], [18]],
    pet: [[6, 20], [4, 18], [1, 15, 29], [13, 27], [10, 24], [7, 21], [5, 19], [2, 16, 30], [14, 28], [11, 25], [8, 22], [8, 22]],
    paper: [[23], [21], [18], [16], [13], [10], [8], [5], [3], [7], [4], [4]],
  },
  D: {
    nonburnable: [[15], [13], [10], [8], [5], [2, 30], [28], [25], [23], [20], [17], [17]],
    plastic: [[8, 22], [6, 20], [3, 17], [1, 15, 29], [12, 26], [9, 23], [7, 21], [4, 18], [2, 16, 30], [13, 27], [10, 24], [10, 24]],
    cans: [[16], [14], [11], [9], [6], [3], [1, 29], [26], [24], [28], [25], [25]],
    pet: [[13, 27], [11, 25], [8, 22], [6, 20], [3, 17, 31], [14, 28], [12, 26], [9, 23], [7, 21], [4, 18], [1, 15], [1, 15, 29]],
    paper: [[2, 30], [28], [25], [23], [20], [17], [15], [12], [10], [14], [11], [11]],
  },
} satisfies Record<CollectionSettings["district"], Record<Exclude<Category, "burnable">, number[][]>>;

type OfficialCollectionEvent = { readonly id: string; readonly sourceKey: string; readonly calendarKey: string; readonly title: string; readonly date: string; readonly notes: string; readonly sourceUrl: string };
export const tokushimaCollections = (district: CollectionSettings["district"]): ReadonlyArray<OfficialCollectionEvent> => {
  const calendarKey = `tokushima-2026-${district}`;
  const event = (category: Category, date: string): OfficialCollectionEvent => ({
    id: `${calendarKey}-${category}-${date}`, sourceKey: `${calendarKey}-${category}-${date}`, calendarKey,
    title: titles[category], date,
    notes: "収集日の午前 8 時 30 分までに指定の場所へ出してください。建物のごみ置き場の案内も確認してください。",
    sourceUrl: collectionPeriod.sourceUrl,
  });
  const events: OfficialCollectionEvent[] = [];
  for (let day = Date.parse(collectionPeriod.validFrom); day <= Date.parse(collectionPeriod.validThrough); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const weekday = new Date(day).getUTCDay();
    // 公式の日程は火・金（祝日も収集）、1 月 1〜3 日だけ休止する。
    if ((weekday === 2 || weekday === 5) && !(date >= "2027-01-01" && date <= "2027-01-03")) events.push(event("burnable", date));
  }
  for (const category of categories.filter((item) => item !== "burnable")) {
    monthlyDates[district][category].forEach((days, index) => {
      const month = (index + 3) % 12 + 1;
      const year = month >= 4 ? 2026 : 2027;
      for (const day of days) events.push(event(category, `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`));
    });
  }
  return events.toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
};
