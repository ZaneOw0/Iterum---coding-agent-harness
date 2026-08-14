import { CredentialStore, maskKey } from "@iterum/core/credentials/store"
import { VENDORS } from "@iterum/core/llm/vendors"

export async function runConnect(argv: string[]): Promise<number> {
  const provider = argv[0] as string
  if (!VENDORS[provider]) return 2
  const store = new CredentialStore()

  if (argv.includes("--set")) {
    const key = argv.includes("--from-stdin") ? argv[argv.indexOf("--from-stdin") + 1] : await hiddenPrompt(`Enter ${provider} API key: `)
    if (!key) { console.error("no key provided"); return 1 }
    await store.set(provider, key)
    console.log(`Stored ${provider} key (${maskKey(key)})`)
    return 0
  }
  if (argv.includes("--clear")) {
    await store.remove(provider)
    console.log(`Cleared ${provider} key`)
    return 0
  }
  // --show（默认）：掩码 + 来源，绝不回显明文
  const cred = await store.get(provider)
  if (cred) console.log(`${provider}: ${maskKey(cred.key)} (source: ${cred.source})`)
  else console.log(`${provider}: (unset)`)
  return 0
}

async function hiddenPrompt(label: string): Promise<string> {
  // 交互终端隐藏输入：setRawMode + 手动回显 '*'；非 TTY（管道）时退化为空并报错
  if (!process.stdin.isTTY) { console.error("interactive hidden input requires a TTY; use --from-stdin <key> for scripts"); return "" }
  return new Promise(resolve => {
    process.stdout.write(label)
    process.stdin.setRawMode(true)
    let buf = ""
    const onData = (chunk: Buffer) => {
      for (const ch of chunk) {
        const c = String.fromCharCode(ch)
        if (c === "\r" || c === "\n") { process.stdout.write("\n"); cleanup(); resolve(buf) }
        else if (c === "\u0003") { process.stdout.write("^C\n"); cleanup(); resolve("") }
        else if (c === "\u007f" || c === "\b") { buf = buf.slice(0, -1) }
        else { buf += c; process.stdout.write("*") }
      }
    }
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.off("data", onData) }
    process.stdin.on("data", onData)
  })
}
