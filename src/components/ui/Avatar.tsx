// Встроенные аватары: градиент + геометрический знак. Ключи хранятся в User.avatar.
export const AVATARS = {
  orbit: ["#00c47a", "#0e6b4a"], prism: ["#6e7bff", "#2b2f86"], wave: ["#22b8cf", "#0b4f5c"],
  ember: ["#ff8a3d", "#7a2c0b"], grid: ["#c3cbd0", "#3a4247"], bolt: ["#f5d44a", "#7a5a05"],
} as const;
export type AvatarKey = keyof typeof AVATARS;

export function Avatar({ name, avatar, size = 36 }: { name: string; avatar: string; size?: number }) {
  const [a, b] = AVATARS[(avatar in AVATARS ? avatar : "orbit") as AvatarKey];
  return (
    <span className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, ${a}, ${b})`, fontSize: size * 0.4 }} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
