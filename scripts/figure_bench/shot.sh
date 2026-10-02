#!/bin/bash
# 그림 점검: 헤드리스 Chrome으로 scripts/figure_bench/fig.html 을 열어 스크린샷을 찍는다. Jekyll 서버는 필요 없다.
# 사용: scripts/figure_bench/shot.sh "<쿼리>" <출력.png> [창 폭=720] [창 높이=2400]
# 쿼리: name=그림이름,… (all이면 정의된 모든 그림)  t=시각(ms)·end·auto6 (콤마로 여러 장면)  w=글 폭(px, 기본 660)
# 예: scripts/figure_bench/shot.sh "name=percentile&t=auto6&w=660" /tmp/p.png 720 3000
# 시험마다 따로 만든 프로필로 Chrome을 띄워 여러 개를 동시에 돌려도 부딪히지 않는다. 그림 파일이 써지면 Chrome을 끝낸다.
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$2"; PROFILE=$(mktemp -d); rm -f "$OUT"
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --no-first-run --disable-extensions --user-data-dir="$PROFILE" \
  --window-size=${3:-720},${4:-2400} --virtual-time-budget=6000 --screenshot="$OUT" "file://$DIR/fig.html?$1" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 120); do [ -s "$OUT" ] && break; sleep 0.5; done
sleep 0.5; kill $PID 2>/dev/null; pkill -f "user-data-dir=$PROFILE" 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$PROFILE"
[ -s "$OUT" ] && echo "$OUT" || { echo "스크린샷 실패" >&2; exit 1; }
