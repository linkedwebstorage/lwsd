#!/usr/bin/env bash
#
# Touchstone conformance scoreboard — run Erich Bremer's harness against lwsd.
#
#   scripts/touchstone.sh [--module all|core|auth|core/containers|<test-id>]
#                         [--port N] [--ref <touchstone git ref>]
#                         [--reports DIR] [--capabilities A,B] [--no-build]
#
# Starts JSS with the lws plugin at /lws on a throwaway data directory as an
# "open target" (anonymous writes, no capabilities declared), runs Touchstone
# against http://127.0.0.1:PORT/lws/, and leaves the EARL / HTML / JUnit /
# Markdown reports under $REPORTS. The server is stopped on exit.
#
# Runs the harness with Docker if present, otherwise builds the CLI jar with
# the bundled Maven wrapper (needs a JDK 21+). Touchstone is cloned into
# .touchstone/src (gitignored) at $REF.
#
# Exit codes follow Touchstone:
#   0  conformant            1  non-conformant (a verdict was reached)
#   2  no verdict — harness misconfigured or server unreachable
#
# JSS_BIN picks the jss to run (default: node_modules/.bin/jss, else `jss`),
# same as `npm test`. Alice and bob send no credentials on an open target, so
# the auth suites, access grants and webhooks are reported inapplicable; set
# TOUCHSTONE_TOKEN_ALICE / TOUCHSTONE_TOKEN_BOB and --capabilities
# Authentication to exercise them (CONFORMANCE.md C12 for why that's partial).

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODULE=all
PORT=auto
# master's Dockerfile omits the harness-clients module added in 7b13c27
# (ebremer/touchstone#2, fix in #3). Last commit before that. Move to master
# or a tag once the fix has landed.
REF=5c49679385de2ec087787a46e533cb741c018274
REPORTS="$ROOT/.touchstone/runs"
CAPABILITIES=""
BUILD=1
AUTH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --module)       MODULE=$2; shift 2 ;;
    --port)         PORT=$2; shift 2 ;;
    --ref)          REF=$2; shift 2 ;;
    --reports)      REPORTS=$2; shift 2 ;;
    --capabilities) CAPABILITIES=$2; shift 2 ;;
    --no-build)     BUILD=0; shift ;;
    --auth)         AUTH=1; shift ;;
    -h|--help)      sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

JSS_BIN=${JSS_BIN:-$ROOT/node_modules/.bin/jss}
command -v "$JSS_BIN" >/dev/null 2>&1 || JSS_BIN=jss
# jss moves to another port when the requested one is busy (Vite-style), and
# the harness would then test whatever else is on --port. Default to a free
# one; an explicit --port is checked and refused if taken.
if [ "$PORT" = auto ]; then
  PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
elif curl -s -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
  echo "port $PORT is already in use; pick another with --port" >&2; exit 2
fi
SRC="$ROOT/.touchstone/src"
WORK=$(mktemp -d -t lwsd-touchstone.XXXXXX)
DATA="$WORK/data"
BASE_URL="http://127.0.0.1:$PORT/lws/"
JSS_PID=""

cleanup() {
  if [ -n "$JSS_PID" ] && kill -0 "$JSS_PID" 2>/dev/null; then
    kill "$JSS_PID" 2>/dev/null || true
    wait "$JSS_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- which runner -----------------------------------------------------------

RUNNER=""
if command -v docker >/dev/null 2>&1; then
  RUNNER=docker
elif command -v java >/dev/null 2>&1; then
  jv=$(java -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')
  if [ "${jv:-0}" -ge 21 ] 2>/dev/null; then RUNNER=jar; fi
fi
if [ -z "$RUNNER" ]; then
  echo "need either docker or a JDK 21+ on PATH to run Touchstone" >&2
  exit 2
fi

# --- fetch touchstone -------------------------------------------------------

if [ ! -d "$SRC/.git" ]; then
  mkdir -p "$(dirname "$SRC")"
  git clone -q https://github.com/ebremer/touchstone "$SRC"
fi
git -C "$SRC" fetch -q origin
git -C "$SRC" checkout -q --detach "$REF"
echo "touchstone: $(git -C "$SRC" log -1 --format='%h %ad %s' --date=short)"

# --- build ------------------------------------------------------------------

if [ "$BUILD" = 1 ]; then
  if [ "$RUNNER" = docker ]; then
    docker build -q -t touchstone-harness:local "$SRC" >/dev/null
  else
    (cd "$SRC" && ./mvnw -q -B -ntp -pl harness-cli -am -Dmaven.test.skip=true package)
  fi
fi

# --- start lwsd (jss + lws plugin) ----------------------------------------------
#
# Open target (default): anonymous writes, nothing declared. With --auth:
# public read off, alice (a did:key minted here) the only writer, and the
# harness given alice's and bob's access tokens from our own authorization
# server, so the Authentication capability can be declared. Tokens are
# minted for an hour so a run never outlives them; the draft's 300 s
# default stays for everyone else.

mkdir -p "$DATA"
if [ "$AUTH" = 1 ]; then
  ALICE_DID=$(node "$ROOT/scripts/mint-token.js" --key "$WORK/alice.jwk" --emit-did)
  # The harness hosts the CID documents and the OpenID Provider the auth
  # suites dereference (ReachableFixtures) on a loopback port of our
  # choosing; the CID / OIDC verifiers must be allowed to fetch loopback.
  FIXTURES_PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
  FIXTURES_URL="http://127.0.0.1:$FIXTURES_PORT/"
  # The authorization server's key is generated here and handed to the
  # harness too (HarnessIssuedTokens), so it can mint tokens with one chosen
  # defect — wrong audience, wrong issuer, expired — that only the key
  # holder can produce. A throwaway key in a throwaway directory.
  node -e "const {generateKeyPairSync,createHash}=require('crypto');const k=generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});k.kid=createHash('sha256').update(JSON.stringify({crv:k.crv,kty:k.kty,x:k.x,y:k.y})).digest('base64url');k.alg='ES256';process.stdout.write(JSON.stringify(k))" > "$WORK/as.jwk"
  AS_JWK=$(cat "$WORK/as.jwk")
  # Page size 4 so the pagination tests apply (they need a five-member
  # container to split).
  LWS_PUBLIC_READ=0 LWS_WRITERS="$ALICE_DID" LWS_AS_TOKEN_LIFETIME=3600 LWS_CID_ALLOW_LOOPBACK=1 \
  LWS_AS_KEY_JWK="$WORK/as.jwk" LWS_PAGE_SIZE=4 \
    "$JSS_BIN" start --port "$PORT" --host 127.0.0.1 --root "$DATA" \
    --public --no-git --no-idp --plugin "$ROOT/lws/plugin.js@/lws" > "$WORK/jss.log" 2>&1 &
else
  LWS_ANON_WRITES=1 "$JSS_BIN" start --port "$PORT" --host 127.0.0.1 --root "$DATA" \
    --public --no-git --no-idp --plugin "$ROOT/lws/plugin.js@/lws" > "$WORK/jss.log" 2>&1 &
fi
JSS_PID=$!
# Up means "answers HTTP at all": with --auth the root is a 401, not a 200.
up() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL")" != 000 ]; }
for _ in $(seq 1 60); do
  up && break
  if ! kill -0 "$JSS_PID" 2>/dev/null; then
    echo "jss exited during startup:" >&2; cat "$WORK/jss.log" >&2; exit 2
  fi
  sleep 0.5
done
up || { echo "lwsd did not come up on $BASE_URL" >&2; cat "$WORK/jss.log" >&2; exit 2; }
echo "lwsd: jss $("$JSS_BIN" --version) + lws plugin at $BASE_URL"
TARGET_URL="$BASE_URL"

if [ "$AUTH" = 1 ]; then
  # alice's key is the one the server was told about; bob's is fresh. Both
  # go through the real token exchange, so the tokens are what any client
  # would hold. The harness reads them by name from its environment.
  eval "$(node "$ROOT/scripts/mint-token.js" "$BASE_URL" --key "$WORK/alice.jwk" --env alice --ttl 3600)"
  eval "$(node "$ROOT/scripts/mint-token.js" "$BASE_URL" --key "$WORK/bob.jwk" --env bob --ttl 3600)"
  export TOUCHSTONE_TOKEN_ALICE TOUCHSTONE_WEBID_ALICE TOUCHSTONE_TOKEN_BOB TOUCHSTONE_WEBID_BOB
  CAPABILITIES="${CAPABILITIES:+$CAPABILITIES,}Authentication,ReachableFixtures,HarnessIssuedTokens"
  # The target is a container inside the storage, not the storage URI: the
  # storage URI answers its (public) description to an anonymous GET, while
  # the harness learns the authorization server from the 401 that an
  # anonymous GET of the target gives. targets.md: "a container in the
  # storage under test … the storage root is the usual choice" — not here.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL" -H "Authorization: Bearer $TOUCHSTONE_TOKEN_ALICE" \
    -H 'Slug: harness' -H 'Link: <https://www.w3.org/ns/lws#Container>; rel="type"')
  [ "$code" = 201 ] || { echo "could not create the harness container as alice: $code" >&2; exit 2; }
  TARGET_URL="${BASE_URL}harness/"
  echo "auth: alice=$TOUCHSTONE_WEBID_ALICE bob=$TOUCHSTONE_WEBID_BOB (capabilities: $CAPABILITIES; fixtures at $FIXTURES_URL)"
fi

# --- run --------------------------------------------------------------------

mkdir -p "$REPORTS"
caps=""
for c in ${CAPABILITIES//,/ }; do caps="${caps:+$caps, }$c"; done
printf 'targets:\n  sut:\n    baseUrl: "%s"\n    adapter: env\n    capabilities: [%s]\n' \
  "$TARGET_URL" "$caps" > "$WORK/targets.yaml"
if [ -n "${FIXTURES_URL:-}" ]; then
  printf '    properties:\n      fixtures.baseUrl: "%s"\n      as.signingKey: '"'"'%s'"'"'\n' "$FIXTURES_URL" "$AS_JWK" >> "$WORK/targets.yaml"
else
  printf '    properties: {}\n' >> "$WORK/targets.yaml"
fi

set +e
if [ "$RUNNER" = docker ]; then
  cp "$WORK/targets.yaml" "$REPORTS/targets.yaml"
  docker run --rm --network host --user "$(id -u):$(id -g)" \
    -e TOUCHSTONE_TOKEN_ALICE -e TOUCHSTONE_TOKEN_BOB \
    -e TOUCHSTONE_WEBID_ALICE -e TOUCHSTONE_WEBID_BOB \
    -v "$REPORTS:/work" \
    touchstone-harness:local \
    run --target sut --module "$MODULE" \
        --targets /work/targets.yaml --report-dir /work \
        --catalog catalog --definitions definitions
else
  (cd "$SRC" && java -jar harness-cli/target/touchstone.jar \
    run --target sut --module "$MODULE" \
        --targets "$WORK/targets.yaml" --report-dir "$REPORTS" \
        --catalog catalog --definitions definitions)
fi
code=$?
set -e

latest=$(ls -td "$REPORTS"/*/ 2>/dev/null | head -1)
echo
case $code in
  0) echo "conformant" ;;
  1) echo "not conformant (a verdict was reached — this is the scoreboard)" ;;
  *) echo "no verdict (exit $code): harness misconfigured or server unreachable" >&2
     echo "--- jss log" >&2; cat "$WORK/jss.log" >&2 ;;
esac
[ -n "$latest" ] && echo "reports: $latest"
exit "$code"
