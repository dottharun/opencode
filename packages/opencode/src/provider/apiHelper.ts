import { Log } from "../util/log"

export namespace ApiHelper {
  const log = Log.create({ service: "apihelper" })
  const DEFAULT_INTERVAL = 60000  // 1 minute

  interface CachedKey {
    key: string
    timestamp: number
  }

  const cache = new Map<string, CachedKey>()

  export async function getKey(
    command: string,
    interval: number | undefined,
    providerID: string
  ): Promise<string | undefined> {

    const ttl = interval ?? DEFAULT_INTERVAL
    const cached = cache.get(providerID)
    const now = Date.now()

    // Return cached key if still valid
    if (cached && (now - cached.timestamp) < ttl) {
      log.debug("returning cached key", { cached, now })
      return cached.key
    }

    // Try to fetch new key
    try {
      const result = Bun.spawn(["sh", "-c", command], {
        stdout: "pipe",
        stderr: "inherit",
      })

      const code = await result.exited
      if (code !== 0) {
        const stderr = await new Response(result.stderr).text()
        log.error("apihelper failed", { providerID, code, stderr })
        return cached?.key  // Return stale cache
      }

      const key = (await new Response(result.stdout).text()).trim()
      if (key) {
        cache.set(providerID, { key, timestamp: now })
        log.debug("returning fresh key", { cache, key })
        return key
      }
    } catch (e) {
      log.error("apihelper error", { providerID, error: e })
    }

    return cached?.key  // Return stale cache if binary failed
  }

  export function invalidate(providerID: string): void {
    cache.delete(providerID)
  }
}
