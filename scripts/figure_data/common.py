"""그림 데이터 스크립트가 함께 쓰는 도구. 그림은 브라우저에서 그리고, 이 스크립트들은 예시 데이터를 계산해 assets/figures/<이름>-data.js 로 내보낸다."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'assets' / 'figures'


def write_data(key, data):
    """FigureModules 대기열 규약에 맞춰 데이터 파일을 쓴다. soft-nav가 script를 다시 실행해도 안전하다."""
    OUT.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    path = OUT / f'{key}-data.js'
    path.write_text(f'/* scripts/figure_data/{key}.py 가 만든 파일 - 직접 고치지 않는다 */\n'
                    f'(window.FigureModules = window.FigureModules || []).push(function (F) {{ F.setData({json.dumps(key)}, {body}); }});\n')
    print(f'{path.name}  {path.stat().st_size // 1024} KB')
