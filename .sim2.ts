import { playAvalanche, playSalute, playCrystal } from "./src/lib/fair/slots2";
const N = Number(process.argv[2] ?? 100000), NB = Number(process.argv[3] ?? 5000);
const games = { avalanche: playAvalanche, salute: playSalute, crystal: playCrystal } as const;
const only = process.argv[4];
for (const [name, play] of Object.entries(games)) {
  if (only && only !== name) continue;
  let tot = 0, bonus = 0, bonusTot = 0, max = 0, hits = 0, baseOnly = 0;
  for (let i = 0; i < N; i++) {
    const r = play(Math.random) as { totalMult: number; fs: unknown; base: { mult: number } | null };
    tot += r.totalMult; if (r.totalMult > 0) hits++; if (r.totalMult > max) max = r.totalMult; baseOnly += r.base!.mult;
    if (r.fs) { bonus++; bonusTot += r.totalMult - r.base!.mult; }
  }
  let buyTot = 0; let buyMax = 0;
  for (let i = 0; i < NB; i++) { const r = play(Math.random, { buy: true }) as { totalMult: number }; buyTot += r.totalMult; buyMax = Math.max(buyMax, r.totalMult); }
  console.log(`${name.padEnd(10)} RTP ${(tot / N * 100).toFixed(2)}%  base ${(baseOnly / N * 100).toFixed(1)}%  hit ${(hits / N * 100).toFixed(1)}%  bonus 1/${Math.round(N / Math.max(bonus, 1))} avgBonus ${(bonusTot / Math.max(bonus, 1)).toFixed(1)}x  max ${max.toFixed(0)}x | buy avg ${(buyTot / NB).toFixed(1)}x max ${buyMax.toFixed(0)}x`);
}
