// Pemeriksaan ringan sebelum deploy: JSON valid, JS tanpa syntax error,
// dan semua file yang dirujuk index.html benar-benar ada.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let gagal = 0;
const err = (m) => { console.error("✗ " + m); gagal++; };
const ok = (m) => console.log("✓ " + m);

for (const f of ["firebase.json", "database.rules.json", ".firebaserc", "package.json"]) {
  try { JSON.parse(readFileSync(join(root, f), "utf8")); ok(`${f} valid`); }
  catch (e) { err(`${f}: ${e.message}`); }
}

const jsDir = join(root, "assets/js");
for (const f of readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
  try { execFileSync(process.execPath, ["--check", join(jsDir, f)], { stdio: "pipe" }); ok(`${f} sintaks OK`); }
  catch (e) { err(`${f}: ${e.stderr?.toString().trim() || e.message}`); }
}

const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const ref = m[1];
  if (/^(https?:|data:|mailto:)/.test(ref)) continue;
  if (existsSync(join(root, ref.split("?")[0]))) ok(`rujukan ${ref}`);
  else err(`rujukan hilang: ${ref}`);
}

process.exit(gagal ? 1 : 0);
