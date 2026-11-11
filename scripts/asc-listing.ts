#!/usr/bin/env bun
// Ficha da App Store do Tune Shifter (iOS + macOS), pela App Store Connect API.
// Lê safari/listing.json e as capturas em safari/screenshots/<iphone|ipad|mac>/<locale>/.
// A app tem de existir no App Store Connect (a API não deixa criá-la).
//
//   bun scripts/asc-listing.ts status       o que já está e o que falta
//   bun scripts/asc-listing.ts metadata     textos, categorias, URLs, idade, direitos
//   bun scripts/asc-listing.ts pricing      grátis, em todos os países
//   bun scripts/asc-listing.ts screenshots  envia as capturas (substitui as que lá estão)
//   bun scripts/asc-listing.ts builds       liga a última build válida a cada versão
//   bun scripts/asc-listing.ts submit       envia as versões iOS e macOS para revisão
//   bun scripts/asc-listing.ts all          metadata + pricing + screenshots + builds
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { api, appFor } from "./asc";

const ROOT = resolve(import.meta.dir, "..");
const listing = JSON.parse(readFileSync(join(ROOT, "safari/listing.json"), "utf8"));
const SHOTS = join(ROOT, "safari/screenshots");
// Pasta de capturas -> tipo de ecrã na API (6,9" usa o tipo 67; iPad 13" usa o 129).
const SHOT_TYPES: Record<string, { platform: string; type: string }> = {
  iphone: { platform: "IOS", type: "APP_IPHONE_67" },
  ipad: { platform: "IOS", type: "APP_IPAD_PRO_3GEN_129" },
  mac: { platform: "MAC_OS", type: "APP_DESKTOP" },
};
const shotDir = (locale: string) => (locale.startsWith("pt") ? "pt-PT" : "en");

async function getApp() {
  const app = await appFor(listing.bundleId);
  if (!app) {
    console.error(`a app ${listing.bundleId} ainda não existe no App Store Connect (cria-a no site: README, Safari)`);
    process.exit(1);
  }
  return app;
}

async function versions(appId: string) {
  const r = await api("GET", `/v1/apps/${appId}/appStoreVersions?limit=20&filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED,WAITING_FOR_REVIEW,IN_REVIEW,READY_FOR_REVIEW`);
  return r.data as any[];
}

async function editableAppInfo(appId: string) {
  const r = await api("GET", `/v1/apps/${appId}/appInfos`);
  return r.data.find((i: any) => i.attributes.state !== "READY_FOR_DISTRIBUTION") ?? r.data[0];
}

/** Cria ou atualiza a localização (POST se faltar, PATCH se já existir). */
async function upsertLocalization(kind: "appInfoLocalizations" | "appStoreVersionLocalizations", parentRel: string, parentType: string, parentId: string, locale: string, attrs: Record<string, any>) {
  const list = (await api("GET", `/v1/${parentType}/${parentId}/${kind}?limit=50`)).data as any[];
  const found = list.find((l) => l.attributes.locale === locale);
  if (found) {
    await api("PATCH", `/v1/${kind}/${found.id}`, { data: { type: kind, id: found.id, attributes: attrs } });
    return found.id as string;
  }
  const created = await api("POST", `/v1/${kind}`, {
    data: { type: kind, attributes: { locale, ...attrs }, relationships: { [parentRel]: { data: { type: parentType, id: parentId } } } },
  });
  return created.data.id as string;
}

async function metadata() {
  const app = await getApp();
  await api("PATCH", `/v1/apps/${app.id}`, {
    data: { type: "apps", id: app.id, attributes: { contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT" } },
  });
  const info = await editableAppInfo(app.id);
  await api("PATCH", `/v1/appInfos/${info.id}`, {
    data: {
      type: "appInfos",
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: "appCategories", id: listing.primaryCategory } },
        secondaryCategory: { data: { type: "appCategories", id: listing.secondaryCategory } },
      },
    },
  });
  for (const [locale, l] of Object.entries<any>(listing.localizations)) {
    await upsertLocalization("appInfoLocalizations", "appInfo", "appInfos", info.id, locale, {
      name: l.name,
      subtitle: l.subtitle,
      privacyPolicyUrl: listing.privacyPolicyUrl,
    });
  }
  console.log("ficha geral: categorias, nome, subtítulo, política de privacidade");

  // Classificação etária: nada de conteúdo sensível (4+).
  const age = (await api("GET", `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
  // Sim/não e frequência (NONE); campos desconhecidos tentam um tipo e depois o outro.
  const BOOLS = ["advertising", "ageAssurance", "gambling", "healthOrWellnessTopics", "lootBox", "messagingAndChat",
    "parentalControls", "unrestrictedWebAccess", "userGeneratedContent", "socialMedia", "socialMediaAgeRestricted"];
  const SKIP = ["kidsAgeBand", "ageRatingOverride", "ageRatingOverrideV2", "koreaAgeRatingOverride", "gracRatingClassificationNumber", "developerAgeRatingInfoUrl"];
  const attrs: Record<string, any> = {};
  for (const k of Object.keys(age.attributes ?? {})) {
    if (SKIP.includes(k)) continue;
    attrs[k] = BOOLS.includes(k) ? false : "NONE";
  }
  const tryPatch = async (a: Record<string, any>) => api("PATCH", `/v1/ageRatingDeclarations/${age.id}`, { data: { type: "ageRatingDeclarations", id: age.id, attributes: a } });
  for (let attempt = 0; ; attempt++) {
    try {
      await tryPatch(attrs);
      break;
    } catch (e: any) {
      const bad = Object.keys(attrs).filter((k) => e.message.includes(k));
      if (!bad.length || attempt > 6) throw e;
      for (const k of bad) {
        if (attempt < 3) attrs[k] = typeof attrs[k] === "boolean" ? "NONE" : false;
        else delete attrs[k];
      }
    }
  }
  console.log("classificação etária: sem conteúdo sensível");

  for (const v of await versions(app.id)) {
    await api("PATCH", `/v1/appStoreVersions/${v.id}`, {
      data: { type: "appStoreVersions", id: v.id, attributes: { copyright: listing.copyright } },
    });
    for (const [locale, l] of Object.entries<any>(listing.localizations)) {
      await upsertLocalization("appStoreVersionLocalizations", "appStoreVersion", "appStoreVersions", v.id, locale, {
        description: l.description,
        keywords: l.keywords,
        promotionalText: l.promotionalText,
        supportUrl: listing.supportUrl,
        marketingUrl: listing.marketingUrl,
      });
    }
    await reviewDetail(v.id);
    console.log(`versão ${v.attributes.platform} ${v.attributes.versionString}: textos e contacto de revisão`);
  }
}

async function reviewDetail(versionId: string) {
  const r = listing.review;
  const attrs: Record<string, any> = {
    contactFirstName: r.contactFirstName,
    contactLastName: r.contactLastName,
    contactEmail: r.contactEmail,
    notes: r.notes,
    demoAccountRequired: false,
  };
  const phone = process.env.REVIEW_PHONE || r.contactPhone;
  if (phone) attrs.contactPhone = phone;
  let existing: any = null;
  try {
    existing = (await api("GET", `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`)).data;
  } catch {}
  if (existing) {
    await api("PATCH", `/v1/appStoreReviewDetails/${existing.id}`, { data: { type: "appStoreReviewDetails", id: existing.id, attributes: attrs } });
  } else {
    await api("POST", "/v1/appStoreReviewDetails", {
      data: { type: "appStoreReviewDetails", attributes: attrs, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } } },
    });
  }
  if (!phone) console.log("  falta o telefone do contacto de revisão (REVIEW_PHONE=+351... ou safari/listing.json)");
}

async function pricing() {
  const app = await getApp();
  // Grátis: preço 0 no território base (EUA), os outros seguem.
  const points = (await api("GET", `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`)).data as any[];
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error("não encontrei o preço 0");
  await api("POST", "/v1/appPriceSchedules", {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: app.id } },
        baseTerritory: { data: { type: "territories", id: "USA" } },
        manualPrices: { data: [{ type: "appPrices", id: "${price}" }] },
      },
    },
    included: [
      {
        type: "appPrices",
        id: "${price}",
        attributes: { startDate: null },
        relationships: { appPricePoint: { data: { type: "appPricePoints", id: free.id } } },
      },
    ],
  });
  console.log("preço: grátis");
  // Disponível em todos os países (e nos novos).
  const territories = (await api("GET", "/v1/territories?limit=200")).data as any[];
  try {
    await api("POST", "/v2/appAvailabilities", {
      data: {
        type: "appAvailabilities",
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: "apps", id: app.id } },
          territoryAvailabilities: { data: territories.map((t) => ({ type: "territoryAvailabilities", id: `\${${t.id}}` })) },
        },
      },
      included: territories.map((t) => ({
        type: "territoryAvailabilities",
        id: `\${${t.id}}`,
        attributes: { available: true },
        relationships: { territory: { data: { type: "territories", id: t.id } } },
      })),
    });
    console.log(`disponibilidade: ${territories.length} países`);
  } catch (e: any) {
    if (/already|exists|409/i.test(e.message)) console.log("disponibilidade: já estava definida");
    else throw e;
  }
}

async function upload(setId: string, file: string) {
  const bytes = readFileSync(file);
  const name = file.split("/").slice(-3).join("-");
  const shot = (
    await api("POST", "/v1/appScreenshots", {
      data: { type: "appScreenshots", attributes: { fileName: name, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } } },
    })
  ).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers: Record<string, string> = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`envio da captura ${name}: ${res.status}`);
  }
  await api("PATCH", `/v1/appScreenshots/${shot.id}`, {
    data: { type: "appScreenshots", id: shot.id, attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(bytes).digest("hex") } },
  });
}

async function screenshots() {
  const app = await getApp();
  for (const v of await versions(app.id)) {
    const platform = v.attributes.platform;
    const locs = (await api("GET", `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`)).data as any[];
    for (const loc of locs) {
      const sets = (await api("GET", `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data as any[];
      for (const [dir, t] of Object.entries(SHOT_TYPES)) {
        if (t.platform !== platform) continue;
        const folder = join(SHOTS, dir, shotDir(loc.attributes.locale));
        if (!existsSync(folder)) continue;
        const files = readdirSync(folder).filter((f) => f.endsWith(".png")).sort().map((f) => join(folder, f));
        let set = sets.find((s) => s.attributes.screenshotDisplayType === t.type);
        if (set) {
          const old = (await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data as any[];
          for (const o of old) await api("DELETE", `/v1/appScreenshots/${o.id}`);
        } else {
          set = (
            await api("POST", "/v1/appScreenshotSets", {
              data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: t.type }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } } },
            })
          ).data;
        }
        for (const f of files) await upload(set.id, f);
        console.log(`capturas ${platform} ${loc.attributes.locale} ${dir}: ${files.length}`);
      }
    }
  }
}

async function builds() {
  const app = await getApp();
  for (const v of await versions(app.id)) {
    const platform = v.attributes.platform;
    const r = await api("GET", `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.platform]=${platform}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`);
    const b = r.data[0];
    if (!b) {
      console.log(`${platform}: ainda não há build processada (npm run safari, e esperar uns minutos)`);
      continue;
    }
    await api("PATCH", `/v1/appStoreVersions/${v.id}/relationships/build`, { data: { type: "builds", id: b.id } });
    console.log(`${platform}: build ${b.attributes.version} ligada à versão ${v.attributes.versionString}`);
  }
}

async function submit() {
  const app = await getApp();
  for (const v of await versions(app.id)) {
    const platform = v.attributes.platform;
    if (v.attributes.appStoreState !== "PREPARE_FOR_SUBMISSION" && !/REJECTED/.test(v.attributes.appStoreState)) {
      console.log(`${platform}: já está em ${v.attributes.appStoreState}`);
      continue;
    }
    // Rejeitada: a versão continua presa ao envio com "problemas por resolver";
    // marca os itens como resolvidos e volta a enviar esse mesmo envio.
    const unresolved = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=${platform}&filter[state]=UNRESOLVED_ISSUES&include=items&limit=5`)) as any;
    if (unresolved.data.length) {
      const sub = unresolved.data[0];
      for (const it of unresolved.included || []) {
        if (it.type === "reviewSubmissionItems" && it.attributes.state === "REJECTED") {
          await api("PATCH", `/v1/reviewSubmissionItems/${it.id}`, { data: { type: "reviewSubmissionItems", id: it.id, attributes: { resolved: true } } });
        }
      }
      await api("PATCH", `/v1/reviewSubmissions/${sub.id}`, { data: { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } } });
      console.log(`${platform}: reenviada para revisão`);
      continue;
    }
    const open = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=${platform}&filter[state]=READY_FOR_REVIEW&limit=5`)).data as any[];
    const sub =
      open[0] ??
      (await api("POST", "/v1/reviewSubmissions", { data: { type: "reviewSubmissions", attributes: { platform }, relationships: { app: { data: { type: "apps", id: app.id } } } } })).data;
    try {
      await api("POST", "/v1/reviewSubmissionItems", {
        data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: sub.id } }, appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } },
      });
    } catch (e: any) {
      if (!/already/i.test(e.message)) throw e;
    }
    await api("PATCH", `/v1/reviewSubmissions/${sub.id}`, { data: { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } } });
    console.log(`${platform}: enviada para revisão`);
  }
}

async function status() {
  const app = await getApp();
  console.log(`app ${app.attributes.name} (${app.id}) https://apps.apple.com/app/id${app.id}`);
  for (const v of await versions(app.id)) {
    let build = "sem build";
    try {
      const b = (await api("GET", `/v1/appStoreVersions/${v.id}/build`)).data;
      if (b) build = `build ${b.attributes.version}`;
    } catch {}
    console.log(`${v.attributes.platform} ${v.attributes.versionString}: ${v.attributes.appStoreState}, ${build}`);
  }
  const r = await api("GET", `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=6&include=preReleaseVersion`);
  const pre = Object.fromEntries((r.included || []).map((x: any) => [x.id, x.attributes]));
  for (const b of r.data) console.log(`  build ${b.attributes.version} ${pre[b.relationships?.preReleaseVersion?.data?.id]?.platform ?? ""} ${b.attributes.processingState}`);
}

const steps: Record<string, () => Promise<void>> = { status, metadata, pricing, screenshots, builds, submit };
const cmd = process.argv[2] || "status";
try {
  if (cmd === "all") {
    await metadata();
    await pricing();
    await screenshots();
    await builds();
  } else if (steps[cmd]) await steps[cmd]();
  else {
    console.error("uso: asc-listing.ts status|metadata|pricing|screenshots|builds|submit|all");
    process.exit(2);
  }
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
