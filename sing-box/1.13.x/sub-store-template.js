// Sub-Store sing-box template script.
// Usage arguments:
// name=one
// type=本地订阅
// policyNodes=all|none, optional. Default none: all appends all nodes to policy selectors; none keeps policy selectors group-only.
// landing=true|false, optional. Default false: enable landing/front-proxy groups and add detour to landing nodes.
// chainFilter is optional. If landing=true, it overrides the default landing node regex.
// embyRuleUrl is optional: direct URL of a sing-box source JSON rule-set. Omitted: group only.
// outbound is optional. If omitted, nodes are automatically grouped into common region selectors.

const DEFAULT_NODE_FILTER_SOURCE = "^(?!.*(套餐|重置|剩余|到期|订阅|群|账户|流量|有效期|时间|官网|失联|余额)).*$";
const DEFAULT_OUTBOUND = `🕳ℹ️🚀 节点选择🏷${DEFAULT_NODE_FILTER_SOURCE}🕳ℹ️🌐 全部节点🏷${DEFAULT_NODE_FILTER_SOURCE}🕳ℹ️🇭🇰 香港🏷ℹ️香港|港|hk|hong ?kong|🇭🇰🕳ℹ️🇹🇼 台湾🏷ℹ️台湾|台|tw|taiwan|🇹🇼🕳ℹ️🇯🇵 日本🏷ℹ️日本|日|jp|japan|🇯🇵🕳ℹ️🇸🇬 新加坡🏷ℹ️新加坡|新|sg|singapore|🇸🇬🕳ℹ️🇺🇸 美国🏷ℹ️美国|美|us|usa|united ?states|america|🇺🇸`;
const DEFAULT_NODE_FILTER = new RegExp(DEFAULT_NODE_FILTER_SOURCE);
const DEFAULT_INCLUDE_ALL_SELECTORS = /^(🤖 AI|📲 Telegram|🎬 Emby|📹 YouTube|🍀 Google|👨‍💻 Github|🎵 TikTok|🎥 Netflix|💶 PayPal|💱 交易所|🎮 Steam|🪟 Microsoft|🐬 OneDrive|🍏 Apple|🐠 漏网之鱼)$/;
const POLICY_GROUP_CHOICES = ["🚀 节点选择", "🌐 全部节点", "🇭🇰 香港", "🇹🇼 台湾", "🇯🇵 日本", "🇸🇬 新加坡", "🇺🇸 美国", "🎯 全球直连"];
const FRONT_PROXY_GROUP = "🔗 前置代理";
const LANDING_GROUP = "🛬 落地节点";
const EMBY_GROUP = "🎬 Emby";
const EMBY_RULE_SET = "emby";
const EXCHANGE_GROUP = "💱 交易所";
const EXCHANGE_RULE_SET = "geosite-cryptocurrency";
const EXCHANGE_RULE_SET_URL = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/category-cryptocurrency.srs";
const DEFAULT_LANDING_FILTER_SOURCE = "家宽|家庭宽带|商宽|商业宽带|星链|Starlink|落地|Minor";
const REGION_RULES = [
  { name: "🇭🇰 香港", flags: ["🇭🇰"], keywords: [/香港/i, /港/i, /\bHK\b/i, /Hong\s*Kong/i, /HongKong/i] },
  { name: "🇹🇼 台湾", flags: ["🇹🇼"], keywords: [/台湾/i, /台灣/i, /臺灣/i, /台/i, /\bTW\b/i, /Taiwan/i] },
  { name: "🇯🇵 日本", flags: ["🇯🇵"], keywords: [/日本/i, /东京/i, /大阪/i, /日/i, /\bJP\b/i, /Japan/i] },
  { name: "🇸🇬 新加坡", flags: ["🇸🇬"], keywords: [/新加坡/i, /狮城/i, /坡/i, /\bSG\b/i, /Singapore/i] },
  { name: "🇺🇸 美国", flags: ["🇺🇸"], keywords: [/美国/i, /洛杉矶/i, /硅谷/i, /西雅图/i, /美/i, /\bUS\b/i, /\bUSA\b/i, /States/i, /America/i, /United\s*States/i] },
];

async function renderSingBoxTemplate() {
  log("start");

  let { type, name, outbound, includeUnsupportedProxy, url, policyNodes, landing, chainFilter, embyRuleUrl } = typeof $arguments !== "undefined" ? $arguments : {};
  if (!name) throw new Error("missing argument: name");
  policyNodes = normalizePolicyNodes(policyNodes);
  landing = parseBool(landing, false);
  const landingRegex = landing ? createLandingRegex(chainFilter) : null;
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
  applyLandingDetour(proxies, landingRegex);
  log(`loaded ${outbounds.length} outbounds, ${endpoints.length} endpoints`);

  const outboundRules = parseOutboundRules(outbound);
  config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  ensureExchangePolicy(config);
  ensureEmbyPolicy(config, embyRuleUrl);

  for (const outboundItem of config.outbounds) {
    if (!outboundItem || typeof outboundItem !== "object") continue;

    for (const [outboundRegex, tagRegex] of outboundRules) {
      if (!outboundRegex.test(outboundItem.tag || "")) continue;
      outboundItem.outbounds = Array.isArray(outboundItem.outbounds) ? outboundItem.outbounds : [];

      const tags = getTags(proxies, tagRegex, shouldExcludeLanding(outboundItem.tag, landingRegex) ? landingRegex : null, outboundItem.tag);
      log(`${outboundItem.tag} <= ${tags.length} node(s)`);
      outboundItem.outbounds.push(...tags);
      outboundItem.outbounds = unique(outboundItem.outbounds);
    }
  }

  if (landing) {
    ensureLandingGroups(config, proxies, landingRegex);
  }

  if (policyNodes === "all") {
    appendAllNodesToPolicyGroups(config, getTags(proxies, DEFAULT_NODE_FILTER));
  } else {
    log("policyNodes=none, keep policy selectors group-only");
  }
  normalizePolicyGroupOrder(config, policyNodes, landing);

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

function ensureEmbyPolicy(config, ruleUrl) {
  const emby = config.outbounds.find((outbound) => outbound && outbound.tag === EMBY_GROUP)
    || { tag: EMBY_GROUP, type: "selector", outbounds: getPolicyGroupChoices(false) };
  emby.type = "selector";
  removeOutbounds(config.outbounds, [EMBY_GROUP]);
  insertOutboundsAfter(config.outbounds, "📲 Telegram", [emby]);
  insertIntoSelectorAfter(config, "GLOBAL", "📲 Telegram", [EMBY_GROUP]);

  if (!ruleUrl) {
    log("embyRuleUrl omitted, Emby group only (existing template rules are preserved)");
    return;
  }

  config.route = config.route && typeof config.route === "object" ? config.route : {};
  config.route.rule_set = Array.isArray(config.route.rule_set) ? config.route.rule_set : [];
  const ruleSet = {
    tag: EMBY_RULE_SET,
    type: "remote",
    format: "source",
    url: String(ruleUrl),
    download_detour: "🎯 全球直连"
  };
  const existing = config.route.rule_set.findIndex((item) => item && item.tag === EMBY_RULE_SET);
  if (existing === -1) config.route.rule_set.push(ruleSet);
  else config.route.rule_set[existing] = ruleSet;

  config.route.rules = Array.isArray(config.route.rules) ? config.route.rules : [];
  if (!config.route.rules.some((rule) => rule && rule.rule_set === EMBY_RULE_SET && rule.outbound === EMBY_GROUP)) {
    const index = config.route.rules.findIndex((rule) => rule && rule.rule_set === "geosite-telegram");
    const rule = { rule_set: EMBY_RULE_SET, outbound: EMBY_GROUP };
    config.route.rules.splice(index === -1 ? 0 : index + 1, 0, rule);
  }
}

function ensureExchangePolicy(config) {
  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  config.outbounds = outbounds;

  let exchange = outbounds.find((outbound) => outbound && outbound.tag === EXCHANGE_GROUP);
  if (!exchange) {
    exchange = { tag: EXCHANGE_GROUP, type: "selector", outbounds: getPolicyGroupChoices(false) };
    insertOutboundsAfter(outbounds, "💶 PayPal", [exchange]);
  } else {
    exchange.type = "selector";
    exchange.outbounds = Array.isArray(exchange.outbounds) ? exchange.outbounds : getPolicyGroupChoices(false);
  }

  insertIntoSelectorAfter(config, "GLOBAL", "💶 PayPal", [EXCHANGE_GROUP]);
  ensureExchangeRouteRule(config);
  ensureExchangeRuleSet(config);
}

function ensureExchangeRouteRule(config) {
  config.route = config.route && typeof config.route === "object" ? config.route : {};
  config.route.rules = Array.isArray(config.route.rules) ? config.route.rules : [];
  if (config.route.rules.some((rule) => rule && rule.rule_set === EXCHANGE_RULE_SET)) return;

  const rule = { rule_set: EXCHANGE_RULE_SET, outbound: EXCHANGE_GROUP };
  const index = config.route.rules.findIndex((item) => item && item.rule_set === "geosite-paypal");
  if (index === -1) {
    config.route.rules.push(rule);
    return;
  }
  config.route.rules.splice(index + 1, 0, rule);
}

function ensureExchangeRuleSet(config) {
  config.route = config.route && typeof config.route === "object" ? config.route : {};
  config.route.rule_set = Array.isArray(config.route.rule_set) ? config.route.rule_set : [];
  if (config.route.rule_set.some((ruleSet) => ruleSet && ruleSet.tag === EXCHANGE_RULE_SET)) return;

  const ruleSet = {
    tag: EXCHANGE_RULE_SET,
    type: "remote",
    format: "binary",
    url: EXCHANGE_RULE_SET_URL,
    download_detour: "🎯 全球直连"
  };
  const index = config.route.rule_set.findIndex((item) => item && item.tag === "geosite-paypal");
  if (index === -1) {
    config.route.rule_set.push(ruleSet);
    return;
  }
  config.route.rule_set.splice(index + 1, 0, ruleSet);
}

function normalizePolicyGroupOrder(config, policyNodes, landing) {
  const policyGroupChoices = getPolicyGroupChoices(landing);

  for (const outboundItem of config.outbounds) {
    if (!outboundItem || outboundItem.type !== "selector") continue;
    if (!DEFAULT_INCLUDE_ALL_SELECTORS.test(outboundItem.tag || "")) continue;

    const outbounds = Array.isArray(outboundItem.outbounds) ? outboundItem.outbounds : [];
    if (policyNodes === "none") {
      outboundItem.outbounds = policyGroupChoices.slice();
      continue;
    }

    const policyChoices = new Set(policyGroupChoices);
    const directNodes = outbounds.filter((tag) => tag && !policyChoices.has(tag));
    outboundItem.outbounds = unique([...policyGroupChoices, ...directNodes]);
  }
}

function normalizePolicyNodes(value) {
  const normalized = String(value || "none").trim().toLowerCase();
  if (["all", "true", "1", "yes", "on"].includes(normalized)) return "all";
  if (["none", "false", "0", "no", "off"].includes(normalized)) return "none";
  throw new Error("invalid argument: policyNodes must be all or none");
}

function parseBool(value, fallback) {
  if (typeof value === "undefined" || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`invalid boolean argument: ${value}`);
}

function createLandingRegex(chainFilter) {
  const source = String(chainFilter || DEFAULT_LANDING_FILTER_SOURCE).trim();
  try {
    return new RegExp(source, "i");
  } catch (error) {
    throw new Error(`invalid argument: chainFilter is not valid regex: ${error.message || error}`);
  }
}

function applyLandingDetour(proxies, landingRegex) {
  if (!landingRegex) return;

  for (const proxy of proxies) {
    if (!proxy || typeof proxy !== "object") continue;
    if (!landingRegex.test(proxy.tag || "")) continue;
    proxy.detour = FRONT_PROXY_GROUP;
  }
}

function ensureLandingGroups(config, proxies, landingRegex) {
  if (!landingRegex) return;

  const landingTags = getTags(proxies, DEFAULT_NODE_FILTER, null).filter((tag) => landingRegex.test(tag));
  const frontTags = getTags(proxies, DEFAULT_NODE_FILTER, landingRegex);
  const groups = [
    { tag: FRONT_PROXY_GROUP, type: "selector", outbounds: frontTags.length > 0 ? unique([...frontTags, "🎯 全球直连"]) : ["🎯 全球直连"] },
    { tag: LANDING_GROUP, type: "selector", outbounds: landingTags.length > 0 ? landingTags : ["🎯 全球直连"] }
  ];

  removeOutbounds(config.outbounds, [FRONT_PROXY_GROUP, LANDING_GROUP]);
  insertOutboundsAfter(config.outbounds, EMBY_GROUP, groups);

  insertIntoSelectorAfter(config, "GLOBAL", EMBY_GROUP, [FRONT_PROXY_GROUP, LANDING_GROUP]);
  log(`landing enabled: ${landingTags.length} landing node(s), ${frontTags.length} front node(s)`);
}

function insertOutboundsAfter(outbounds, tag, items) {
  const index = outbounds.findIndex((outbound) => outbound && outbound.tag === tag);
  if (index === -1) {
    outbounds.unshift(...items);
    return;
  }
  outbounds.splice(index + 1, 0, ...items);
}

function removeOutbounds(outbounds, tags) {
  const tagSet = new Set(tags);
  for (let index = outbounds.length - 1; index >= 0; index--) {
    const outbound = outbounds[index];
    if (outbound && tagSet.has(outbound.tag)) {
      outbounds.splice(index, 1);
    }
  }
}

function insertIntoSelectorAfter(config, tag, afterTag, values) {
  const selector = config.outbounds.find((outbound) => outbound && outbound.tag === tag && outbound.type === "selector");
  if (!selector) return;
  selector.outbounds = Array.isArray(selector.outbounds) ? selector.outbounds : [];

  const valueSet = new Set(values);
  selector.outbounds = selector.outbounds.filter((outbound) => !valueSet.has(outbound));

  const afterIndex = selector.outbounds.indexOf(afterTag);
  if (afterIndex === -1) {
    selector.outbounds.push(...values);
    return;
  }

  for (const value of values) {
    selector.outbounds.splice(afterIndex + 1 + values.indexOf(value), 0, value);
  }
}

function getPolicyGroupChoices(landing) {
  if (!landing) return POLICY_GROUP_CHOICES.slice();
  return unique([...POLICY_GROUP_CHOICES.slice(0, -1), LANDING_GROUP, POLICY_GROUP_CHOICES[POLICY_GROUP_CHOICES.length - 1]]);
}

function shouldExcludeLanding(outboundTag, landingRegex) {
  if (!landingRegex) return false;
  return /^(🇭🇰 香港|🇹🇼 台湾|🇯🇵 日本|🇸🇬 新加坡|🇺🇸 美国)$/.test(outboundTag || "");
}

function getTags(proxies, regex, excludeRegex, outboundTag) {
  const regionTag = getKnownRegionTag(outboundTag);
  return proxies
    .filter((proxy) => {
      const tag = proxy && proxy.tag;
      if (!tag) return false;
      if (regionTag) return getRegionName(tag) === regionTag;
      return regex.test(tag);
    })
    .map((proxy) => proxy.tag)
    .filter((tag) => tag && !(excludeRegex && excludeRegex.test(tag)));
}

function getKnownRegionTag(tag) {
  const value = String(tag || "");
  return REGION_RULES.some((region) => region.name === value) ? value : undefined;
}

function getRegionName(name) {
  const value = String(name || "");
  const flagMatch = getFirstRegionFlagMatch(value);
  if (flagMatch) return flagMatch.name;

  let firstMatch;
  for (const region of REGION_RULES) {
    for (const keyword of region.keywords) {
      const match = keyword.exec(value);
      if (!match) continue;
      if (!firstMatch || match.index < firstMatch.index) {
        firstMatch = { name: region.name, index: match.index };
      }
    }
  }
  return firstMatch && firstMatch.name;
}

function getFirstRegionFlagMatch(value) {
  let firstMatch;
  for (const region of REGION_RULES) {
    for (const flag of region.flags) {
      const index = value.indexOf(flag);
      if (index === -1) continue;
      if (!firstMatch || index < firstMatch.index) {
        firstMatch = { name: region.name, index };
      }
    }
  }
  return firstMatch;
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
