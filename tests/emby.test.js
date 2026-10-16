import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const singSource = read("../sing-box/1.13.x/sub-store-template.js");
const mihomoSource = read("../sub-store/mihomo.js");
const template = JSON.parse(read("../sing-box/1.13.x/config.json"));
const EMBY = "🎬 Emby";
const TELEGRAM = "📲 Telegram";
const nodeNames = ["香港测试", "美国落地测试"];

async function renderSingBox(args, input = template) {
  const content = await runInNewContext(`(async () => {
    ${singSource}
    return $content;
  })()`, {
    $arguments: { name: "test", ...args },
    $content: JSON.stringify(input),
    produceArtifact: async () => ({
      outbounds: nodeNames.map((tag) => ({
        tag, type: "socks", server: "127.0.0.1", server_port: 1080,
      })),
    }),
    console: { log() {} },
  });
  return JSON.parse(content);
}

function renderMihomo(args) {
  return runInNewContext(`${mihomoSource}\nmain(input)`, {
    $arguments: args,
    input: {
      proxies: nodeNames.map((name) => ({
        name, type: "socks5", server: "127.0.0.1", port: 1080,
      })),
    },
  });
}

function expectAfterTelegram(names) {
  expect(names.filter((name) => name === EMBY)).toHaveLength(1);
  expect(names[names.indexOf(TELEGRAM) + 1]).toBe(EMBY);
}

describe("Emby policy", () => {
  for (const policyNodes of ["none", "all"]) {
    for (const landing of [false, true]) {
      for (const enabled of [false, true]) {
        test(`${policyNodes}, landing=${landing}, remote=${enabled}`, async () => {
          const args = { policyNodes, landing };
          const sing = await renderSingBox({
            ...args,
            ...(enabled ? { embyRuleUrl: "https://example.com/emby.json" } : {}),
          });
          const mihomo = renderMihomo({
            ...args,
            ...(enabled ? { embyRuleUrl: "https://example.com/emby.yaml" } : {}),
          });
          expectAfterTelegram(sing.outbounds.map((group) => group.tag));
          expectAfterTelegram(sing.outbounds.find((group) => group.tag === "GLOBAL").outbounds);
          expectAfterTelegram(mihomo["proxy-groups"].map((group) => group.name));

          const singChoices = sing.outbounds.find((group) => group.tag === EMBY).outbounds;
          const mihomoChoices = mihomo["proxy-groups"].find((group) => group.name === EMBY).proxies;
          for (const choices of [singChoices, mihomoChoices]) {
            expect(choices.includes(nodeNames[0])).toBe(policyNodes === "all");
            expect(choices.includes("🛬 落地节点")).toBe(landing);
          }
          expect(singChoices).toContain("🎯 全球直连");
          expect(mihomoChoices).toContain("直连");

          const ruleSet = sing.route.rule_set.find((item) => item.tag === "emby");
          expect(Boolean(ruleSet)).toBe(enabled);
          expect(sing.route.rules.some((rule) => rule.rule_set === "emby" && rule.outbound === EMBY)).toBe(enabled);
          expect(Boolean(mihomo["rule-providers"].emby)).toBe(enabled);
          expect(mihomo.rules.includes(`RULE-SET,emby,${EMBY}`)).toBe(enabled);
          if (enabled) {
            expect(ruleSet.format).toBe("source");
            expect(ruleSet.url).toBe("https://example.com/emby.json");
            expect(mihomo["rule-providers"].emby.format).toBe("yaml");
            expect(mihomo["rule-providers"].emby.behavior).toBe("classical");
            expect(mihomo["rule-providers"].emby.url).toBe("https://example.com/emby.yaml");
          }
        });
      }
    }
  }

  test("sing-box repeated rendering does not duplicate Emby objects", async () => {
    const args = { embyRuleUrl: "https://example.com/emby.json", landing: true };
    const config = await renderSingBox(args, await renderSingBox(args));
    expectAfterTelegram(config.outbounds.map((group) => group.tag));
    expectAfterTelegram(config.outbounds.find((group) => group.tag === "GLOBAL").outbounds);
    expect(config.route.rules.filter((rule) => rule.rule_set === "emby")).toHaveLength(1);
    expect(config.route.rule_set.filter((rule) => rule.tag === "emby")).toHaveLength(1);
  });

  test("sing-box preserves existing Emby rules without a URL argument", async () => {
    const original = await renderSingBox({ embyRuleUrl: "https://example.com/emby.json" });
    const config = await renderSingBox({}, original);
    expect(config.route.rules.filter((rule) => rule.rule_set === "emby")).toHaveLength(1);
    expect(config.route.rule_set.find((rule) => rule.tag === "emby").url).toBe("https://example.com/emby.json");
  });

  test("source rule files describe the same service domains", () => {
    const sing = JSON.parse(read("../rules/emby/sing-box.json"));
    const mihomo = Bun.YAML.parse(read("../rules/emby/mihomo.yaml"));
    expect(sing.version).toBe(3);
    expect(mihomo.payload).toEqual(
      sing.rules[0].domain_suffix.map((domain) => `DOMAIN-SUFFIX,${domain}`),
    );
  });
});
