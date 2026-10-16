/*
 * Sub-Store mihomo 配置脚本（统一参数版）
 *
 * 支持参数：
 * - policyNodes=none|all，默认 none。all 会让业务策略组直接展示全部单节点。
 * - landing=true|false，默认 false。启用后识别落地节点并生成前置/落地分组。
 * - chainFilter=<正则>，landing=true 时可覆盖默认落地节点识别正则。
 * - embyRuleUrl=<直链>，可选，默认使用本仓库的 classical YAML 规则；空字符串时只创建 Emby 分组。
 *
 * 示例：
 * https://example.com/mihomo.js#policyNodes=all&landing=true
 * https://example.com/mihomo.js#landing=true&chainFilter=^Minor：|备用|落地
 */

const FRONT_PROXY_GROUP = '🔗 前置代理';
const LANDING_GROUP = '🛬 落地节点';
const BACKGROUND_TEST_GROUP = '📊 延迟测试';
const EXCHANGE_GROUP = '💱 交易所';
const EMBY_GROUP = '🎬 Emby';
const DEFAULT_EMBY_RULE_URL = 'https://gh-proxy.com/https://raw.githubusercontent.com/lengmoX/proxy-config/main/rules/emby/mihomo.yaml';
const DEFAULT_LANDING_FILTER = '家宽|家庭宽带|商宽|商业宽带|星链|Starlink|落地|链式|Minor';
const REGION_RULES = [
  { name: '🇭🇰 香港', flags: ['🇭🇰'], keywords: [/香港/i, /港/i, /\bHK\b/i, /Hong\s*Kong/i, /HongKong/i] },
  { name: '🇹🇼 台湾', flags: ['🇹🇼'], keywords: [/台湾/i, /台灣/i, /臺灣/i, /台/i, /\bTW\b/i, /Taiwan/i] },
  { name: '🇸🇬 新加坡', flags: ['🇸🇬'], keywords: [/新加坡/i, /狮城/i, /坡/i, /\bSG\b/i, /Singapore/i] },
  { name: '🇯🇵 日本', flags: ['🇯🇵'], keywords: [/日本/i, /东京/i, /大阪/i, /日/i, /\bJP\b/i, /Japan/i] },
  { name: '🇺🇸 美国', flags: ['🇺🇸'], keywords: [/美国/i, /洛杉矶/i, /硅谷/i, /西雅图/i, /美/i, /\bUS\b/i, /\bUSA\b/i, /States/i, /America/i, /United\s*States/i] },
];

function main(config) {
  const args = getArguments();
  return buildMihomoConfig(config, {
    policyNodes: normalizePolicyNodes(args.policyNodes),
    landing: parseBool(args.landing, false),
    chainFilter: args.chainFilter,
    embyRuleUrl: typeof args.embyRuleUrl === 'undefined' ? DEFAULT_EMBY_RULE_URL : args.embyRuleUrl,
  });
}

function getArguments() {
  if (typeof $arguments !== 'undefined' && $arguments) return $arguments;
  return {};
}

function normalizePolicyNodes(value) {
  const normalized = String(value || 'none').trim().toLowerCase();
  if (['all', 'true', '1', 'yes', 'on'].includes(normalized)) return 'all';
  if (['none', 'false', '0', 'no', 'off', ''].includes(normalized)) return 'none';
  throw new Error(`invalid policyNodes: ${value}. Use none or all.`);
}

function parseBool(value, fallback) {
  if (typeof value === 'undefined' || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`invalid boolean value: ${value}`);
}

function buildMihomoConfig(input, options) {
  const config = input && typeof input === 'object' ? input : {};
  const includePolicyNodes = options.policyNodes === 'all';
  const chainRegex = options.landing ? createChainRegex(options.chainFilter || DEFAULT_LANDING_FILTER) : null;
  const subscriptionProxies = normalizeProxies(Array.isArray(config.proxies) ? config.proxies.filter(Boolean) : [], chainRegex);
  const nodeNames = unique(subscriptionProxies.map((proxy) => proxy && proxy.name).filter(Boolean));
  const selectableNodes = nodeNames.length > 0 ? nodeNames : ['直连'];
  const chainGroups = createChainGroups(selectableNodes, chainRegex);

  const regionGroups = createRegionGroups(selectableNodes, chainRegex);
  const regionGroupNames = regionGroups.map((group) => group.name);
  const basePolicyChoices = unique([
    '🚀 默认代理',
    '🌐 全部节点',
    ...regionGroupNames,
    chainGroups.enabled && LANDING_GROUP,
    '直连',
  ]);
  const policyChoices = includePolicyNodes ? unique([...basePolicyChoices, ...selectableNodes]) : basePolicyChoices;

  const result = {
    ...config,
    proxies: ensureDirectProxy(subscriptionProxies),

    port: 7890,
    'socks-port': 7891,
    'redir-port': 7892,
    'mixed-port': 7893,
    'tproxy-port': 7894,
    'allow-lan': true,
    'bind-address': '*',
    ipv6: true,
    'unified-delay': true,
    'tcp-concurrent': true,
    'log-level': 'warning',
    'find-process-mode': 'strict',
    'keep-alive-idle': 600,
    'keep-alive-interval': 15,
    'disable-keep-alive': false,
    profile: {
      'store-selected': true,
      'store-fake-ip': true,
    },

    'external-controller': '0.0.0.0:9090',
    secret: '',
    'external-ui': 'ui',
    'external-ui-name': 'zashboard',
    'external-ui-url': 'https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip',

    sniffer: createSniffer(),
    tun: createTun(),
    dns: createDns(),
    'proxy-groups': createProxyGroups(selectableNodes, regionGroups, policyChoices, chainGroups),
    rules: createRules(options.embyRuleUrl),
    'rule-providers': createRuleProviders(options.embyRuleUrl),
  };
  delete result['proxy-providers'];
  return result;
}

function createChainRegex(source) {
  const value = String(source || '').trim();
  if (!value) return null;
  try {
    return new RegExp(value, 'i');
  } catch (error) {
    throw new Error(`invalid chainFilter regex: ${error.message || error}`);
  }
}

function normalizeProxies(proxies, chainRegex) {
  return proxies.map((proxy) => {
    if (!proxy || typeof proxy !== 'object') return proxy;
    if (!chainRegex || !chainRegex.test(proxy.name || '')) return proxy;
    return { ...proxy, 'dialer-proxy': FRONT_PROXY_GROUP };
  });
}

function createChainGroups(nodeNames, chainRegex) {
  if (!chainRegex) return { enabled: false, groups: [] };

  const landingNodes = nodeNames.filter((name) => chainRegex.test(name));
  const frontNodes = nodeNames.filter((name) => !chainRegex.test(name));

  return {
    enabled: true,
    groups: [
      { name: FRONT_PROXY_GROUP, type: 'select', proxies: frontNodes.length > 0 ? frontNodes : ['直连'] },
      { name: LANDING_GROUP, type: 'select', proxies: landingNodes.length > 0 ? landingNodes : ['🌐 全部节点', '直连'] },
    ],
  };
}

function ensureDirectProxy(proxies) {
  const result = proxies.slice();
  if (!result.some((proxy) => proxy && proxy.name === '直连')) {
    result.unshift({ name: '直连', type: 'direct', udp: true });
  }
  return result;
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function createRegionGroups(nodeNames, chainRegex) {
  return REGION_RULES.map((region) => {
    const matched = nodeNames.filter((name) => {
      if (chainRegex && chainRegex.test(name)) return false;
      return getRegionName(name) === region.name;
    });
    return {
      name: region.name,
      type: 'select',
      proxies: matched.length > 0 ? matched : ['🌐 全部节点', '直连'],
    };
  });
}

function getRegionName(name) {
  const value = String(name || '');
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

function createProxyGroups(nodeNames, regionGroups, policyChoices, chainGroups) {
  const allNodeGroup = { name: '🌐 全部节点', type: 'select', proxies: nodeNames };
  const backgroundTestGroup = {
    name: BACKGROUND_TEST_GROUP,
    type: 'url-test',
    proxies: nodeNames,
    url: 'https://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 100,
    hidden: true,
    lazy: false,
  };
  const policy = (name) => ({ name, type: 'select', proxies: policyChoices });

  return [
    { name: '🚀 默认代理', type: 'select', proxies: unique(['🌐 全部节点', ...nodeNames]) },
    allNodeGroup,
    policy('🤖 AI'),
    policy('📲 Telegram'),
    policy(EMBY_GROUP),
    ...chainGroups.groups,
    { name: '🔄 订阅更新', type: 'select', proxies: ['直连', '🚀 默认代理'] },
    policy('📹 PikPak'),
    policy('📹 YouTube'),
    policy('🍀 Google'),
    policy('👨🏿‍💻 GitHub'),
    policy('🐬 OneDrive'),
    policy('🪟 Microsoft'),
    policy('🎵 TikTok'),
    policy('🎥 NETFLIX'),
    policy('✈️ Speedtest'),
    policy('💶 PayPal'),
    policy(EXCHANGE_GROUP),
    { name: '🍎 Apple', type: 'select', proxies: ['直连', '🚀 默认代理'] },
    { name: '🎯 直连', type: 'select', proxies: ['直连', '🚀 默认代理'] },
    policy('🐟 漏网之鱼'),
    backgroundTestGroup,
    ...regionGroups,
  ];
}

function createSniffer() {
  return {
    enable: true,
    sniff: {
      HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
    'force-domain': ['+.v2ex.com'],
    'skip-domain': ['+.baidu.com'],
  };
}

function createTun() {
  return {
    enable: true,
    stack: 'mixed',
    'dns-hijack': ['any:53', 'tcp://any:53', 'any:853', 'tcp://any:853'],
    'auto-route': true,
    'auto-redirect': true,
    'auto-detect-interface': true,
    'strict-route': true,
  };
}

function createDns() {
  return {
    enable: true,
    'cache-algorithm': 'arc',
    'prefer-h3': false,
    listen: '127.0.0.1:1053',
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter-mode': 'blacklist',
    'fake-ip-filter': [
      'geosite:private',
      'geosite:category-ntp',
      '+.lan',
      '+.local',
      '+.localhost',
      'time.*.com',
      'time.*.gov',
      'time.*.edu.cn',
      'time.*.apple.com',
      'time-ios.apple.com',
      'time1.cloud.tencent.com',
      'time.ustc.edu.cn',
      'pool.ntp.org',
      'ntp.*.com',
      'ntp.*.com.cn',
      'ntp.ntsc.ac.cn',
    ],
    'default-nameserver': ['223.5.5.5', '223.6.6.6'],
    'proxy-server-nameserver': ['https://223.5.5.5/dns-query', 'https://223.6.6.6/dns-query'],
    'direct-nameserver': ['https://223.5.5.5/dns-query', 'https://223.6.6.6/dns-query'],
    'direct-nameserver-follow-policy': false,
    'nameserver-policy': {
      'rule-set:private_domain': ['system'],
      'rule-set:cn_domain': ['https://223.5.5.5/dns-query', 'https://223.6.6.6/dns-query'],
      'geosite:category-ntp': ['https://223.5.5.5/dns-query', 'https://223.6.6.6/dns-query'],
    },
    nameserver: ['https://1.1.1.1/dns-query#RULES', 'https://8.8.8.8/dns-query#RULES'],
    'respect-rules': true,
    'use-hosts': true,
    'use-system-hosts': true,
  };
}

function createRules(embyRuleUrl) {
  return [
    'DOMAIN-SUFFIX,qichiyu.com,🚀 默认代理',
    'DOMAIN-SUFFIX,cloudflare.com,🚀 默认代理',
    'DOMAIN-SUFFIX,xlzf.me,🚀 默认代理',
    'DOMAIN-SUFFIX,xn--9kqz23b19z.com,🚀 默认代理',
    'DOMAIN-SUFFIX,google.com,🚀 默认代理',
    'RULE-SET,private_domain,直连',
    ...(embyRuleUrl ? [`RULE-SET,emby,${EMBY_GROUP}`] : []),
    'RULE-SET,apple_domain,🍎 Apple',
    'RULE-SET,proxylite,🚀 默认代理',
    'RULE-SET,cloudflare,🚀 默认代理',
    'RULE-SET,ai,🤖 AI',
    'DOMAIN-SUFFIX,mypikpak.com,📹 PikPak',
    'RULE-SET,github_domain,👨🏿‍💻 GitHub',
    'RULE-SET,youtube_domain,📹 YouTube',
    'RULE-SET,google_domain,🍀 Google',
    'RULE-SET,onedrive_domain,🐬 OneDrive',
    'RULE-SET,microsoft_domain,🪟 Microsoft',
    'RULE-SET,tiktok_domain,🎵 TikTok',
    'RULE-SET,speedtest_domain,✈️ Speedtest',
    'RULE-SET,telegram_domain,📲 Telegram',
    'RULE-SET,netflix_domain,🎥 NETFLIX',
    'RULE-SET,paypal_domain,💶 PayPal',
    `RULE-SET,cryptocurrency_domain,${EXCHANGE_GROUP}`,
    'RULE-SET,gfw_domain,🚀 默认代理',
    'RULE-SET,geolocation-!cn,🚀 默认代理',
    'RULE-SET,cn_domain,🎯 直连',
    'RULE-SET,google_ip,🍀 Google,no-resolve',
    'RULE-SET,netflix_ip,🎥 NETFLIX,no-resolve',
    'RULE-SET,telegram_ip,📲 Telegram,no-resolve',
    'RULE-SET,cn_ip,🎯 直连',
    'MATCH,🚀 默认代理',
  ];
}

function createRuleProviders(embyRuleUrl) {
  const domain = (url) => ({ type: 'http', interval: 86400, behavior: 'domain', format: 'mrs', url });
  const ip = (url) => ({ type: 'http', interval: 86400, behavior: 'ipcidr', format: 'mrs', url });
  const classical = (url) => ({ type: 'http', interval: 86400, behavior: 'classical', format: 'text', url });

  return {
    ...(embyRuleUrl ? {
      emby: {
        type: 'http',
        interval: 86400,
        behavior: 'classical',
        format: 'yaml',
        path: './ruleset/emby.yaml',
        url: String(embyRuleUrl),
      },
    } : {}),
    private_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs'),
    proxylite: classical('https://raw.githubusercontent.com/qichiyuhub/rule/refs/heads/main/rules/proxy.list'),
    ai: domain('https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/category-ai-!cn.mrs'),
    youtube_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs'),
    google_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google.mrs'),
    github_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/github.mrs'),
    telegram_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/telegram.mrs'),
    netflix_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/netflix.mrs'),
    paypal_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/paypal.mrs'),
    cryptocurrency_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-cryptocurrency.mrs'),
    onedrive_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/onedrive.mrs'),
    microsoft_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/microsoft.mrs'),
    apple_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/apple-cn.mrs'),
    speedtest_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/ookla-speedtest.mrs'),
    tiktok_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/tiktok.mrs'),
    gfw_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/gfw.mrs'),
    'geolocation-!cn': domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/geolocation-!cn.mrs'),
    cloudflare: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo-lite/geosite/cloudflare.mrs'),
    cn_domain: domain('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs'),
    cn_ip: ip('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs'),
    google_ip: ip('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/google.mrs'),
    telegram_ip: ip('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs'),
    netflix_ip: ip('https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/netflix.mrs'),
  };
}
