// localStorage tracking for Uniswap V4 positions created via Monatrix
// Key: 'monatrix_v4_143_{wallet}' → JSON array of tokenId strings
//
// Why localStorage: Monad has 70M+ blocks with 999-block getLogs limit →
// full historical scan is infeasible. We save tokenIds at deposit time.

const storageKey = (wallet: string) => `monatrix_v4_143_${wallet.toLowerCase()}`

export function saveV4TokenId(wallet: string, tokenId: bigint): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadV4TokenIds(wallet)
    const idStr = tokenId.toString()
    console.log('[V4] saveV4TokenId called:', { wallet: wallet.toLowerCase(), tokenId: idStr, existing })
    if (!existing.includes(idStr)) {
      localStorage.setItem(storageKey(wallet), JSON.stringify([...existing, idStr]))
      console.log('[V4] Saved tokenId', idStr, 'for', wallet.toLowerCase())
    } else {
      console.log('[V4] tokenId', idStr, 'already saved')
    }
  } catch (e) { console.error('[V4] saveV4TokenId error:', e) }
}

export function loadV4TokenIds(wallet: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(storageKey(wallet)) ?? '[]')
  } catch { return [] }
}
