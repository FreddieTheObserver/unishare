/**
 * Default avatar for people without a picture: a gradient picked from their name, so the same
 * person gets the same colours everywhere. uniauth's account page uses the same palette and hash
 * (apps/web/src/lib/avatar.ts there), so someone looks alike in every app.
 */
const PAIRS: [string, string][] = [
  ['#f59e0b', '#d97706'],
  ['#fb923c', '#ea580c'],
  ['#38bdf8', '#0369a1'],
  ['#4ade80', '#15803d'],
  ['#a78bfa', '#6d28d9'],
  ['#2dd4bf', '#0f766e'],
  ['#f472b6', '#be185d'],
  ['#facc15', '#ca8a04'],
]

function hash(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function avatarGradient(name: string) {
  const [from, to] = PAIRS[hash(name.trim().toLowerCase()) % PAIRS.length]!
  return `linear-gradient(135deg, ${from}, ${to})`
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
