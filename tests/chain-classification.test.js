import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'

const mihomoMain = new Function(
  readFileSync('sub-store/mihomo.js', 'utf8') + '\nreturn main'
)()
const template = readFileSync('sing-box/1.13.x/config.json', 'utf8')
const base = [
  ['普通', '普通A'],
  ['机场', '机场A'],
  ['机场', '机场B'],
  ['落地', '落地A'],
  ['落地', '落地B']
]

function mihomo (items) {
  globalThis.$arguments = {}
  return mihomoMain({
    proxies: items.map(([category, name]) => ({
      name: category ? `[${category}]${name}` : name,
      type: 'socks5', server: '192.0.2.1', port: 1080,
      ...(category === '落地' ? { 'dialer-proxy': '旧前置' } : {})
    }))
  })
}

async function singbox (items, args = {}) {
  globalThis.$arguments = { name: 'mock', ...args }
  globalThis.$content = template
  globalThis.produceArtifact = async () => ({
    outbounds: items.map(([category, name]) => ({
      tag: category ? `[${category}]${name}` : name,
      type: 'socks', server: '192.0.2.1', server_port: 1080,
      ...(category === '落地' ? { detour: '旧前置' } : {})
    }))
  })
  await import(`../sing-box/1.13.x/sub-store-template.js?case=${++singbox.index}`)
  return JSON.parse(globalThis.$content)
}
singbox.index = 0

test('mihomo: strict chain and independently selectable landings', () => {
  const config = mihomo(base)
  const groups = Object.fromEntries(config['proxy-groups'].map(group => [group.name, group]))
  expect(groups['🛫 机场前置'].proxies).toEqual(['机场A', '机场B'])
  expect(groups['🌐 全部节点'].proxies).toEqual(base.map(([, name]) => name))
  for (const name of ['📲 Telegram', '📹 YouTube']) {
    expect(groups[name].proxies).toContain('落地A')
    expect(groups[name].proxies).toContain('落地B')
  }
  for (const node of config.proxies) {
    expect(node.name).not.toMatch(/^\[(普通|机场|落地)\]/)
    if (node.name.startsWith('落地')) expect(node['dialer-proxy']).toBe('🛫 机场前置')
    else expect(node['dialer-proxy']).toBeUndefined()
  }
  expect(config.rules).toContain('RULE-SET,telegram_domain,📲 Telegram')
  expect(config.dns.enable).toBe(true)
})

test('sing-box: strict chain and independently selectable landings', async () => {
  const config = await singbox(base)
  const entries = Object.fromEntries(config.outbounds.map(item => [item.tag, item]))
  expect(entries['🛫 机场前置'].outbounds).toEqual(['机场A', '机场B'])
  expect(entries['🌐 全部节点'].outbounds).toEqual(base.map(([, name]) => name))
  for (const name of ['📲 Telegram', '📹 YouTube']) {
    expect(entries[name].outbounds).toContain('落地A')
    expect(entries[name].outbounds).toContain('落地B')
  }
  for (const [, name] of base) {
    expect(entries[name].detour).toBe(name.startsWith('落地') ? '🛫 机场前置' : undefined)
  }
  expect(config.route.rules.length).toBeGreaterThan(0)
  expect(config.dns).toBeDefined()
})

test('mihomo rejects missing airport, unmarked node, duplicate and group collision', () => {
  expect(() => mihomo([['落地', '落地A']])).toThrow('没有 [机场]')
  expect(() => mihomo([[null, '裸节点']])).toThrow('未分类')
  expect(() => mihomo([['普通', 'X'], ['机场', 'X']])).toThrow('X')
  expect(() => mihomo([['机场', '🛫 机场前置']])).toThrow('🛫 机场前置')
})

test('sing-box rejects missing airport, unmarked node, duplicate and group collision', async () => {
  await expect(singbox([['落地', '落地A']])).rejects.toThrow('没有 [机场]')
  await expect(singbox([[null, '裸节点']])).rejects.toThrow('未分类')
  await expect(singbox([['普通', 'X'], ['机场', 'X']])).rejects.toThrow('X')
  await expect(singbox([['机场', '🛫 机场前置']])).rejects.toThrow('🛫 机场前置')
})

test('sing-box broad dynamic rules cannot populate airport front with other nodes', async () => {
  const config = await singbox(base, { outbound: '🕳ℹ️.*🏷.*' })
  const front = config.outbounds.find(item => item.tag === '🛫 机场前置')
  expect(front.outbounds).toEqual(['机场A', '机场B'])
  expect(config.outbounds.find(item => item.tag === '🌐 全部节点').outbounds)
    .toEqual(base.map(([, name]) => name))
})
