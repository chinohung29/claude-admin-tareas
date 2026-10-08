#!/usr/bin/env bash
# Pruebas del agente sin red ni claves: base de datos y SerpApi simulados. Requiere Node 22+.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
FN="$AQUI/.."
TMP="$(mktemp -d)"
cp "$FN/logica.ts" "$TMP/logica.ts"
sed "s#'jsr:@supabase/supabase-js@2'#'./stub.ts'#" "$FN/index.ts" > "$TMP/index.ts"
cp "$AQUI/stub.ts" "$TMP/stub.ts"
cp "$AQUI/orquestacion.test.ts" "$TMP/run.ts"
echo "== lógica pura =="; node --experimental-strip-types "$FN/logica.test.mts" 2>&1 | grep -v ExperimentalWarning
echo "== orquestación (base y SerpApi simulados) =="; (cd "$TMP" && node --experimental-strip-types run.ts 2>&1 | grep -E "^ok|^TODAS|Error|expected|actual")
rm -rf "$TMP"
