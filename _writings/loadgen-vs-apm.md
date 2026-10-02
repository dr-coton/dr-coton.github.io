---
thumb: /assets/thumbs/loadgen-vs-apm.jpg
title: k6는 느리다는데 APM은 멀쩡할 때
topic: 개발
description: 부하테스트에서 k6 응답시간과 APM 응답시간이 다를 때, k6의 구간별 지표로 원인이 서버인지 네트워크, 보안장비, 부하발생기인지 가려내는 방법을 실험과 그림으로 정리했습니다.
---

<script src="{{ '/assets/figures/loadgen-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen1-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen2-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-common.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-1.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-2.js' | relative_url }}"></script>

부하테스트 결과를 열었더니 k6의 응답시간 p95가 3초인 장면을 가정해 보겠습니다. 같은 시간대 APM에서 WAS의 응답시간은 200ms 안팎이에요. 서버는 빠르게 처리했다는데 부하발생기는 느리다고 말합니다. 어느 쪽이 맞을까요?

둘 다 맞습니다. 재는 구간이 다르거든요. APM은 요청이 WAS에 도착한 뒤를 재고, k6는 부하발생기에서 출발해 응답이 돌아올 때까지를 잽니다. 그 사이에는 회선, 방화벽과 WAF 같은 보안장비, 로드밸런서가 있고, 부하발생기 자신도 있어요.

이 차이가 문제가 되는 때는 두 가지입니다. 하나는 WAS에 바로 부하를 줘서 이 구간들이 시험에 아예 들어오지 않은 경우예요. 서버 기준으로는 문제가 없는데 실제 사용자 경로에서만 문제가 생깁니다. 다른 하나는 반대로 부하발생기가 밀려서 느려진 숫자를 서버 문제로 읽는 경우입니다.

이 글에서는 k6가 응답시간을 쪼개서 보여주는 지표로 시간이 어디서 쓰였는지 찾는 방법을 다룹니다. 지표마다 뜻을 풀고, 높아졌을 때 의심할 곳을 실험 결과와 함께 보여줘요.

결론부터 말하면, k6 숫자와 APM 숫자는 다른 구간을 재니 한 숫자만 보고 서버 탓이나 네트워크 탓을 하지 않습니다. k6의 구간별 지표와 서버가 보고한 시간을 나란히 놓고 어느 구간이 커졌는지 봅니다. 그리고 WAS에 바로 쏘는 시험과 실제 사용자 경로로 쏘는 시험을 모두 하고, 둘의 차이를 구간별로 읽습니다.

이 글의 ‘실험’ 그림은 로컬(macOS, 12코어) 환경에서 k6 v1.4.2로 파이썬 가짜 서버를 때려서 얻은 값입니다. 서버가 일부러 지연을 만들었을 뿐 실제 네트워크나 보안장비가 아니에요. ‘모식도’와 ‘계산’은 예시 값과 계산식으로 그렸습니다.

## APM과 k6는 요청의 서로 다른 구간을 잽니다

흔한 구성을 그려 보면 이렇습니다. 외부 부하발생기에서 출발한 요청은 방화벽과 WAF, 로드밸런서를 지나 WAS에 닿고, WAS는 DB를 부릅니다.

<figure class="fig-figure">
  <div class="fig" data-fig="path" role="group" aria-label="왼쪽부터 외부 부하발생기, 방화벽과 WAF, 로드밸런서, WAS, DB가 화살표로 이어져 있습니다. 파란 괄호는 부하발생기에서 WAS까지를 k6가 재는 구간으로, 초록 괄호는 WAS와 DB만을 APM이 재는 구간으로 표시합니다. 위쪽의 내부 부하발생기는 WAS로 바로 연결되며, 이 시험에는 방화벽과 로드밸런서와 바깥 구간이 없다고 적혀 있습니다."></div>
  <figcaption>요청이 지나가는 길과 k6, APM이 재는 구간 (모식도)</figcaption>
</figure>

파란 괄호가 k6가 재는 구간이고 초록 괄호가 APM이 재는 구간입니다. APM은 보통 WAS 안에서 앱이 요청을 받은 뒤 응답을 쓸 때까지를 재요. 제품과 설정에 따라 시작과 끝 지점은 조금씩 다릅니다. 주황색 화살표는 WAS에 바로 쏘는 시험이에요. 이 시험에서는 방화벽, 로드밸런서, 바깥 구간이 시험 경로에 없습니다.

요청 하나가 이 길을 지날 때 시간이 어떻게 쌓이는지 예시 값으로 따라가 보겠습니다. 왕복 30ms, 보안장비의 검사 60ms, 서버가 일한 시간 120ms라고 가정했어요.

<figure class="fig-figure">
  <div class="fig" data-fig="journey" role="group" aria-label="요청 알갱이가 부하발생기에서 방화벽, 로드밸런서, WAS로 움직이는 동안 아래 막대가 차례로 채워집니다. 연결 30ms, TLS 60ms, 보내기 2ms, 기다림 210ms, 받기 8ms입니다. 기다림 210ms는 왕복 30ms, 장비 검사 60ms, 서버 120ms로 나뉘고 서버 120ms만 APM이 잽니다. 마지막에 k6 duration은 220ms, APM은 120ms, 연결 90ms는 duration 밖이라고 표시됩니다."></div>
  <figcaption>요청 하나가 지나가는 동안 쌓이는 시간 (모식도, 예시 값)</figcaption>
</figure>

여기서 볼 것은 아래 막대와 초록 괄호입니다. 서버는 120ms에 처리했고 APM에는 120ms가 찍혀요. 그런데 k6가 보고하는 응답시간(duration)은 220ms입니다. 차이 100ms는 왕복 30ms와 장비 검사 60ms에 보내기와 받기 10ms가 더해진 값이고, 서버가 느려서 생긴 시간이 아니에요. 연결에 쓴 90ms는 duration에 들어가지도 않습니다. 이 이유는 다음 절에서 봅니다.

## k6는 요청 하나를 구간별로 나눠 잽니다

k6는 요청 하나를 이런 구간으로 나눠서 지표로 남깁니다. 정의는 [k6 문서](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)를 따랐습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="timeline" role="group" aria-label="connecting, TLS, sending, waiting, receiving 다섯 구간이 이어진 막대입니다. connecting과 TLS를 묶는 괄호는 http_req_blocked이고, sending과 waiting과 receiving을 묶는 괄호는 http_req_duration입니다. 아래에 blocked는 http_req_duration에 들어가지 않고, 연결을 재사용하면 connecting과 tls는 0이라고 적혀 있습니다."></div>
  <figcaption>k6가 요청 하나를 나눠 재는 구간 (모식도, 길이는 실제 비율이 아님)</figcaption>
</figure>

| 지표 | 뜻 |
| --- | --- |
| http_req_blocked | 연결을 얻을 때까지 기다린 시간 |
| http_req_connecting | TCP 연결을 맺는 시간 |
| http_req_tls_handshaking | TLS 핸드셰이크 시간 |
| http_req_sending | 요청을 보내는 시간 |
| http_req_waiting | 응답의 첫 바이트가 올 때까지 기다린 시간 (TTFB) |
| http_req_receiving | 응답을 받는 시간 |
| http_req_duration | sending + waiting + receiving |
| http_req_failed | 실패한 요청의 비율 |
| dropped_iterations | 시작하지 못한 반복의 수 |

duration에는 blocked, connecting, tls가 빠져 있다는 점이 가장 중요합니다. 문서도 duration이 DNS 조회와 연결 시간을 뺀 값이라고 적어요. 그래서 duration만 보면 연결 쪽 문제가 보이지 않습니다.

blocked는 문서에 ‘연결 슬롯을 기다린 시간’이라고 짧게 적혀 있는데, [k6 소스 코드](https://github.com/grafana/k6/blob/master/lib/netext/httpext/tracer.go)에서는 연결을 달라고 요청한 시점부터 받은 시점까지입니다. 새 연결이면 TCP 연결과 TLS 핸드셰이크가 이 안에서 일어나요. 실험에서도 TLS로 새 연결을 맺는 요청의 blocked는 7ms였고, connecting 0.8ms와 tls_handshaking 6.2ms를 더한 값과 같았습니다. DNS 조회가 어디에 잡히는지는 문서에 없고 이 글에서는 확인하지 못했습니다.

기본 요약에는 구간별 지표가 나오지 않는 점도 알아 두셔야 합니다. k6 v1.4.2의 기본 요약(compact)에는 http_req_duration, http_req_failed, http_reqs 정도만 나오고 blocked, connecting, sending, waiting 같은 구간별 지표는 빠져 있습니다. `--summary-mode=full`로 실행해야 보여요. 평균과 p95만 보려면 `--summary-trend-stats="avg,p(95)"`를 함께 씁니다. 아래는 서버가 50ms 일하고 보안장비가 450ms 검사하는 요청을 3 VU로 6초 돌린 결과입니다.

```text
# k6 run --summary-mode=full \
#   --summary-trend-stats="avg,p(95)"
# (로컬 실행 결과, 일부)
    CUSTOM
    server_time....................: avg=51.27ms  p(95)=51.6ms

    HTTP
    http_req_blocked...............: avg=33.49µs  p(95)=324.5µs
    http_req_connecting............: avg=23.77µs  p(95)=280µs
    http_req_duration..............: avg=503.1ms  p(95)=503.46ms
    http_req_failed................: 0.00%  0 out of 36
    http_req_receiving.............: avg=58.13µs  p(95)=123.75µs
    http_req_sending...............: avg=28.33µs  p(95)=46.74µs
    http_req_tls_handshaking.......: avg=0s       p(95)=0s
    http_req_waiting...............: avg=503.01ms p(95)=503.39ms
```

여기서 볼 것은 세 줄입니다. duration 503.1ms는 waiting 503.01ms와 거의 같고, sending과 receiving은 마이크로초 단위예요. 그런데 `server_time`(서버가 보고한 시간)은 51ms입니다. 시간이 대부분 waiting에 있는데 서버는 그 10분의 1만 썼다는 뜻이고, 이 차이는 뒤에서 waiting을 다룰 때 자세히 봅니다. 이 duration이 sending + waiting + receiving과 같다는 것은 실험한 모든 경우에서 0.2ms 안쪽으로 맞았어요.

## 연결을 맺는 데 쓴 시간은 duration에 들어가지 않습니다

먼저 새 연결을 맺는 구간부터 보겠습니다. connecting은 TCP 연결을, tls_handshaking은 TLS 협상을 재는 지표이고, 연결을 재사용하면 둘 다 0입니다. 새 연결이 필요한 요청이 많아질수록 이 시간이 크게 쌓여요.

이 구간을 키우려면 TLS를 끝내는 장비가 느린 상황을 가정하면 됩니다. 연결은 바로 받지만 TLS 협상은 300ms 뒤에야 시작하는 가짜 장비를 앞에 두고, 세 경우를 비교했습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="tls" role="group" aria-label="세 경우의 blocked 막대와 duration 막대를 비교합니다. 지연 없이 요청마다 새 연결을 맺으면 blocked 7ms, duration 55ms입니다. 연결 지연 300ms에서 요청마다 새 연결을 맺으면 blocked만 316ms로 길어지고 duration은 54ms입니다. 같은 지연에서 연결을 재사용하면 blocked 3ms, duration 54ms입니다."></div>
  <figcaption>세 경우의 blocked와 duration (실험, 평균)</figcaption>
</figure>

위 막대가 blocked(청록은 connecting, 보라는 TLS), 아래 막대가 duration입니다. 세 경우 모두 duration은 54~55ms로 같아요. 그런데 연결 지연이 있고 요청마다 새 연결을 맺을 때만 blocked가 316ms로 커집니다. 같은 지연이 있어도 연결을 재사용하면 blocked는 3ms였고요. duration만 보고 있었다면 이 시험은 ‘정상’으로 끝났을 거예요.

여기서 짚을 것이 하나 있습니다. k6는 기본으로 가상 사용자(VU)마다 연결을 유지해서 다음 반복에 다시 씁니다. 그러면 TLS를 끝내는 장비나 방화벽이 받는 새 연결은 대체로 VU 수만큼에 그칩니다. 실제 사용자는 접속할 때마다 새로 연결을 맺으니 이 시험은 연결 구간을 가볍게 보게 됩니다. 연결 재사용은 `noConnectionReuse`(keep-alive를 끄기)와 `noVUConnectionReuse`(반복 사이 재사용을 끄기) 옵션으로 조절합니다. 둘 다 기본값은 `false`입니다.

각 지표가 높을 때 먼저 의심할 곳은 이렇습니다.

- connecting이 높음: 부하발생기와 서버 사이의 거리(왕복 시간), 방화벽이나 로드밸런서가 새 연결을 제한하는 경우, 서버가 연결을 받아 줄 여유가 없는 경우. 이 글의 실험은 한 컴퓨터 안에서 돌려서 연결이 즉시 끝나기 때문에 connecting이 큰 경우는 재현하지 못했습니다.
- tls_handshaking이 높음: TLS를 끝내는 로드밸런서나 보안장비의 처리 여유, 세션 재사용이 안 되는 설정.
- blocked만 높고 connecting과 tls는 낮음: 연결을 얻으려는 부하발생기 쪽 대기. 이름 풀이(DNS) 시간이 여기 들어갈 수 있지만 확인하지 못했습니다.

거리가 멀수록 연결 구간이 얼마나 커지는지는 계산으로 볼 수 있습니다. TCP 연결에 1왕복, TLS 1.3 핸드셰이크에 1왕복([TLS 1.2는 2왕복](https://blog.cloudflare.com/introducing-tls-1-3/)), 요청을 보내고 첫 바이트를 받는 데 1왕복이 들어요. 서버가 일한 시간은 120ms로 두었습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="rtt" role="group" aria-label="왕복 시간이 1ms, 30ms, 150ms일 때 새 연결의 첫 요청과 연결을 재사용한 요청의 총 시간을 막대로 비교합니다. 왕복 1ms는 123ms와 121ms, 30ms는 210ms와 150ms, 150ms는 570ms와 270ms입니다. 서버가 일한 시간 120ms는 모든 경우에 같습니다."></div>
  <figcaption>왕복 시간에 따른 요청 시간 (계산, TLS 1.3, 서버가 일한 시간 120ms)</figcaption>
</figure>

왕복이 1ms인 같은 건물 안에서는 새 연결과 재사용의 차이가 2ms입니다. 왕복이 150ms인 먼 곳에서는 새 연결의 첫 요청이 570ms, 재사용 요청이 270ms로 300ms 차이가 나요. 어느 경우에도 서버가 일한 시간은 120ms이고, APM에는 그 값만 찍힙니다. 부하발생기를 서버와 같은 곳에 두면 이 거리 비용이 시험에서 빠집니다.

## 큰 요청을 올릴 때는 sending과 waiting에 나뉘어 잡힙니다

sending은 요청을 보내는 시간입니다. 요청이 작으면 거의 0이라서 평소에는 신경 쓸 일이 없어요. 파일 업로드처럼 본문이 큰 요청에서 달라집니다.

서버가 본문을 읽는 속도를 8,192KB/s로 제한하고 8MB를 올려 봤습니다. VU는 2개라서 둘이 한도를 나눠 씁니다.

<figure class="fig-figure">
  <div class="fig" data-fig="upload" role="group" aria-label="업로드 요청 하나의 막대입니다. sending 1,190ms, waiting 716ms, receiving 0.1ms로 합계 1,907ms입니다. sending은 운영체제 버퍼에 다 넣을 때까지이고, 서버가 본문을 다 읽을 때까지 1,907ms 중 716ms는 waiting에 잡힌다고 적혀 있습니다."></div>
  <figcaption>8MB 업로드 요청 하나의 구간 (실험, 서버가 읽는 속도 8,192KB/s로 제한)</figcaption>
</figure>

sending은 1,190ms이고 waiting이 716ms입니다. 합계 1,907ms는 8MB를 4,096KB/s(한도의 절반)로 올리는 시간 약 2초와 맞아요. k6는 요청을 연결에 다 써 넣은 시점까지를 sending으로 세는 것으로 보이고([소스 코드](https://github.com/grafana/k6/blob/master/lib/netext/httpext/tracer.go)), 그렇다면 운영체제 버퍼에 쌓여 있던 몫이 서버로 빠져나가는 시간은 waiting에 들어갑니다. 실험 결과도 이 설명과 맞아요.

그래서 업로드가 큰 시험에서는 sending이 크다는 것만으로 부족합니다. waiting도 같이 커져 있으면 서버가 느린 것처럼 보여요. sending이 높을 때 먼저 의심할 곳은 올리는 쪽 회선(특히 부하발생기의 회선)과 요청 본문의 크기이고, 본문을 검사하는 중간 장비도 후보입니다.

## waiting은 서버 시간과 중간 구간이 섞여 있습니다

waiting은 k6가 요청을 다 보낸 뒤 응답의 첫 바이트가 올 때까지의 시간입니다. 가장 많이 보는 지표이면서 가장 헷갈려요. 서버가 일한 시간, 왕복 시간, 중간 장비가 붙잡은 시간이 한 숫자에 섞여 있거든요.

두 경우를 비교해 보겠습니다. 하나는 서버가 500ms 걸려서 느린 경우이고, 다른 하나는 보안장비가 450ms 검사하고 서버는 50ms만 일한 경우입니다. 서버가 일한 시간은 응답 헤더에 실어 보냈고, k6가 그 값을 읽습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="gap" role="group" aria-label="두 경우의 k6 waiting 막대를 서버 시간과 나머지로 나눠 보여줍니다. 서버가 느린 경우 waiting은 503ms이고 거의 전부가 서버 시간 502ms입니다. 장비가 검사하느라 느린 경우 waiting은 504ms이지만 서버 시간은 52ms이고 나머지 452ms가 중간 구간입니다."></div>
  <figcaption>waiting에서 서버가 일한 시간을 뺀 값 (실험, 평균)</figcaption>
</figure>

초록이 서버가 보고한 시간(APM과 같은 구간)이고 주황이 waiting에서 그 시간을 뺀 값입니다. 두 경우 모두 k6 waiting은 503~504ms로 같습니다. 그런데 서버가 느린 경우는 서버 시간이 502ms라 거의 전부가 초록이고, 장비가 검사하는 경우는 서버 시간이 52ms뿐이라 452ms가 주황이에요. waiting에서 서버 시간을 뺀 값이 왕복 시간과 중간 장비의 몫입니다. 같은 waiting 500ms라도 고쳐야 할 곳이 서버와 장비로 갈립니다.

서버가 일한 시간을 응답에 실어 보내는 데는 `Server-Timing` 헤더가 쓸 만합니다. 브라우저 개발자 도구에서 서버 지표를 보여주려고 만든 표준 헤더이고, `이름;dur=밀리초` 형식이에요([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)). 서버 쪽은 앱이 일한 시간을 이렇게 응답 헤더에 붙입니다.

```http
Server-Timing: app;dur=51.2
```

k6 쪽은 이 헤더를 읽어서 별도 지표(Trend)로 남기면 됩니다. 이 글의 실험에서 쓴 코드입니다.

```javascript
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const serverTime = new Trend('server_time', true); // true: 시간 단위로 표시

export default function () {
  const res = http.get('https://example.test/api');
  const m = /dur=([\d.]+)/.exec(res.headers['Server-Timing'] || '');
  if (m) serverTime.add(Number(m[1]));
}
```

이렇게 하면 요청마다 k6 waiting과 서버 시간이 짝으로 남아서, 평균끼리 비교할 때보다 차이를 정확히 볼 수 있습니다. APM 제품에 따라 거래 ID나 서버 시간을 응답 헤더로 내보내는 기능이 있을 수 있으니 확인해 보세요.

waiting이 높을 때 먼저 의심할 곳은 이렇게 갈립니다.

- 서버 시간도 같이 높음: 서버 자체(앱, DB, 스레드).
- 서버 시간은 낮은데 waiting이 높음: 왕복 시간, 보안장비의 검사와 대기, 로드밸런서의 대기.

## 응답을 받는 구간은 회선이 차면 이것만 커집니다

receiving은 응답의 첫 바이트가 온 뒤 나머지를 다 받는 시간입니다. 응답이 작으면 거의 0이지만, 응답이 크고 회선이 모자라면 이 구간이 커져요. 서버 입장에서는 응답을 이미 내보냈으니 서버 지표에는 아무 일도 없습니다.

응답은 256KB이고 서버가 내보내는 속도를 연결 전체 합쳐서 10,240KB/s로 제한했습니다. 이 회선으로는 1초에 256KB 응답을 40개(10,240 ÷ 256)까지 보낼 수 있어요. VU를 1개에서 32개까지 늘려 보겠습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="bandwidth" role="group" aria-label="VU가 1, 2, 4, 8, 16, 32로 늘어나는 동안 왼쪽 막대그래프의 TPS는 8에서 40까지 늘다가 회선 한도 40에 붙습니다. 오른쪽 막대의 waiting은 101ms로 같고 서버 시간도 101ms인데, receiving은 24ms에서 695ms로 늘어납니다."></div>
  <figcaption>VU를 늘렸을 때의 TPS와 응답시간 (실험, 응답 256KB, 서버 한도 10,240KB/s, TPS는 VU ÷ 평균 응답시간으로 계산)</figcaption>
</figure>

왼쪽이 TPS이고 오른쪽이 응답시간(파랑 waiting, 분홍 receiving)입니다. 초록 점선이 서버가 일한 시간 101ms예요. VU 1에서는 receiving이 24ms로, 한도 안에서 256KB를 받는 시간(256 ÷ 10,240 ≈ 25ms)과 같습니다. VU가 8이 되면 TPS가 38로 한도 40에 거의 닿고, 그 뒤로 VU를 32까지 올려도 TPS는 40 근처에 머뭅니다. 늘어난 VU는 줄을 서고, 그 시간이 receiving에 쌓여서 695ms가 돼요. 서버가 일한 시간과 waiting은 끝까지 101ms 그대로입니다.

이 모양은 [지난 글]({{ '/writing/average-response-time/' | relative_url }})에서 본 ‘TPS는 멈춰도 기다리는 시간은 계속 늡니다’와 같습니다. 이번에는 멈추게 만든 것이 서버의 처리 능력이 아니라 회선이에요.

실제 숫자로 바꿔 보면 1Gbit/s 회선은 1초에 125MB를 보냅니다. 응답이 500KB인 화면이라면 이론상 1초에 250건이 한계예요(프로토콜 오버헤드는 무시한 계산). 서버가 1,000 TPS를 처리할 수 있어도 회선이 먼저 찹니다. [k6 문서](https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/)도 많은 AWS EC2 인스턴스의 1Gbit/s 회선이 k6가 만들 수 있는 부하를 제한할 수 있다고 알려요. 회선이 막힌 곳이 서버 쪽인지 부하발생기 쪽인지는 `data_received`를 시험 시간으로 나눈 값과 양쪽 회선 사용량을 비교해서 가립니다.

receiving이 높을 때 먼저 의심할 곳은 내려받는 회선, 응답 크기, 그리고 응답을 읽는 부하발생기의 여유입니다. waiting이 일정하면서 receiving만 커졌다면 서버를 보기 전에 회선부터 확인하는 편이 빨라요.

## 보안장비가 막은 요청은 서버에 남지 않습니다

지금까지는 느려지는 경우였는데, 요청이 아예 서버에 닿지 않는 경우도 있습니다. 보안장비가 요청을 막거나 제한하면 서버는 그 요청을 받은 적이 없어요. 이런 상황이 시험 결과에 어떻게 보이는지 가짜 장비로 확인했습니다. k6가 초당 200건을 보내고, 장비는 초당 100건까지만 통과시키고 나머지는 429(Too Many Requests)로 바로 돌려보내는 가정입니다.

<figure class="fig-figure">
  <div class="fig" data-fig="security" role="group" aria-label="k6에서 점이 보안장비로 가고, 일부는 장비 앞에서 아래로 떨어지고 나머지는 WAS로 갑니다. 보낸 요청은 1,201건이고 장비가 막은 요청은 535건, WAS가 처리한 요청은 666건입니다. k6가 본 것은 실패율 44.5%에 평균 응답시간 28.5ms이고, APM이 본 것은 666건에 오류 0, 서버가 일한 시간 평균 50ms입니다."></div>
  <figcaption>보안장비가 요청 일부를 막았을 때 k6와 APM이 본 것 (실험, 장비의 제한은 가정)</figcaption>
</figure>

6초 동안 k6는 1,201건을 보냈고 535건이 막혔습니다. 장비가 1초 단위로 끊어서 세기 때문에 통과한 건수는 600건보다 조금 많은 666건이에요. k6는 실패율 44.5%를 보고하지만, APM은 666건을 오류 없이 처리했고 서버가 일한 시간은 평균 50ms예요. 서버 쪽 화면만 보면 오류가 없는 정상 시험입니다. 눈여겨볼 점이 하나 더 있는데, k6의 평균 응답시간이 28.5ms로 서버가 일한 시간(50ms)보다 짧아요. 막힌 요청은 돌아오는 데 거의 시간이 안 걸리니 평균을 끌어내립니다. 지난 글에서 본 ‘오류가 빨리 돌아오면 평균도 TPS도 좋아집니다’와 같은 현상이에요.

특정 도구를 막는 경우는 더 극단적입니다. 보안장비가 요청의 특징(같은 곳에서 짧은 시간에 몰리는 요청, 브라우저가 보내지 않는 헤더나 도구 고유의 User-Agent 등)을 보고 자동화 도구를 막는 경우가 있어요. 제품마다 기준이 다르니 이 글에서는 장비가 k6의 기본 User-Agent(`Grafana k6/<버전>`)를 막는다고 가정했습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="ua-block" role="group" aria-label="같은 시험을 두 번 돌린 결과를 비교하는 두 카드입니다. 기본 User-Agent로는 TPS 40,574, 실패율 100%, 평균 응답시간 0.1ms이고 APM이 본 요청은 0입니다. 시험용으로 허용한 User-Agent로는 TPS 57, 실패율 0%, 평균 응답시간 52.5ms이고 APM이 본 요청은 342입니다."></div>
  <figcaption>같은 시험을 막힌 경우와 허용된 경우로 돌린 결과 (실험, 6초, 막는 규칙은 가정)</figcaption>
</figure>

왼쪽이 막힌 시험입니다. 요청 24만 건이 전부 실패했는데 TPS는 40,574로 가장 높고 평균 응답시간은 0.1ms로 가장 짧아요. APM이 본 요청은 0건입니다. 보고서에 TPS와 평균만 적었다면 아주 좋은 결과로 읽힐 수 있어요. 오른쪽은 시험용으로 허용한 User-Agent를 쓴 경우로, 서버가 일한 시간과 응답시간이 비슷하게 돌아왔습니다.

그래서 시험 결과에는 항상 실패율과 상태 코드를 같이 봅니다. k6에서는 실패율에 임계값을 걸어 두면 이런 시험이 바로 눈에 띄어요.

```javascript
export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],  // 실패율 1% 미만
  },
};
```

막힌 시험을 풀려면 부하를 거는 쪽과 보안장비를 맡은 쪽이 먼저 이야기해야 합니다. 시험 시간, 부하발생기의 IP, 시험용 헤더를 정해서 허용 목록에 넣는 식이에요. 장비를 속이는 우회가 아니라 시험임을 알리고 예외를 두는 것입니다. 예외를 두면 그 장비의 차단 기능은 시험하지 못하니, 예외 없이 한 번, 예외를 두고 한 번 돌려서 비교하는 방법도 있습니다.

## 부하발생기가 밀리면 서버가 느려진 것처럼 보입니다

마지막으로 부하발생기 자신입니다. 부하발생기의 CPU가 모자라면 k6가 요청을 보내고 응답을 읽는 일이 밀려요. 그 지연도 k6의 응답시간에 그대로 들어갑니다. 이때 서버는 아무 일도 없고 k6 숫자만 나빠져요.

응답을 받은 뒤 스크립트가 CPU를 4ms씩 쓰도록(체크나 파싱, 암호화 같은 일을 흉내) 하고, 초당 요청 수 목표를 1,000에서 3,600까지 올려 봤습니다. 서버는 20ms 일하는 가짜 서버입니다.

<figure class="fig-figure">
  <div class="fig" data-fig="generator" role="group" aria-label="가로축은 목표 TPS 1,000에서 3,600입니다. 서버가 일한 시간의 p95를 나타내는 파란 선은 20ms에서 24ms로 거의 평평합니다. k6가 잰 응답시간의 p95를 나타내는 빨간 선은 목표 2,800까지는 파란 선과 붙어 있다가 3,200에서 93ms, 3,600에서 191ms로 치솟고, 목표 3,600에서는 시작하지 못한 요청이 3,148건입니다."></div>
  <figcaption>목표 TPS를 올렸을 때 k6가 잰 응답시간과 서버가 일한 시간 (실험, p95)</figcaption>
</figure>

파란 선이 서버가 일한 시간(p95), 빨간 선이 k6가 잰 응답시간(p95)입니다. 목표 2,800까지는 두 선이 붙어 있어요. 목표 3,200부터 빨간 선만 93ms로 올라가고, 3,600에서는 191ms가 됩니다. 서버가 일한 시간은 24ms 안팎 그대로예요. 이때 k6의 dropped_iterations가 3,148까지 올랐습니다. 이 지표는 VU가 모자라거나 시간이 없어서 시작하지 못한 반복의 수이고, 정해진 속도로 요청을 보내는 시험(시각 고정 방식)에서 부하발생기가 목표를 못 따라가면 생겨요.

목표 3,600일 때 평균 구간별 시간은 waiting 61ms, receiving 13ms, sending 1.9ms로, 서버가 일한 시간 21ms보다 구간마다 늘어 있었습니다. 앞 절의 기준대로 waiting에서 서버 시간을 빼면 40ms가 남는데, 이 40ms가 네트워크나 장비처럼 보이지만 실제로는 부하발생기가 밀려서 생긴 값이에요. 그래서 waiting과 서버 시간의 차이를 보고 중간 장비를 의심하기 전에 부하발생기의 상태부터 확인합니다.

[k6 문서](https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/)는 부하발생기의 CPU 사용률을 80% 안쪽(20%는 여유로 남김), 메모리 사용률을 90% 안쪽으로 유지하라고 권하고, CPU가 100%가 되면 실제보다 훨씬 긴 응답시간이 측정된다고 경고합니다. 회선(1Gbit/s)과 한 IP당 약 65,000개로 제한되는 포트 수, 파일 디스크립터 제한도 확인할 항목으로 꼽아요. 이 실험의 임계점(초당 3,000건 안팎)은 이 컴퓨터와 이 스크립트에서 나온 값이라 그대로 쓸 수 없고, 실제 시험에서는 소규모로 먼저 돌려서 부하발생기의 포화점을 찾아 두는 편이 좋습니다.

부하발생기가 밀렸을 때의 신호는 이렇습니다.

- 구간별 시간이 서버 시간과 상관없이 같이 늘어남.
- dropped_iterations가 생김(시각 고정 방식일 때).
- 부하발생기의 CPU나 메모리, 회선 사용량이 한계 가까이 올라 있음.

## WAS에 바로 쏘면 이 문제들은 시험에 들어오지 않습니다

여기까지 본 원인을 부하를 거는 위치별로 정리하면 이렇습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="coverage" role="group" aria-label="표입니다. 행은 서버 처리 한계, 로드밸런서와 TLS 처리 한계, 방화벽과 WAF의 검사 지연과 속도 제한, 봇과 매크로 차단, 인터넷 구간 대역폭과 거리, 부하발생기 자체의 한계입니다. 열은 WAS에 바로, 내부 로드밸런서를 거쳐, 외부망 실제 경로입니다. 서버 처리 한계는 세 곳 모두에서 드러나고, 로드밸런서와 TLS는 내부 로드밸런서와 외부망에서, 나머지 네 가지는 외부망 실제 경로에서만 드러납니다. 부하발생기의 한계는 어디서든 생깁니다."></div>
  <figcaption>부하를 거는 위치별로 시험에서 드러나는 문제 (모식도, 흔한 구성을 가정)</figcaption>
</figure>

WAS에 바로 쏘는 시험은 서버 처리 한계만 보여줍니다. 장비와 회선이 시험 경로에 없으니, 서버가 아무리 잘 버텨도 보안장비의 속도 제한이나 회선의 대역폭, 도구 차단은 시험에서 한 번도 만나지 않아요. 오픈한 날 처음 만나게 되는 이유입니다. 서버는 문제가 없는데 실제 사용자 경로에서 문제가 생기는 일이 여기서 나옵니다.

그렇다고 외부망에서만 쏘면 되는 것도 아닙니다. 외부망 시험에서 느리게 나오면 서버 탓인지 경로 탓인지 가르기 어려워요. 같은 시나리오를 두 곳에서 쏘고, 서버 시간과 k6의 구간별 지표를 함께 보면 차이가 어느 구간에서 생겼는지 알 수 있습니다.

- WAS에 바로(또는 같은 망 안에서): 서버가 낼 수 있는 처리량과 응답시간. 다른 시험의 기준선이 됩니다.
- 외부망의 실제 경로로: 사용자가 겪는 응답시간과 중간 구간의 문제. 가능하면 사용자가 있는 여러 위치에서 쏩니다.

외부망으로 부하를 걸 때는 미리 챙길 일이 있습니다. 보안장비, CDN, 호스팅이나 클라우드의 부하시험 정책을 확인하고, 시험 시간과 부하발생기 IP, 시험용 헤더를 보안 담당자와 정해 둡니다. 시험을 시작하기 전에 소규모로 돌려서 부하발생기 자체의 포화점도 확인하고요.

## 숫자가 다를 때는 이 순서로 봅니다

지금까지의 내용을 한 장으로 정리하면 이렇습니다. k6에서 이렇게 보이면 이쪽을 먼저 의심합니다.

<figure class="fig-figure">
  <div class="fig" data-fig="triage" role="group" aria-label="k6에서 보이는 현상과 먼저 의심할 곳을 짝지은 일곱 줄의 표입니다. blocked, connecting, tls가 크고 duration이 정상이면 새 연결을 처리하는 곳입니다. sending이 크면 올리는 쪽 회선입니다. waiting이 크고 서버 시간이 작으면 중간 장비와 왕복 시간이고, 서버 시간도 크면 서버 자체입니다. receiving이 크고 waiting이 일정하면 내려받는 회선과 응답 크기입니다. 실패율이 오르고 응답시간과 APM 요청 수가 줄면 장비의 차단과 제한입니다. 모든 구간이 같이 늘고 dropped_iterations가 생기면 부하발생기의 자원입니다."></div>
  <figcaption>k6와 APM 숫자가 다를 때 먼저 볼 곳 (정리)</figcaption>
</figure>

확인할 때 쓸 수 있는 방법을 함께 적으면 이렇습니다.

| 보이는 현상 | 의심할 곳 | 확인할 것 |
| --- | --- | --- |
| blocked, connecting, tls가 큼 | 새 연결 처리, 먼 거리 | 연결 재사용 설정, 장비의 연결 로그 |
| sending이 큼 | 올리는 쪽 회선 | 요청 크기, 부하발생기 회선 사용량 |
| waiting이 큼, 서버 시간은 작음 | 중간 장비, 왕복 시간 | 장비 로그의 처리 시간, 위치별 시험 비교 |
| waiting과 서버 시간이 모두 큼 | 서버 자체 | APM 거래, DB, 스레드 |
| receiving이 큼, waiting은 일정 | 내려받는 회선, 응답 크기 | data_received ÷ 시간과 회선 사용량 |
| 실패율 오름, 응답시간과 APM 요청 수 감소 | 장비의 차단과 제한 | 상태 코드(403, 429), 장비 로그, 허용 목록 |
| 모든 구간이 같이 늘고 dropped_iterations 발생 | 부하발생기 자원 | CPU, 메모리, 회선, 포트 |

## 이 글의 실험이 보여주지 못하는 것

실험 그림은 한 컴퓨터 안에서 가짜 서버로 만든 값이라 한계가 분명합니다.

- 연결이 즉시 끝나는 환경이라 connecting이 큰 경우와 DNS 조회가 어디에 잡히는지는 재현하지 못했습니다.
- 보안장비는 파이썬 코드로 만든 모형입니다. 실제 WAF와 방화벽의 동작과 기준은 제품과 설정마다 다릅니다.
- APM이 재는 시작과 끝 지점은 제품과 설정마다 다릅니다. 이 글에서는 서버가 응답 헤더에 적은 시간을 APM이 보는 시간의 대용으로 썼습니다.
- k6 이외의 도구는 지표 이름과 정의가 다를 수 있습니다. 이 글의 정의는 k6 v1.4.2 기준입니다.
- 숫자는 컴퓨터 한 대의 결과이고, 지연과 한도는 모두 정해 둔 값입니다.

## 다시, 처음 장면으로

처음의 장면으로 돌아가 보겠습니다. k6 p95는 3초이고 APM의 WAS 응답시간은 200ms입니다. 이제는 3초를 한 덩어리로 보지 않고 구간으로 나눠 볼 수 있어요. duration이 3초인데 서버 시간이 200ms라면 차이 2.8초는 어느 구간에서 쌓였는지를 blocked, sending, waiting, receiving 순서로 찾습니다.

이 글의 그림에서 가져갈 것은 세 가지입니다.

- duration만 보지 않습니다. 연결에 쓴 시간은 duration 밖에 있어서, 연결 지연이 있어도 duration은 54ms로 정상이었습니다.
- waiting 옆에 서버 시간을 둡니다. waiting이 504ms로 같아도 서버 시간이 502ms인지 52ms인지에 따라 서버와 장비로 원인이 갈렸습니다.
- 실패율과 부하발생기의 상태를 같이 봅니다. 막힌 시험은 TPS 40,574에 응답시간 0.1ms였고, 부하발생기가 밀리면 서버 시간은 24ms 안팎 그대로인데 k6 p95가 191ms가 됐습니다.

남은 질문은 어디에서 얼마나 쏠 것인가입니다. 외부망의 실제 경로로 쏘는 시험은 보안 담당자와의 협의와 비용이 들고, 어느 위치에서 어느 규모로 얼마나 자주 할지는 서비스마다 다릅니다. 이 글의 그림은 모두 모형 서버에서 나온 값이라, 실제 서비스의 어느 구간이 가장 큰지는 직접 재 봐야 압니다.
