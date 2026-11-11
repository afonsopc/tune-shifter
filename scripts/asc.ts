#!/usr/bin/env bun
// App Store Connect API, só o que as builds para o TestFlight precisam.
// Chave em ~/.appstoreconnect/oms-ci.env (ASC_KEY_ID, ASC_ISSUER_ID,
// ASC_KEY_PATH, APPLE_TEAM_ID); nunca escreve a chave em lado nenhum.
//
//   bun asc.ts ensure <bundle id> [nome] [capacidade...]
//                                         regista o bundle id (se faltar) e liga as capacidades
//                                         (APP_GROUPS, PUSH_NOTIFICATIONS, ASSOCIATED_DOMAINS...)
//   bun asc.ts profile <bundle id> [texto...]
//                                         perfil App Store válido, instalado; escreve o nome. Os
//                                         textos (ex.: group.pt.omelhorsite.app) têm de estar no
//                                         perfil, senão faz-se um novo (capacidade ligada depois)
//   bun asc.ts app <bundle id>            sai 0 se a app existe no App Store Connect
//   bun asc.ts builds <bundle id>         últimas builds e o estado
//   bun asc.ts testers <bundle id> [grupo] [email]
//                                         grupo interno (por omissão "OMS") com o dono da conta
//   ASC_PLATFORM=mac bun asc.ts profile <bundle id>
//                                         o mesmo, perfil Mac App Store
//   bun asc.ts installer-cert <csr> <cer> certificado "Mac Installer Distribution" (para o .pkg
//                                         da Mac App Store): cria-o a partir do CSR se não houver
//   bun asc.ts req GET /v1/apps           pedido cru
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HOME = process.env.HOME!;
const envFile = process.env.ASC_ENV || `${HOME}/.appstoreconnect/oms-ci.env`;
const env: Record<string, string> = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "").replace(/^(~|\$HOME|\$\{HOME\})/, HOME)];
    }),
);

const b64u = (b: Uint8Array | string) => (typeof b === "string" ? Buffer.from(b, "utf8") : Buffer.from(b)).toString("base64url");
let jwt = "";
let jwtExp = 0;
async function token() {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now < jwtExp - 60) return jwt;
  const pem = readFileSync(env.ASC_KEY_PATH, "utf8");
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  jwtExp = now + 1100;
  const head = b64u(JSON.stringify({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: jwtExp, aud: "appstoreconnect-v1" }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  jwt = `${head}.${body}.${b64u(new Uint8Array(sig))}`;
  return jwt;
}

export async function api(method: string, path: string, data?: unknown): Promise<any> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: data === undefined ? undefined : typeof data === "string" ? data : JSON.stringify(data),
  });
  const txt = await res.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    if (process.env.ASC_DEBUG) console.error(JSON.stringify(json, null, 2));
    const err = new Error(`${method} ${path} -> ${res.status}: ${(json.errors || []).map((e: any) => e.detail || e.title).join("; ")}`);
    (err as any).status = res.status;
    throw err;
  }
  return json;
}

const q = encodeURIComponent;
export async function bundleIdFor(identifier: string) {
  const r = await api("GET", `/v1/bundleIds?filter[identifier]=${q(identifier)}`);
  const b = r.data.find((x: any) => x.attributes.identifier === identifier);
  if (!b) throw new Error(`bundle id ${identifier} não está registado`);
  return b;
}
export async function appFor(identifier: string) {
  const r = await api("GET", `/v1/apps?filter[bundleId]=${q(identifier)}`);
  return r.data.find((x: any) => x.attributes.bundleId === identifier) ?? null;
}

async function ensure(identifier: string, name?: string, capabilities: string[] = []) {
  let bundle = (await api("GET", `/v1/bundleIds?filter[identifier]=${q(identifier)}`)).data.find(
    (x: any) => x.attributes.identifier === identifier,
  );
  if (!bundle) {
    bundle = (
      await api("POST", "/v1/bundleIds", {
        data: { type: "bundleIds", attributes: { identifier, name: name || identifier.replace(/\./g, " "), platform: "IOS" } },
      })
    ).data;
    console.log(`bundle id ${identifier} registado`);
  }
  const have = new Set(
    (await api("GET", `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`)).data.map((c: any) => c.attributes.capabilityType),
  );
  for (const cap of capabilities) {
    if (have.has(cap)) continue;
    await api("POST", "/v1/bundleIdCapabilities", {
      data: {
        type: "bundleIdCapabilities",
        attributes: { capabilityType: cap },
        relationships: { bundleId: { data: { type: "bundleIds", id: bundle.id } } },
      },
    });
    console.log(`${identifier}: ${cap} ligada`);
  }
}

async function profile(identifier: string, needles: string[] = []) {
  // ASC_PLATFORM=mac: perfil Mac App Store (o resto é igual ao do iOS).
  const mac = process.env.ASC_PLATFORM === "mac";
  const name = `OMS ${mac ? "Mac " : ""}App Store ${identifier}`;
  const bundle = await bundleIdFor(identifier);
  const certs = (await api("GET", `/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=50`)).data.filter(
    (c: any) => new Date(c.attributes.expirationDate).getTime() > Date.now(),
  );
  if (!certs.length) throw new Error("não há certificado Apple Distribution válido (ver docs)");
  const found = (await api("GET", `/v1/profiles?filter[name]=${q(name)}&include=certificates&limit=20`)).data;
  const soon = Date.now() + 14 * 86400e3;
  let p = found.find(
    (x: any) =>
      x.attributes.profileState === "ACTIVE" &&
      new Date(x.attributes.expirationDate).getTime() > soon &&
      needles.every((n) => Buffer.from(x.attributes.profileContent || "", "base64").includes(n)) &&
      certs.every((c: any) => x.relationships?.certificates?.data?.some((d: any) => d.id === c.id)),
  );
  if (!p) {
    for (const old of found) await api("DELETE", `/v1/profiles/${old.id}`);
    p = (
      await api("POST", "/v1/profiles", {
        data: {
          type: "profiles",
          attributes: { name, profileType: mac ? "MAC_APP_STORE" : "IOS_APP_STORE" },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle.id } },
            certificates: { data: certs.map((c: any) => ({ type: "certificates", id: c.id })) },
          },
        },
      })
    ).data;
  }
  const content = Buffer.from(p.attributes.profileContent, "base64");
  for (const dir of [`${HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles`, `${HOME}/Library/MobileDevice/Provisioning Profiles`]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${p.attributes.uuid}.${mac ? "provisionprofile" : "mobileprovision"}`, content);
  }
  console.log(name);
}

async function installerCert(csrPath: string, cerPath: string) {
  const valid = (await api("GET", `/v1/certificates?filter[certificateType]=MAC_INSTALLER_DISTRIBUTION&limit=50`)).data.filter(
    (c: any) => new Date(c.attributes.expirationDate).getTime() > Date.now(),
  );
  if (valid.length) {
    console.log(`já existe: ${valid[0].attributes.name} (até ${valid[0].attributes.expirationDate.slice(0, 10)})`);
    return;
  }
  const csrContent = readFileSync(csrPath, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const c = (
    await api("POST", "/v1/certificates", {
      data: { type: "certificates", attributes: { certificateType: "MAC_INSTALLER_DISTRIBUTION", csrContent } },
    })
  ).data;
  writeFileSync(cerPath, Buffer.from(c.attributes.certificateContent, "base64"));
  console.log(`criado: ${c.attributes.name} (até ${c.attributes.expirationDate.slice(0, 10)})`);
}

async function builds(identifier: string) {
  const app = await appFor(identifier);
  if (!app) throw new Error(`a app ${identifier} ainda não existe no App Store Connect`);
  const r = await api("GET", `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5&include=buildBetaDetail`);
  const details = Object.fromEntries((r.included || []).map((d: any) => [d.id, d.attributes]));
  for (const b of r.data) {
    const d = details[b.relationships?.buildBetaDetail?.data?.id] || {};
    console.log(`${b.attributes.version}\t${b.attributes.processingState}\tinterno: ${d.internalBuildState ?? "?"}\t${b.attributes.uploadedDate}`);
  }
}

async function testers(identifier: string, groupName = "OMS", email?: string) {
  const app = await appFor(identifier);
  if (!app) throw new Error(`a app ${identifier} ainda não existe no App Store Connect`);
  const groups = (await api("GET", `/v1/apps/${app.id}/betaGroups?limit=50`)).data;
  let g = groups.find((x: any) => x.attributes.name === groupName && x.attributes.isInternalGroup);
  if (!g) {
    g = (
      await api("POST", "/v1/betaGroups", {
        data: {
          type: "betaGroups",
          attributes: { name: groupName, isInternalGroup: true, hasAccessToAllBuilds: true },
          relationships: { app: { data: { type: "apps", id: app.id } } },
        },
      })
    ).data;
    console.log(`grupo interno "${groupName}" criado`);
  }
  // O dono da conta (ou o email dado) tem de ser utilizador do App Store Connect.
  const users = (await api("GET", `/v1/users?limit=100`)).data;
  const user = email
    ? users.find((u: any) => u.attributes.username?.toLowerCase() === email.toLowerCase())
    : users.find((u: any) => (u.attributes.roles || []).includes("ACCOUNT_HOLDER")) ?? users[0];
  if (!user) throw new Error("não encontrei o utilizador no App Store Connect");
  const mail = user.attributes.email || user.attributes.username;
  const inGroup = (await api("GET", `/v1/betaGroups/${g.id}/betaTesters?limit=200`)).data;
  if (inGroup.some((t: any) => t.attributes.email?.toLowerCase() === mail.toLowerCase())) {
    console.log(`${user.attributes.firstName} já está no grupo "${groupName}"`);
    return;
  }
  await api("POST", "/v1/betaTesters", {
    data: {
      type: "betaTesters",
      attributes: { email: mail, firstName: user.attributes.firstName, lastName: user.attributes.lastName },
      relationships: { betaGroups: { data: [{ type: "betaGroups", id: g.id }] } },
    },
  });
  console.log(`${user.attributes.firstName} ${user.attributes.lastName} adicionado ao grupo "${groupName}"`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "profile") await profile(args[0], args.slice(1));
    else if (cmd === "installer-cert") await installerCert(args[0], args[1]);
    else if (cmd === "ensure") await ensure(args[0], args[1], args.slice(2));
    else if (cmd === "app") process.exit((await appFor(args[0])) ? 0 : 1);
    else if (cmd === "builds") await builds(args[0]);
    else if (cmd === "testers") await testers(args[0], args[1], args[2]);
    else if (cmd === "req") console.log(JSON.stringify(await api(args[0], args[1], args[2]), null, 2));
    else {
      console.error("uso: asc.ts ensure|profile|app|builds|testers|req ...");
      process.exit(2);
    }
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
}

if (import.meta.main) void main();
