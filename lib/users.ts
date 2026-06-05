const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomString(length: number) {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * ALPHANUMERIC.length);
    result += ALPHANUMERIC[index];
  }
  return result;
}

export function generateTempPassword() {
  return randomString(12);
}

export function deriveNamesFromEmail(email: string) {
  const local = email.split("@")[0] ?? "user";
  const parts = local
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const first = parts[0] ?? "New";
  const last = parts.slice(1).join(" ") || "User";

  const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

  return {
    firstName: capitalize(first),
    lastName: capitalize(last),
  };
}

export function usernameFromEmail(email: string) {
  const local = (email.split("@")[0] ?? "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 10);
  return local || "user";
}
