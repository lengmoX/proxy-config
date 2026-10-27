import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const singSource = read("../sing-box/1.13.x/sub-store-template.js");
const template = JSON.parse(read("../sing-box/1.13.x/config.json"));
const PIKPAK = "📹 PikPak";
const EMBY = "🎬 Emby";
const YOUTUBE = "📹 YouTube";
const nodeNames = ["香港测试", "美国落地测试"];
const markedNames = ["[普通]香港测试", "[机场]机场测试", "[落地]美国落地测试"];

async function renderSingBox(args, input = template) {
  const content = await runInNewContext(`(async () => {
    ${singSource}
    return $content;
  })()`, {
    $arguments: { name: "test", ...args },
    $content: JSON.stringify(input),
    produceArtifact: async () => ({
      outbounds: markedNames.map((tag) => ({
        tag, type: "socks", server: "127.0.0.1", server_port: 1080,
      })),
    }),
    console: { log() {} },
  });
  return JSON.parse(content);
}

function tags(config) {
  return config.outbounds.map((outbound) => outbound.tag);
}

describe("PikPak policy", () => {
  for (const policyNodes of ["none", "all"]) {
    for (const landing of [false, true]) {
      test(`policyNodes=${policyNodes}, landing=${landing}`, async () => {
        const config = await renderSingBox({ policyNodes, landing });
        const names = tags(config);
        const globalNames = config.outbounds.find((group) => group.tag === "GLOBAL").outbounds;
        const pikpak = config.outbounds.find((group) => group.tag === PIKPAK);

        expect(names.filter((name) => name === PIKPAK)).toHaveLength(1);
        expect(names.indexOf(EMBY)).toBeLessThan(names.indexOf(PIKPAK));
        expect(names.indexOf(PIKPAK)).toBeLessThan(names.indexOf(YOUTUBE));
        expect(globalNames.indexOf(EMBY)).toBeLessThan(globalNames.indexOf(PIKPAK));
        expect(globalNames.indexOf(PIKPAK)).toBeLessThan(globalNames.indexOf(YOUTUBE));
        expect(pikpak.outbounds.includes(nodeNames[0])).toBe(policyNodes === "all");
        expect(pikpak.outbounds).toContain(nodeNames[1]);
        expect(pikpak.outbounds).not.toContain("🛬 落地节点");

        const rules = config.route.rules.filter((rule) => rule.outbound === PIKPAK);
        expect(rules).toHaveLength(1);
        expect(rules[0].domain_suffix).toEqual(["mypikpak.com"]);
        expect(config.route.rules.findIndex((rule) => rule.outbound === PIKPAK))
          .toBeLessThan(config.route.rules.findIndex((rule) => rule.rule_set === "geosite-youtube"));
      });
    }
  }

  test("injects the group when the base template does not contain it", async () => {
    const config = await renderSingBox({ policyNodes: "none" }, {
      ...template,
      outbounds: template.outbounds.filter(item => item.tag !== PIKPAK)
    });

    expect(tags(config).filter((name) => name === PIKPAK)).toHaveLength(1);
    expect(config.route.rules.filter((rule) => rule.outbound === PIKPAK)).toHaveLength(1);
  });

  test("repeated rendering rejects duplicate subscription tags", async () => {
    const once = await renderSingBox({});
    await expect(renderSingBox({}, once)).rejects.toThrow("节点 tag 重复");
  });
});
