import { createAvatar } from "@dicebear/core";
import { adventurer, micah, personas } from "@dicebear/collection";

/** Bump when avatar rules change — busts browser cache and regenerates faces. */
export const USER_AVATAR_VERSION = "male-v2";

/** Pastel circle backgrounds (clay-style reference palette). */
const BACKGROUND_COLORS = [
  "fde68a",
  "fbcfe8",
  "bfdbfe",
  "fef3c7",
  "bbf7d0",
  "fed7aa",
  "e9d5ff",
  "a5f3fc",
] as const;

/** Adventurer: short cuts only (no long feminine styles). */
const ADVENTURER_MALE_HAIR = [
  "short16",
  "short15",
  "short14",
  "short13",
  "short12",
  "short11",
  "short10",
  "short09",
  "short08",
  "short07",
  "short06",
  "short05",
  "short04",
  "short03",
  "short02",
  "short01",
] as const;

/** Personas: masculine-presenting hair only. */
const PERSONAS_MALE_HAIR = [
  "buzzcut",
  "balding",
  "bald",
  "cap",
  "fade",
  "beanie",
  "shortCombover",
  "shortComboverChops",
  "mohawk",
  "curlyHighTop",
  "sideShave",
  "bunUndercut",
] as const;

/** Micah: exclude pixie; prefer facial hair. */
const MICAH_MALE_HAIR = [
  "fonze",
  "mrT",
  "dougFunny",
  "mrClean",
  "dannyPhantom",
  "full",
  "turban",
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export type UserAvatarOptions = {
  /** Stable id (e.g. UserID) — same seed always yields the same avatar. */
  seed: string;
  size?: number;
};

/**
 * Deterministic clay-style illustrated avatar (DiceBear), male-presenting only.
 * @see https://www.dicebear.com/styles/
 */
function avatarSeed(seed: string): string {
  const id = seed.trim() || "user";
  return `${id}|${USER_AVATAR_VERSION}`;
}

export function createUserAvatarSvg({ seed, size = 80 }: UserAvatarOptions): string {
  const effectiveSeed = avatarSeed(seed);
  const h = hashString(effectiveSeed);
  const backgroundColor = BACKGROUND_COLORS[h % BACKGROUND_COLORS.length];
  const base = {
    seed: effectiveSeed,
    size,
    backgroundColor: [backgroundColor],
    radius: 50,
  };

  switch (h % 3) {
    case 0:
      return createAvatar(personas, {
        ...base,
        hair: [...PERSONAS_MALE_HAIR],
        facialHair: ["beardMustache", "walrus", "goatee", "pyramid", "shadow"],
        facialHairProbability: 100,
      }).toString();
    case 1:
      return createAvatar(micah, {
        ...base,
        hair: [...MICAH_MALE_HAIR],
        facialHair: ["beard", "scruff"],
        facialHairProbability: 100,
      }).toString();
    default:
      return createAvatar(adventurer, {
        ...base,
        hair: [...ADVENTURER_MALE_HAIR],
        features: ["mustache"],
        featuresProbability: 65,
        earringsProbability: 0,
      }).toString();
  }
}

export function userAvatarApiPath(seed: string, size: number): string {
  const params = new URLSearchParams({
    seed,
    size: String(Math.min(256, Math.max(32, size))),
    v: USER_AVATAR_VERSION,
  });
  return `/api/users/avatar?${params.toString()}`;
}
