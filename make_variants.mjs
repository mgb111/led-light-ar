// make_variants.mjs
// Node 18+ required (global fetch). Generates two GLBs from the source:
// - light_off.glb (no emissive)
// - light_on.glb (warm white emissive)

import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';

const SOURCE_URL = 'https://pub-e46fd816b4ee497fb2f639f180c4df20.r2.dev/light_led_bulb.glb';
const OUT_OFF = 'light_off.glb';
const OUT_ON = 'light_on.glb';

const WARM_WHITE = [1.0, 0.95, 0.8];

async function loadGLBFromURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download GLB: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  const io = new NodeIO();
  return io.readBinary(new Uint8Array(ab));
}

function findTargetMaterials(document) {
  const root = document.getRoot();
  const mats = root.listMaterials();
  const targets = mats.filter(m => /bulb|glass|emissive|lamp|light/i.test(m.getName() || ''));
  return targets.length ? targets : mats;
}

function setEmissive(materials, rgb) {
  materials.forEach(m => {
    try {
      const current = m.getEmissiveFactor?.() ?? [0,0,0];
      m.setEmissiveFactor?.(rgb);
    } catch {}
  });
}

function stripPunctualLights(document) {
  // Remove KHR_lights_punctual if present to keep consistency across viewers
  const root = document.getRoot();
  const used = root.listExtensionsUsed();
  used.forEach(ext => {
    if ((ext?.extensionName || '').toLowerCase() === 'khr_lights_punctual') {
      try { root.removeExtension(ext); } catch {}
    }
  });
}

async function writeGLB(document, outPath) {
  const io = new NodeIO();
  await io.write(outPath, document);
}

async function main() {
  console.log('Downloading source GLB...');
  const baseDoc = await loadGLBFromURL(SOURCE_URL);

  // OFF variant
  console.log('Creating OFF variant...');
  const offDoc = baseDoc.clone();
  stripPunctualLights(offDoc);
  setEmissive(findTargetMaterials(offDoc), [0, 0, 0]);
  // Remove emissive strength extension if present
  try {
    const ext = offDoc.getRoot().listExtensionsUsed().find(e => (e?.extensionName||'').toLowerCase() === 'khr_materials_emissive_strength');
    if (ext) offDoc.getRoot().removeExtension(ext);
  } catch {}
  await writeGLB(offDoc, OUT_OFF);
  console.log(`Wrote ${OUT_OFF}`);

  // ON variant
  console.log('Creating ON variant...');
  const onDoc = baseDoc.clone();
  stripPunctualLights(onDoc);
  setEmissive(findTargetMaterials(onDoc), WARM_WHITE);
  // Apply emissive strength extension to boost brightness
  try {
    const ext = onDoc.createExtension(KHRMaterialsEmissiveStrength);
    const root = onDoc.getRoot();
    const mats = root.listMaterials();
    mats.forEach(m => {
      const es = ext.createEmissiveStrength().setEmissiveStrength(2.5);
      m.setExtension('KHR_materials_emissive_strength', es);
    });
  } catch {}
  await writeGLB(onDoc, OUT_ON);
  console.log(`Wrote ${OUT_ON}`);

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
