# Project Notes

This repository stores proxy client configuration templates for mihomo and sing-box.

## Tooling

- Use `bun` for JavaScript-related commands.
- Use `uv` for Python-related commands.
- Do not use `npm`, `yarn`, `python`, `pip`, `venv`, or `virtualenv` unless explicitly requested.

## sing-box 1.13.x Notes

Target runtime currently tested successfully with sing-box `1.13.12`.

Primary files:

- `sing-box/1.13.x/config.json`
- `sing-box/1.13.x/sub-store-template.js`

### Runtime Command

Recommended Windows command from the sing-box runtime directory:

```powershell
.\sing-box.exe run -c config.json -D .
```

Use `-D .` so relative paths such as `work/cache.db` and `work/ui` resolve under the current runtime directory.

sing-box `1.13.12` does not support `--log-level` on the command line. Set log level in `config.json` instead:

```json
"log": {
  "disabled": false,
  "level": "debug",
  "timestamp": true
}
```

### Work Directory

Use relative runtime paths for cross-platform compatibility:

```json
"cache_file": {
  "enabled": true,
  "path": "work/cache.db"
}
```

```json
"clash_api": {
  "external_ui": "work/ui"
}
```

Do not use Linux-specific absolute paths such as `/etc/momo/run/cache.db` or `/etc/momo/run/ui` when the same config is intended for Windows and Android.

sing-box creates `cache.db`, but it may not create the parent `work/` directory. Keep `sing-box/1.13.x/work/.gitkeep` so the directory exists when copied.

### TUN Mode

Windows TUN mode requires administrator privileges. If this appears:

```text
configure tun interface: Access is denied.
```

Run PowerShell, Windows Terminal, GUI.for.SingBox, or any GUI wrapper as Administrator.

If bare core works but GUI.for.SingBox fails with the same TUN error, the GUI process is not running with sufficient privileges. It is not a config syntax issue.

Keep:

```json
"auto_route": true,
"strict_route": true
```

Avoid `auto_redirect` for this Windows/1.13.12 config. It caused:

```text
initialize auto-redirect: invalid argument
```

The current config removes `auto_redirect` and relies on TUN auto route, strict route, and DNS hijack.

### Mixed Port

The mixed inbound currently uses `127.0.0.1:7891` to avoid common `7890` conflicts with Clash/mihomo/other clients.

If this appears:

```text
listen tcp 127.0.0.1:7890: bind: Only one usage of each socket address is normally permitted
```

Either stop the process using the port or change `listen_port`.

### DNS Compatibility And Leak Prevention

sing-box `1.13.12` does not accept `strategy` inside individual DNS servers:

```text
dns.servers[1].strategy: json: unknown field "strategy"
```

Use global DNS strategy only:

```json
"dns": {
  "strategy": "prefer_ipv4"
}
```

Do not add `strategy` under each `dns.servers[]` entry for 1.13.12.

Direct DNS server detour to a direct outbound also caused startup failure:

```text
start dns/https[local]: detour to an empty direct outbound makes no sense
```

For local/direct DoH, omit `detour`. Keep detour only for remote/proxy DNS:

```json
{
  "tag": "remote",
  "type": "https",
  "server": "dns.google",
  "detour": "🚀 节点选择",
  "domain_resolver": "local-bootstrap"
}
```

Current DNS leak prevention relies on:

- TUN `strict_route: true`
- Route DNS hijack rule for `port: 53` and `protocol: dns`
- Local DNS for CN/domain rules
- Remote DNS over proxy for foreign/fallback DNS
- `reverse_mapping: true`
- Global `strategy: prefer_ipv4`

FakeIP is not mandatory for this config. The current approach is real-IP DNS split routing plus DNS hijack.

### Rule Set Cache

Remote rule sets such as `geosite-cn`, `geosite-google`, and `geoip-cn` are downloaded and cached by sing-box. With cache file enabled, the cached rule data is managed through `work/cache.db`; it is not expected to appear as separate `.srs` files next to the config.

If `work/cache.db` is deleted, rule sets will be downloaded again.

## Clash API And zashboard

zashboard is used through sing-box `experimental.clash_api`:

```json
"experimental": {
  "clash_api": {
    "external_controller": "0.0.0.0:9095",
    "external_ui": "work/ui",
    "external_ui_download_url": "https://gh-proxy.com/https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip",
    "external_ui_download_detour": "🎯 全球直连",
    "secret": "",
    "default_mode": "rule"
  }
}
```

zashboard connects to Clash API, not sing-box service API.

zashboard delay values under sing-box may be higher than mihomo because mihomo can use RTT/unified-delay style behavior while sing-box Clash API delay is closer to HTTP URL delay. This is a measurement difference, not necessarily worse real network performance.

The sing-box `urltest` outbound can use a lightweight 204 endpoint:

```json
"url": "https://www.gstatic.com/generate_204",
"interval": "10m",
"tolerance": 50
```

zashboard color thresholds are not configured through sing-box `clash_api`. If zashboard does not expose a UI setting for latency color thresholds, changing them requires using another panel or custom-building zashboard.

## Sub-Store Template Behavior

`sing-box/1.13.x/sub-store-template.js` reads Sub-Store output and injects node tags into selectors.

Required argument:

- `name`

Optional arguments:

- `type`
- `url`
- `includeUnsupportedProxy`
- `outbound`
- `policyNodes`

### Default Grouping

`outbound` is optional. If omitted, the script automatically injects nodes into:

- `🚀 节点选择`
- `🌐 全部节点`
- `🇭🇰 香港`
- `🇹🇼 台湾`
- `🇯🇵 日本`
- `🇸🇬 新加坡`
- `🇺🇸 美国`

The default all-node filter excludes subscription information nodes:

```regex
^(?!.*(套餐|重置|剩余|到期|订阅|群|账户|流量|有效期|时间|官网|失联|余额)).*$
```

### Policy Nodes Mode

`policyNodes` controls whether business policy groups directly display every single node.

Default:

```text
policyNodes=all
```

This makes policy groups such as `🍀 Google` and `📹 YouTube` display fixed groups plus all individual nodes.

Group-only mode:

```text
policyNodes=none
```

This keeps business policy groups limited to fixed choices:

```json
[
  "🚀 节点选择",
  "🌐 全部节点",
  "🇭🇰 香港",
  "🇹🇼 台湾",
  "🇯🇵 日本",
  "🇸🇬 新加坡",
  "🇺🇸 美国",
  "🎯 全球直连"
]
```

Accepted aliases:

- `policyNodes=all`, `true`, `1`, `yes`, `on`
- `policyNodes=none`, `false`, `0`, `no`, `off`

Invalid values should fail fast.

## sing-box 1.14+ Service API Notes

sing-box `service/api` is available since sing-box `1.14.0`.

It is a sing-box native gRPC/gRPC-Web API for observing and controlling a running sing-box instance:

```json
{
  "services": [
    {
      "type": "api",
      "tag": "api",
      "listen": "127.0.0.1",
      "listen_port": 9096,
      "secret": ""
    }
  ]
}
```

Do not add this to the 1.13.12 config; it is a 1.14+ feature.

Important distinction:

- zashboard currently uses Clash API.
- sing-box service API is not a drop-in replacement for Clash API.
- zashboard documentation refers to the Clash API host/port/secret.
- Some service API connection tracking and Clash mode methods still require Clash API to be configured, otherwise they may return `UNIMPLEMENTED`.

When migrating to sing-box 1.14+, consider enabling service API only as an additional API for clients that explicitly support sing-box gRPC/gRPC-Web. Keep `experimental.clash_api` if zashboard is still used for visual node switching.

## Validation Checklist

Before considering config changes complete:

1. Validate JSON syntax.
2. Run `bun --check sing-box/1.13.x/sub-store-template.js` after script edits.
3. Run sing-box config check with the target core version.
4. Run the core from the intended working directory with `-D .`.
5. For TUN on Windows, test from an elevated terminal.
