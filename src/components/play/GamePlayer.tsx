"use client";
import { CrashGame } from "./Crash";
import { DiceGame } from "./Dice";
import { LimboGame } from "./Limbo";
import { MinesGame } from "./Mines";
import { PlinkoGame } from "./Plinko";
import { RouletteGame } from "./Roulette";
import type { GameConfig } from "./kit";
import { AtlasGame } from "./slots/Atlas";
import { CoinflipGame } from "./Coinflip";
import { HiloGame } from "./Hilo";
import { KenoGame } from "./Keno";
import { TowerGame } from "./Tower";
import { WheelGame } from "./Wheel";
import { NeonGame } from "./slots/Neon";
import { WorkshopGame } from "./slots/Workshop";

export function GamePlayer({ cfg }: { cfg: GameConfig }) {
  switch (cfg.slug) {
    case "atlas": return <AtlasGame cfg={cfg} />;
    case "neon-garden": return <NeonGame cfg={cfg} />;
    case "workshop": return <WorkshopGame cfg={cfg} />;
    case "crash": return <CrashGame cfg={cfg} />;
    case "tower": return <TowerGame cfg={cfg} />;
    case "hilo": return <HiloGame cfg={cfg} />;
    case "wheel": return <WheelGame cfg={cfg} />;
    case "keno": return <KenoGame cfg={cfg} />;
    case "coinflip": return <CoinflipGame cfg={cfg} />;
    case "mines": return <MinesGame cfg={cfg} />;
    case "dice": return <DiceGame cfg={cfg} />;
    case "plinko": return <PlinkoGame cfg={cfg} />;
    case "limbo": return <LimboGame cfg={cfg} />;
    case "roulette": return <RouletteGame cfg={cfg} />;
  }
}
