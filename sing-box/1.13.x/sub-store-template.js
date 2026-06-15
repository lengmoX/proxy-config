// Sub-Store sing-box template script.
// Usage arguments:
// name=one
// type=本地订阅
// policyNodes=all|none, optional. Default all: append all nodes to policy selectors; none: keep policy selectors group-only.
// outbound is optional. If omitted, nodes are automatically grouped into common region selectors.

const DEFAULT_NODE_FILTER_SOURCE = "^(?!.*(套餐|重置|剩余|到期|订阅|群|账户|流量|有效期|时间|官网|失联|余额)).*$";
const DEFAULT_OUTBOUND = `🕳ℹ️🚀 节点选择🏷${DEFAULT_NODE_FILTER_SOURCE}🕳ℹ️🌐 全部节点🏷${DEFAULT_NODE_FILTER_SOURCE}🕳ℹ️🇭🇰 香港🏷ℹ️香港|港|hk|hong ?kong|🇭🇰🕳ℹ️🇹🇼 台湾🏷ℹ️台湾|台|tw|taiwan|🇹🇼🕳ℹ️🇯🇵 日本🏷ℹ️日本|日|jp|japan|🇯🇵🕳ℹ️🇸🇬 新加坡🏷ℹ️新加坡|新|sg|singapore|🇸🇬🕳ℹ️🇺🇸 美国🏷ℹ️美国|美|us|usa|united ?states|america|🇺🇸`;
const DEFAULT_NODE_FILTER = new RegExp(DEFAULT_NODE_FILTER_SOURCE);
const DEFAULT_INCLUDE_ALL_SELECTORS = /^(🤖 AI|📹 YouTube|🍀 Google|👨‍💻 Github|📲 Telegram|🎵 TikTok|🎥 Netflix|💶 PayPal|🎮 Steam|🪟 Microsoft|🐬 OneDrive|🍏 Apple|🐠 漏网之鱼)$/;

async function renderSingBoxTemplate() {
  log("start");

  let { type, name, outbound, includeUnsupportedProxy, url, policyNodes } = typeof $arguments !== "undefined" ? $arguments : {};
  if (!name) throw new Error("missing argument: name");
  policyNodes = normalizePolicyNodes(policyNodes);
  if (!outbound) {
    outbound = DEFAULT_OUTBOUND;
    log("missing argument: outbound, use default region grouping rules");
  }

  type = /^1$|col|组合/i.test(type) ? "collection" : "subscription";

  const parser = (typeof ProxyUtils !== "undefined" && ProxyUtils.JSON5) || JSON;
  const content = typeof $content !== "undefined" && $content ? $content : getFirstFileContent();
  if (!content) throw new Error("missing template content: set config.json as file/template content");

  let config;
  try {
    config = parser.parse(content);
  } catch (error) {
    throw new Error(`config is not valid JSON/JSON5: ${error.message || error}`);
  }

  const data = await loadSingBoxArtifact({ type, name, includeUnsupportedProxy, url });
  const outbounds = Array.isArray(data.outbounds) ? data.outbounds : [];
  const endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
  const proxies = [...outbounds, ...endpoints];
  log(`loaded ${outbounds.length} outbounds, ${endpoints.length} endpoints`);

  const outboundRules = parseOutboundRules(outbound);
  config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];

  for (const outboundItem of config.outbounds) {
    if (!outboundItem || typeof outboundItem !== "object") continue;

    for (const [outboundRegex, tagRegex] of outboundRules) {
      if (!outboundRegex.test(outboundItem.tag || "")) continue;
      outboundItem.outbounds = Array.isArray(outboundItem.outbounds) ? outboundItem.outbounds : [];

      const tags = getTags(proxies, tagRegex);
      log(`${outboundItem.tag} <= ${tags.length} node(s)`);
      outboundItem.outbounds.push(...tags);
      outboundItem.outbounds = unique(outboundItem.outbounds);
    }
  }

  if (policyNodes === "all") {
    appendAllNodesToPolicyGroups(config, getTags(proxies, DEFAULT_NODE_FILTER));
  } else {
    log("policyNodes=none, keep policy selectors group-only");
  }

  ensureNonEmptyMatchedOutbounds(config, outboundRules);

  config.outbounds.push(...outbounds);
  if (endpoints.length > 0) {
    config.endpoints = Array.isArray(config.endpoints) ? config.endpoints : [];
    config.endpoints.push(...endpoints);
  }

  $content = JSON.stringify(config, null, 2);
  log("done");
}

async function loadSingBoxArtifact({ type, name, includeUnsupportedProxy, url }) {
  if (typeof produceArtifact !== "function") throw new Error("produceArtifact is not available in current Sub-Store context");

  const options = {
    name,
    type,
    platform: "sing-box",
    produceOpts: {
      "include-unsupported-proxy": includeUnsupportedProxy,
      includeUnsupportedProxy,
    },
  };

  if (url) {
    options.subscription = {
      name,
      url,
      source: "remote",
    };
  }

  const artifact = await produceArtifact(options);
  if (typeof artifact === "string") return JSON.parse(artifact);
  return artifact || {};
}

function parseOutboundRules(outbound) {
  return String(outbound)
    .split("🕳")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [outboundPattern, tagPattern = ".*"] = item.split("🏷");
      const outboundRegex = createMarkedRegExp(outboundPattern);
      const tagRegex = createMarkedRegExp(tagPattern);
      log(`rule ${outboundRegex} <= ${tagRegex}`);
      return [outboundRegex, tagRegex];
    });
}

function ensureNonEmptyMatchedOutbounds(config, outboundRules) {
  let compatibleCreated = false;
  const compatibleTag = "COMPATIBLE";

  for (const outboundItem of config.outbounds) {
    if (!outboundItem || typeof outboundItem !== "object") continue;

    const matched = outboundRules.some(([outboundRegex]) => outboundRegex.test(outboundItem.tag || ""));
    if (!matched) continue;

    outboundItem.outbounds = Array.isArray(outboundItem.outbounds) ? outboundItem.outbounds : [];
    if (outboundItem.outbounds.length > 0) continue;

    if (!compatibleCreated) {
      config.outbounds.push({ tag: compatibleTag, type: "direct" });
      compatibleCreated = true;
    }
    outboundItem.outbounds.push(compatibleTag);
    log(`${outboundItem.tag} has no matched nodes, use ${compatibleTag}`);
  }
}

function appendAllNodesToPolicyGroups(config, tags) {
  if (tags.length === 0) return;

  for (const outboundItem of config.outbounds) {
    if (!outboundItem || outboundItem.type !== "selector") continue;
    if (!DEFAULT_INCLUDE_ALL_SELECTORS.test(outboundItem.tag || "")) continue;

    outboundItem.outbounds = Array.isArray(outboundItem.outbounds) ? outboundItem.outbounds : [];
    outboundItem.outbounds.push(...tags);
    outboundItem.outbounds = unique(outboundItem.outbounds);
    log(`${outboundItem.tag} <= ${tags.length} direct selectable node(s)`);
  }
}

function normalizePolicyNodes(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  if (["all", "true", "1", "yes", "on"].includes(normalized)) return "all";
  if (["none", "false", "0", "no", "off"].includes(normalized)) return "none";
  throw new Error("invalid argument: policyNodes must be all or none");
}

function getTags(proxies, regex) {
  return proxies.filter((proxy) => proxy && regex.test(proxy.tag || "")).map((proxy) => proxy.tag);
}

function createMarkedRegExp(pattern) {
  const source = String(pattern).replace("ℹ️", "");
  const flags = String(pattern).includes("ℹ️") ? "i" : undefined;
  return new RegExp(source, flags);
}

function getFirstFileContent() {
  if (typeof $files === "undefined" || !$files) return undefined;
  if (Array.isArray($files)) {
    const file = $files[0];
    return typeof file === "string" ? file : file && file.content;
  }
  const first = Object.values($files)[0];
  return typeof first === "string" ? first : first && first.content;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function log(value) {
  console.log(`[sing-box-template] ${value}`);
}

if (typeof $arguments !== "undefined") {
  await renderSingBoxTemplate();
}

if (typeof module !== "undefined") {
  module.exports = { renderSingBoxTemplate, parseOutboundRules };
}
