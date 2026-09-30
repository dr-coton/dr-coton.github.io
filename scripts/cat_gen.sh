#!/usr/bin/env bash
# 고양이 스프라이트 원본 시트 만들기: Codex의 내장 이미지 생성(gpt-image)으로 마젠타 배경 시트를 그린다.
# 사용법: scripts/cat_gen.sh <jango|deuri> <model|a|b|c> <출력폴더> [번호]
#   번호를 주면 <고양이>_<시트><번호>.png 로 따로 저장한다(한 줄만 다시 뽑을 때. cat_sprites.py 의 FIX 의 src 참고)
#   model: 캐릭터 기준 시트(3x2). 참고 이미지로 <출력폴더>/<고양이>_ref.png(예전 스프라이트나 사진)가 있으면 붙인다.
#   a|b|c: 동작 시트(6x4). <출력폴더>/<고양이>_model.png 를 참고 이미지로 붙여 같은 그림체를 유지한다.
# 결과: <출력폴더>/<고양이>_<시트>.png  → scripts/cat_sprites.py 로 정리한다(README 참고).
set -euo pipefail
cd "$(dirname "$0")/.."
cat=$1 sheet=$2 dir=$(cd "$3" && pwd)
out="$dir/${cat}_$sheet${4:-}.png"

case $cat in
  jango) desc="Jango: a chubby, round, heavy-set tabby cat. Warm brown and grey mackerel tabby stripes mixed with orange/ginger patches, white chest, white muzzle and white front paws, yellow-green eyes, pink nose. Short thick legs, big round belly, relaxed and slow." ;;
  deuri) desc="Deuri: a normal, slim, agile tabby cat. Dark brown mackerel tabby stripes on a grey-brown coat, a white blaze running from the nose up between the eyes, white chest and white paws, amber-green eyes, pink nose. Longer legs and a longer tail than a chubby cat, alert and quick." ;;
  *) echo "고양이는 jango 또는 deuri" >&2; exit 1 ;;
esac

# 행 순서는 assets/cats.js 의 ROW 와 scripts/cat_sprites.py 의 SHEETS 와 같아야 한다
case $sheet in
  model) prompt=$(cat scripts/cat-model-prompt.txt); ref="$dir/${cat}_ref.png" ;;
  a) rows="Row 1, standing up from sitting: (1) sitting upright calm; (2) front legs straight, hips starting to lift; (3) hips half raised; (4) almost standing; (5) standing on all four paws; (6) standing relaxed, tail curved up.
Row 2, walk cycle that loops (frame 6 flows back into frame 1), like a classic 2D game walk cycle: the legs move in diagonal pairs while the body, head and tail stay in exactly the same place and height in every frame; the tail is held up in a relaxed curve exactly like the standing pose on the model sheet. (1) near front leg and far hind leg stretched forward, the other two stretched back, a long stride; (2) the same legs halfway, closer together; (3) all four legs passing under the body; (4) the other pair forward: far front leg and near hind leg stretched forward, the other two back; (5) those legs halfway, closer together; (6) all four legs passing under the body again.
Row 3, run cycle that loops: a gallop. (1) legs gathered under the body; (2) front legs reaching forward; (3) fully stretched, front legs forward and back legs back; (4) front paws touching down; (5) back legs swinging forward under the body; (6) gathered again. Tail streams behind.
Row 4, standing idle: (1) standing calm; (2) standing with the head turned to face the viewer; (3) standing with the nose lowered to sniff the ground; (4) sniffing, nose moved slightly; (5) standing with the tail straight up (happy greeting); (6) standing, eyes closed in a slow blink." ;;
  b) rows="Row 1, sitting idle, the body stays still and only the head, eyes or tail change: (1) calm; (2) eyes closed in a content blink; (3) head turned to face the viewer; (4) looking up; (5) tail tip lifted and curled; (6) big yawn, eyes shut, mouth open showing the pink tongue.
Row 2, grooming while sitting: (1) lifting the near front paw to the mouth; (2) licking the paw with a tiny pink tongue; (3) rubbing the paw over the ear and face; (4) paw rubbing down the cheek; (5) head bent down licking the white chest; (6) licking the paw again.
Row 3, lying down: (1) sitting upright calm; (2) front legs sliding forward, body lowering; (3) loaf pose, paws tucked under the chest, eyes open; (4) loaf, eyes half closed; (5) loaf, eyes closed, head a little lower, dozing; (6) starting to curl up, head turning toward the tail.
Row 4, sleeping curled into a round ball, eyes closed, all six almost identical: (1) breathing in, body a little taller; (2) breathing out, body a little lower; (3) like 1 with one ear twitched; (4) like 2 with the tail tip moved; (5) like 1; (6) like 2 with a front paw covering the eyes." ;;
  c) rows="Row 1, waking stretch: (1) sitting upright calm; (2) standing up; (3) front stretch like a play bow: front legs stretched far forward on the ground, chest low, hips high, tail up; (4) deeper bow with a yawn, mouth open; (5) back stretch: body forward, one hind leg stretched straight back; (6) standing relaxed.
Row 2, jump: (1) crouching low, ready to spring; (2) launching, body stretched diagonally up, hind legs pushing off; (3) rising, front paws reaching up; (4) at the peak, legs tucked under the body; (5) falling, front legs reaching down; (6) landing, legs bent, body low.
Row 3, pounce play: (1) crouching low and stalking, eyes wide, tail low; (2) crouched with the hips raised, wiggling; (3) same wiggle with the hips shifted; (4) pouncing forward through the air, body stretched, front paws forward; (5) landed with both front paws pressed on the ground; (6) sitting up and batting one front paw up into the air.
Row 4, kneading while standing in place with happy half-closed eyes: (1) near front paw pressing down; (2) paws level; (3) far front paw pressing down; (4) paws level; (5) near paw down, eyes closed; (6) far paw down, eyes closed." ;;
  *) echo "시트는 model, a, b, c 중 하나" >&2; exit 1 ;;
esac
if [ "$sheet" != model ]; then # 투명 배경은 참고 이미지로 넘기면 검게 보일 수 있어 종이색 위에 얹어서 붙인다
  prompt=$(cat scripts/cat-anim-prompt.txt); ref="$dir/.${cat}_model_flat.png"
  python3 -c "import sys; from PIL import Image; m=Image.open(sys.argv[1]).convert('RGBA'); b=Image.new('RGBA', m.size, (250, 250, 246, 255)); b.alpha_composite(m); b.convert('RGB').save(sys.argv[2])" "$dir/${cat}_model.png" "$ref"
fi

img=(); [ -f "$ref" ] && img=(--image "$ref")
prompt=${prompt//@ROWS@/${rows:-}}; prompt=${prompt//@CAT@/$desc}; prompt=${prompt//@OUT@/$out}
rm -f "$out"
# ChatGPT 로그인으로 쓸 수 있는 모델을 고른다(설정의 기본 모델이 안 되는 경우가 있다)
printf '%s\n' "$prompt" | codex exec -m gpt-5.5 --skip-git-repo-check -s workspace-write -C "$dir" ${img[@]+"${img[@]}"} - > "${out%.png}.log" 2>&1 || true
[ -f "$out" ] && echo "완료: $out" || { echo "실패: $cat $sheet (로그: ${out%.png}.log)" >&2; exit 1; }
