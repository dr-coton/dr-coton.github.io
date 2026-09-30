#!/usr/bin/env bash
# 글 썸네일 만들기: Codex의 내장 이미지 생성(gpt-image)으로 그림을 그리고,
# assets/thumbs/<슬러그>.jpg 로 저장한 뒤 글 front matter에 thumb: 를 넣는다.
# 사용법: scripts/thumb.sh commit-message debugging-observe   (이미 있으면 건너뜀, 다시 만들려면 jpg를 지우세요)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/thumbs

for slug in "$@"; do
  post="_writings/$slug.md"; png="assets/thumbs/$slug.png"; jpg="assets/thumbs/$slug.jpg"
  [ -f "$post" ] || { echo "없는 글: $post" >&2; exit 1; }
  [ -f "$jpg" ] && { echo "건너뜀(이미 있음): $slug"; continue; }

  # 스타일 규칙은 scripts/thumb-style.txt 한 곳에서 관리 (ChatGPT에서 직접 만들 때도 같은 파일을 붙여 넣으세요)
  codex exec --skip-git-repo-check -s workspace-write -C "$PWD" "Use the built-in image_gen tool (imagegen skill) to make one blog thumbnail.
Read $post (title, topic, description, body) and pick the subject from it.
$(cat scripts/thumb-style.txt)
Save the final image to $png (move it from \$CODEX_HOME/generated_images if needed). Do nothing else."

  [ -f "$png" ] || { echo "이미지 생성 실패: $slug" >&2; exit 1; }
  sips -s format jpeg -s formatOptions 85 -Z 1200 "$png" --out "$jpg" >/dev/null && rm "$png"
  if ! grep -q '^thumb:' "$post"; then
    awk -v t="thumb: /assets/thumbs/$slug.jpg" 'NR==1{print; print t; next} 1' "$post" > "$post.tmp" && mv "$post.tmp" "$post"
  fi
  echo "완료: $slug"
done
