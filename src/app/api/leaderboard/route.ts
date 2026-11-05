import { route } from "@/server/http";
import { BOARDS, isBoard, leaderboard } from "@/server/progress/leaderboard";
import { currentTournament, tournamentHistory } from "@/server/promo/service";

/** Рейтинги: турнир недели (по умолчанию) или общий рейтинг по выбранной метрике. Обновляется раз в минуту. */
export const GET = route({ rate: { key: "lb", limit: 120, window: 60 } }, async ({ req, user }) => {
  const b = req.nextUrl.searchParams.get("board") ?? "tournament";
  if (b === "tournament") {
    const [t, history] = await Promise.all([currentTournament(), tournamentHistory()]);
    const meRow = user ? t.top.find((r) => r.userId === user.id) : undefined;
    return {
      board: "tournament", boards: BOARDS,
      tournament: { week: t.week, title: t.title, enabled: t.enabled, minBet: t.minBet, startsAt: t.startsAt, endsAt: t.endsAt, prizes: t.prizes, rows: t.top.map(({ userId: _u, ...r }) => r), myPlace: meRow?.place ?? null },
      history,
    };
  }
  if (!isBoard(b)) return { board: null, boards: BOARDS, rows: [] };
  const rows = (await leaderboard(b)) as { uid: string; place: number }[];
  return { board: b, boards: BOARDS, rows: rows.map(({ uid, ...r }) => ({ ...r, isMe: !!user && uid === user.id })), myPlace: user ? rows.find((r) => r.uid === user.id)?.place ?? null : null };
});
