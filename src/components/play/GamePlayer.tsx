"use client";
import { CrashGame } from "./Crash";
import { DiceGame } from "./Dice";
import { LimboGame } from "./Limbo";
import { MinesGame } from "./Mines";
import { PlinkoGame } from "./Plinko";
import { RouletteGame } from "./Roulette";
import type { GameConfig } from "./kit";

export function GamePlayer({ cfg }: { cfg: GameConfig }) {
  switch (cfg.slug) {
    case "crash": return <CrashGame cfg={cfg} />;
    case "mines": return <MinesGame cfg={cfg} />;
    case "dice": return <DiceGame cfg={cfg} />;
    case "plinko": return <PlinkoGame cfg={cfg} />;
    case "limbo": return <LimboGame cfg={cfg} />;
    case "roulette": return <RouletteGame cfg={cfg} />;
  }
}
