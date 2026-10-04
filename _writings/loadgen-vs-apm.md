---
thumb: /assets/thumbs/loadgen-vs-apm.jpg
title: k6는 느리다는데 APM은 멀쩡할 때
topic: 개발
description: k6의 p95는 3초인데 APM은 200ms라면 어디를 봐야 할까요? 로컬 모형 서버 실험으로 측정 구간, 연결과 송수신 시간, 차단과 부하발생기의 한계를 비교하고 원인을 확인하는 순서를 설명합니다.
---

<script src="{{ '/assets/figures/loadgen-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen1-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen2-data.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-common.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-1.js' | relative_url }}"></script>
<script src="{{ '/assets/figures/loadgen-2.js' | relative_url }}"></script>

같은 API를 시험한 시간대에 k6의 응답시간 p95가 3초, APM의 p95가 200ms였다고 가정해 보겠습니다. 서버 안에서는 빠르게 끝난 요청이 부하발생기에서는 오래 걸린 요청으로 보입니다. 이 차이는 어디에서 생겼을까요?

두 도구가 서로 다른 구간을 재면 이런 결과가 나올 수 있습니다. APM은 주로 웹 애플리케이션 서버(WAS)가 요청을 받아 처리하는 구간을 보고, k6는 부하발생기에서 관찰한 연결과 요청·응답 시간을 여러 지표로 남깁니다. 그 사이에 회선, 방화벽과 웹 공격을 검사하는 WAF, 요청을 서버에 나누는 로드밸런서가 있습니다. 부하발생기 자체가 밀리는 시간도 섞일 수 있어요.

원인을 찾으려면 먼저 지표의 시작과 끝을 맞춰 봐야 합니다. 연결에 쓴 시간이 응답시간 지표에 포함되는지, 느린 구간이 서버 안인지 밖인지, APM까지 도착하지 않은 요청은 없는지에 따라 확인할 곳이 달라집니다. k6의 구간별 지표와 서버 시간을 나란히 놓고 이 경우들을 비교해 보겠습니다.

‘실험’ 그림은 로컬 macOS 환경(12코어)에서 k6 v1.4.2와 파이썬 모형 서버로 얻은 값입니다. 지연과 대역폭 한도, 차단 규칙을 코드로 만들었으며 실제 보안장비를 시험한 결과는 아닙니다. APM을 연결하지 않고 서버가 응답 헤더로 보낸 처리시간을 대용으로 썼습니다. ‘모식도’와 ‘계산’ 그림은 측정값과 구분해 표시했습니다.

## APM과 k6는 요청의 서로 다른 구간을 잽니다

부하발생기에서 출발한 요청이 방화벽과 WAF, 로드밸런서를 지나 WAS에 도착하고, WAS가 DB를 부르는 구성을 가정했습니다. 이 경로에서 어디부터 재는지 표시하면 두 도구의 차이가 보입니다.

<figure class="fig-figure">
  <div class="fig" data-fig="path" role="group" aria-label="왼쪽부터 외부 부하발생기, 방화벽과 WAF, 로드밸런서, WAS, DB가 화살표로 이어져 있습니다. 파란 괄호는 부하발생기에서 WAS까지를 k6가 재는 구간으로, 초록 괄호는 WAS와 DB만을 APM이 재는 구간으로 표시합니다. 위쪽의 내부 부하발생기는 WAS로 바로 연결되며, 이 시험에는 방화벽과 로드밸런서와 바깥 구간이 없다고 적혀 있습니다."></div>
  <figcaption>요청이 지나가는 길과 k6, APM이 재는 구간 (모식도)</figcaption>
</figure>

파란 괄호는 k6가 관찰하는 경로, 초록 괄호는 APM이 관찰하는 서버 처리 구간입니다. APM의 시작과 끝은 제품과 계측 설정에 따라 다르므로 실제 구간을 확인해야 합니다. 주황색 화살표처럼 WAS에 직접 부하를 주면 방화벽, 로드밸런서와 외부 회선은 시험에서 빠집니다. 서버의 처리 한도를 확인하는 데는 도움이 되지만, 이 결과만으로 전체 경로를 평가할 수는 없습니다.

요청 하나가 이 길을 지날 때 시간이 어떻게 쌓이는지 예시 값으로 따라가 보겠습니다. 왕복 30ms, 보안장비의 검사 60ms, 서버가 일한 시간 120ms라고 가정했어요.

<figure class="fig-figure">
  <div class="fig" data-fig="journey" role="group" aria-label="요청 알갱이가 부하발생기에서 방화벽, 로드밸런서, WAS로 움직이는 동안 아래 막대가 차례로 채워집니다. 연결 30ms, TLS 60ms, 보내기 2ms, 기다림 210ms, 받기 8ms입니다. 기다림 210ms는 왕복 30ms, 장비 검사 60ms, 서버 120ms로 나뉘고 서버 120ms만 APM이 잽니다. 마지막에 k6 duration은 220ms, APM은 120ms, 연결 90ms는 duration 밖이라고 표시됩니다."></div>
  <figcaption>요청 하나가 지나가는 동안 쌓이는 시간 (모식도, 예시 값)</figcaption>
</figure>

서버 처리시간은 120ms인데 k6의 `http_req_duration`은 220ms입니다. 이 예시의 나머지 100ms는 왕복과 장비 검사, 보내기와 받기에서 나옵니다. 여기에 연결과 TLS 협상으로 쓴 90ms도 있지만 duration에는 들어가지 않습니다. 요청이 지나간 전체 시간과 duration의 범위를 먼저 구별해야 하는 이유입니다.

## k6는 요청 하나를 구간별로 나눠 잽니다

k6의 [지표 문서](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)를 기준으로 요청 하나의 시간을 나누면 다음과 같습니다. 특히 연결 구간과 요청·응답 구간을 묶는 괄호가 서로 다릅니다.

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
| http_req_failed | k6의 응답 판정 기준에 따른 실패 비율 |
| dropped_iterations | 시작하지 못한 반복의 수 |

duration은 sending, waiting, receiving의 합입니다. 연결을 얻고 TCP와 TLS를 준비하는 시간은 제외됩니다. 따라서 duration이 짧다고 새 연결까지 빠르게 만들어졌다는 뜻은 아닙니다.

blocked는 문서에서 연결 슬롯을 기다리는 시간으로 설명합니다. [실험 버전의 소스 코드](https://github.com/grafana/k6/blob/v1.4.2/lib/netext/httpext/tracer.go)에서는 연결을 요청한 시점부터 얻은 시점까지여서, 새 연결의 TCP와 TLS 준비시간도 이 안에서 일어납니다. 실험에서는 blocked 7ms 안에 connecting 0.8ms와 TLS 6.2ms가 들어갔습니다. 이 세 값을 별도 구간처럼 모두 더하면 중복 계산이 됩니다. DNS 시간의 귀속은 이번 실험에서 따로 확인하지 못했습니다.

실험에 사용한 k6 v1.4.2의 기본 compact 요약은 이 구간들을 모두 표시하지 않습니다. `--summary-mode=full`로 켜고, `--summary-trend-stats="avg,p(95)"`를 붙여 평균과 p95를 확인했습니다. 아래는 서버 처리 50ms와 장비 검사 450ms를 모형으로 만든 경로에 VU 3개로 6초간 요청한 결과입니다. VU는 요청을 반복하는 가상 사용자입니다.

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

duration 503.1ms의 대부분이 waiting 503.01ms에 들어 있습니다. 서버가 보낸 `server_time`은 약 51ms여서, waiting을 그대로 서버 처리시간으로 읽으면 원인을 잘못 짚습니다. 반면 sending과 receiving은 마이크로초 단위라 이 실험에서 지연의 큰 몫을 설명하지 않습니다. 같은 방식으로 어느 구간이 커졌는지를 먼저 확인합니다.

## 연결을 맺는 데 쓴 시간은 duration에 들어가지 않습니다

duration이 정상인데 요청이 늦게 시작된다면 연결 지표를 봅니다. connecting은 TCP 연결, tls_handshaking은 TLS 협상에 쓴 시간입니다. 재사용한 연결에서는 새 협상이 없으므로 두 값이 0으로 남습니다. 새 연결을 얼마나 만드는지가 이 구간의 부하를 바꿉니다.

이 구간을 키우려면 TLS를 끝내는 장비가 느린 상황을 가정하면 됩니다. 연결은 바로 받지만 TLS 협상은 300ms 뒤에야 시작하는 가짜 장비를 앞에 두고, 세 경우를 비교했습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="tls" role="group" aria-label="세 경우의 blocked 막대와 duration 막대를 비교합니다. 지연 없이 요청마다 새 연결을 맺으면 blocked 7ms, duration 55ms입니다. 연결 지연 300ms에서 요청마다 새 연결을 맺으면 blocked만 316ms로 길어지고 duration은 54ms입니다. 같은 지연에서 연결을 재사용하면 blocked 3ms, duration 54ms입니다."></div>
  <figcaption>세 경우의 blocked와 duration (실험, 평균)</figcaption>
</figure>

아래쪽 duration은 세 경우 모두 54~55ms입니다. 위쪽 blocked만 새 연결을 매번 만드는 조건에서 316ms로 늘어납니다. 연결을 재사용한 조건의 평균 blocked는 3ms였어요. 연결 지연이 응답시간 목표를 통과하는 이유는 서버가 더 빨라져서가 아니라, 그 시간이 duration의 범위 밖에 있기 때문입니다.

k6는 기본으로 연결을 재사용합니다. 같은 주소에 순차 요청하는 시험에서는 첫 연결 뒤의 요청들이 연결 비용을 거의 치르지 않습니다. 실제 브라우저와 앱도 연결을 재사용하므로 무조건 재사용을 꺼야 하는 것은 아닙니다. 신규 접속 비율과 연결 유지 방식에 맞춰 `noConnectionReuse`(재사용 끄기)와 `noVUConnectionReuse`(반복 사이 재사용 끄기)를 정합니다. 둘 다 기본값은 `false`입니다. [옵션 정의](https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/#no-connection-reuse)를 확인하고 시험 설정을 결과와 함께 남깁니다.

각 지표가 높을 때 먼저 의심할 곳은 이렇습니다.

- connecting이 높음: 부하발생기와 서버 사이의 거리(왕복 시간), 방화벽이나 로드밸런서가 새 연결을 제한하는 경우, 서버가 연결을 받아 줄 여유가 없는 경우. 이 글의 실험은 한 컴퓨터 안에서 돌려서 연결이 즉시 끝나기 때문에 connecting이 큰 경우는 재현하지 못했습니다.
- tls_handshaking이 높음: TLS를 끝내는 로드밸런서나 보안장비의 처리 여유, 세션 재사용이 안 되는 설정.
- blocked만 높고 connecting과 tls는 낮음: 연결을 얻으려는 부하발생기 쪽 대기. 이름 풀이(DNS) 시간이 여기 들어갈 수 있지만 확인하지 못했습니다.

거리가 멀수록 연결 구간이 얼마나 커지는지는 계산으로 볼 수 있습니다. TCP 연결에 1왕복, TLS 1.3 핸드셰이크에 1왕복([TLS 1.2는 2왕복](https://blog.cloudflare.com/introducing-tls-1-3/)), 요청을 보내고 첫 바이트를 받는 데 1왕복이 들어요. 서버가 일한 시간은 120ms로 두었습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="rtt" role="group" aria-label="왕복 시간이 1ms, 30ms, 150ms일 때 새 연결의 첫 요청과 연결을 재사용한 요청의 총 시간을 막대로 비교합니다. 왕복 1ms는 123ms와 121ms, 30ms는 210ms와 150ms, 150ms는 570ms와 270ms입니다. 서버가 일한 시간 120ms는 모든 경우에 같습니다."></div>
  <figcaption>왕복 시간에 따른 요청 시간 (계산, TLS 1.3, 서버가 일한 시간 120ms)</figcaption>
</figure>

왕복 1ms 조건에서는 새 연결과 재사용의 차이가 2ms지만, 150ms 조건에서는 300ms가 됩니다. 서버 처리시간은 모두 120ms입니다. TLS 1.3의 일반적인 새 연결을 단순 계산한 값이며 DNS, 재전송, 세션 재개 등은 제외했습니다. 부하발생기를 서버 가까이에 두면 실제 사용자의 왕복시간을 재현하지 못할 수 있습니다.

## 큰 요청을 올릴 때는 sending과 waiting에 나뉘어 잡힙니다

sending은 요청을 쓰는 시간입니다. 작은 요청에서는 짧게 끝나지만, 파일 업로드처럼 본문이 크면 회선과 버퍼의 영향을 받습니다. 이때 파일을 서버가 모두 읽을 때까지의 시간이 sending에 전부 들어가는지도 확인해야 합니다.

서버가 본문을 읽는 속도를 8,192KB/s로 제한하고 8MB를 올려 봤습니다. VU는 2개라서 둘이 한도를 나눠 씁니다.

<figure class="fig-figure">
  <div class="fig" data-fig="upload" role="group" aria-label="업로드 요청 하나의 막대입니다. sending 1,190ms, waiting 716ms, receiving 0.1ms로 합계 1,907ms입니다. sending은 운영체제 버퍼에 다 넣을 때까지이고, 서버가 본문을 다 읽을 때까지 1,907ms 중 716ms는 waiting에 잡힌다고 적혀 있습니다."></div>
  <figcaption>8MB 업로드 요청 하나의 구간 (실험, 서버가 읽는 속도 8,192KB/s로 제한)</figcaption>
</figure>

sending 1,190ms가 끝난 뒤에도 waiting 716ms가 남습니다. 합계는 약 1.9초로, 두 VU가 한도를 절반씩 나누면 업로드에 약 2초가 걸린다는 계산과 비슷합니다. [k6 소스 코드](https://github.com/grafana/k6/blob/v1.4.2/lib/netext/httpext/tracer.go)는 요청 쓰기 완료 시점을 경계로 삼습니다. 클라이언트가 연결에 데이터를 써 넣었어도 서버가 모두 읽었다는 뜻은 아니므로, 버퍼의 데이터가 전송되고 서버가 읽는 동안 waiting이 이어질 수 있습니다. 이 실험은 그 설명과 맞는 결과입니다.

큰 업로드에서는 sending과 waiting을 함께 봅니다. waiting이 길어도 아직 본문을 읽는 중일 수 있으므로 곧바로 앱이나 DB를 원인으로 잡기 어렵습니다. 요청 크기, 부하발생기의 송신 회선, 서버의 본문 읽기 속도와 중간 장비의 검사시간을 비교해야 합니다.

## waiting은 서버 시간과 중간 구간이 섞여 있습니다

waiting은 요청 쓰기가 끝난 뒤 응답의 첫 바이트를 받을 때까지입니다. 여기에 서버 처리, 왕복, 중간 장비의 대기가 함께 들어갈 수 있습니다. 앞의 업로드처럼 요청 본문 전송이 아직 끝나지 않은 경우도 있어, 서버 시간과 범위를 맞춰 비교해야 합니다.

두 경우를 비교해 보겠습니다. 하나는 서버가 500ms 걸려서 느린 경우이고, 다른 하나는 보안장비가 450ms 검사하고 서버는 50ms만 일한 경우입니다. 서버가 일한 시간은 응답 헤더에 실어 보냈고, k6가 그 값을 읽습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="gap" role="group" aria-label="두 경우의 k6 waiting 막대를 서버 시간과 나머지로 나눠 보여줍니다. 서버가 느린 경우 waiting은 503ms이고 거의 전부가 서버 시간 502ms입니다. 장비가 검사하느라 느린 경우 waiting은 504ms이지만 서버 시간은 52ms이고 나머지 452ms가 중간 구간입니다."></div>
  <figcaption>waiting에서 서버가 일한 시간을 뺀 값 (실험, 평균)</figcaption>
</figure>

waiting은 두 경우 모두 약 500ms입니다. 서버가 느린 경우는 그중 502ms가 서버 처리이고, 장비 지연을 넣은 경우는 서버가 52ms만 쓰고 차이가 약 452ms입니다. 이 통제된 실험에서는 넣어 둔 장비 지연이 차이를 설명합니다. 실제 시험에서 같은 차이가 보인다면 서버 밖의 경로와 부하발생기를 확인할 단서이지, 특정 장비가 452ms를 썼다는 증거는 아닙니다.

서버가 일한 시간을 응답에 실어 보내는 데는 `Server-Timing` 헤더가 쓸 만합니다. 브라우저 개발자 도구에서 서버 지표를 보여주려고 만든 표준 헤더이고, `이름;dur=밀리초` 형식이에요([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)). 서버 쪽은 앱이 일한 시간을 이렇게 응답 헤더에 붙입니다.

```http
Server-Timing: app;dur=51.2
```

k6에서는 이 헤더의 값을 별도 시간 지표(Trend)로 남깁니다. 실험 코드에서 헤더를 읽는 부분만 남기고 요청 주소를 예시로 바꿨습니다. 헤더에는 `app` 값 하나만 있다는 조건입니다.

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

이 코드는 `server_time`의 분포를 따로 집계합니다. 같은 요청의 차이까지 보려면 응답 하나에서 `res.timings.waiting`과 헤더 값을 함께 읽어 차이를 계산하거나, 요청 ID로 기록을 연결해야 합니다. waiting의 p95에서 서버 시간의 p95를 빼도 ‘차이의 p95’가 되지는 않습니다. 두 p95를 만든 요청이 서로 다를 수 있기 때문이에요. 헤더를 보내지 않은 요청이나 APM에서 표본 추출로 빠진 요청도 비교 범위에서 확인해야 합니다.

waiting이 높을 때 먼저 의심할 곳은 이렇게 갈립니다.

- 서버 시간도 같이 높음: 서버 자체(앱, DB, 스레드).
- 서버 시간은 낮은데 waiting이 높음: 왕복 시간, 보안장비의 검사와 대기, 로드밸런서의 대기.

## 응답이 크면 receiving에서 회선 한도가 드러납니다

receiving은 응답의 첫 바이트부터 나머지 데이터를 다 받는 데 걸린 시간입니다. 앱이 응답을 만들고도 회선에서 전송이 밀리면 이 구간이 늘어날 수 있습니다. APM이 응답 전송을 어디까지 계측하는지는 설정에 따라 다르므로, receiving과 항상 같은 길이를 재는 것은 아닙니다.

응답은 256KB이고 서버가 내보내는 속도를 연결 전체 합쳐서 10,240KB/s로 제한했습니다. 이 회선으로는 1초에 256KB 응답을 40개(10,240 ÷ 256)까지 보낼 수 있어요. VU를 1개에서 32개까지 늘려 보겠습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="bandwidth" role="group" aria-label="VU가 1, 2, 4, 8, 16, 32로 늘어나는 동안 왼쪽 막대그래프의 TPS는 8에서 40까지 늘다가 회선 한도 40에 붙습니다. 오른쪽 막대의 waiting은 101ms로 같고 서버 시간도 101ms인데, receiving은 24ms에서 695ms로 늘어납니다."></div>
  <figcaption>VU를 늘렸을 때의 TPS와 응답시간 (실험, 응답 256KB, 서버 한도 10,240KB/s, TPS는 VU ÷ 평균 응답시간으로 계산)</figcaption>
</figure>

VU 1에서 receiving은 24ms로, 한도 안에서 응답 하나를 받는 계산값 약 25ms와 비슷합니다. VU 8부터는 처리량이 40 TPS 한도에 가까워지고, VU 32에서도 더 늘지 않습니다. 여러 연결이 전송 한도를 나눠 쓰는 동안 receiving은 695ms로 길어집니다. 반면 서버 처리시간과 waiting은 약 101ms에 머뭅니다. 이 실험에서는 응답을 만든 뒤의 전송이 처리량을 제한한 것입니다.

이 모양은 [지난 글]({{ '/writing/average-response-time/' | relative_url }})에서 본 ‘TPS는 멈춰도 기다리는 시간은 계속 늡니다’와 같습니다. 이번에는 멈추게 만든 것이 서버의 처리 능력이 아니라 회선이에요.

회선 한도는 응답 크기로도 예상할 수 있습니다. 1Gbit/s를 125MB/s로 환산하고 응답을 500KB로 두면 이론상 약 250건/s입니다. 여기서는 MB와 KB를 십진 단위로 쓰고 프로토콜 오버헤드를 제외했습니다. 서버가 1,000 TPS를 처리할 수 있어도 이 조건에서는 회선이 먼저 찹니다. `data_received`를 측정 시간으로 나눈 수신량과 서버·부하발생기 양쪽의 회선 사용량을 비교하면 어느 쪽 한도인지 좁힐 수 있습니다.

receiving이 높을 때 먼저 의심할 곳은 내려받는 회선, 응답 크기, 그리고 응답을 읽는 부하발생기의 여유입니다. waiting이 일정하면서 receiving만 커졌다면 서버를 보기 전에 회선부터 확인하는 편이 빨라요.

## 보안장비가 막은 요청은 서버에 남지 않습니다

두 도구의 시간이 다를 때는 요청 수부터 달라진 경우도 봐야 합니다. 서버 앞에서 요청을 차단하면 APM에 도착한 요청과 k6가 보낸 요청이 다른 집합이 됩니다. k6는 초당 200건을 보내고, 모형 장비는 초당 100건까지만 통과시키며 나머지에 429(Too Many Requests)를 즉시 반환하도록 만들었습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="security" role="group" aria-label="k6에서 점이 보안장비로 가고, 일부는 장비 앞에서 아래로 떨어지고 나머지는 WAS로 갑니다. 보낸 요청은 1,201건이고 장비가 막은 요청은 535건, WAS가 처리한 요청은 666건입니다. k6가 본 것은 실패율 44.5%에 평균 응답시간 28.5ms이고, APM이 본 것은 666건에 오류 0, 서버가 일한 시간 평균 50ms입니다."></div>
  <figcaption>보안장비가 요청 일부를 막았을 때 k6와 APM이 본 것 (실험, 장비의 제한은 가정)</figcaption>
</figure>

6초 동안 1,201건을 보냈고 535건이 막혔습니다. 1초 단위로 한도를 초기화하는 모형이라 시간 경계에서 600건보다 많은 666건이 통과했습니다. 서버에서는 이 666건이 오류 없이 평균 50ms에 끝났지만, k6의 실패율은 44.5%입니다. 두 도구가 같은 요청을 보지 않았기 때문입니다.

k6의 전체 평균은 28.5ms로 서버 처리 평균보다 짧습니다. 차단된 요청이 빠르게 돌아와 평균을 낮췄습니다. [평균 응답시간 글]({{ '/writing/average-response-time/' | relative_url }})에서 다룬 빠른 오류가 여기에 해당합니다. 서버 지표가 정상일 때도 실패율과 서버에 도착한 건수를 확인해야 합니다.

특정 도구를 막는 경우는 더 극단적입니다. 보안장비가 요청의 특징(같은 곳에서 짧은 시간에 몰리는 요청, 브라우저가 보내지 않는 헤더나 도구 고유의 User-Agent 등)을 보고 자동화 도구를 막는 경우가 있어요. 제품마다 기준이 다르니 이 글에서는 장비가 k6의 기본 User-Agent(`Grafana k6/<버전>`)를 막는다고 가정했습니다.

<figure class="fig-figure">
  <div class="fig" data-fig="ua-block" role="group" aria-label="같은 시험을 두 번 돌린 결과를 비교하는 두 카드입니다. 기본 User-Agent로는 TPS 40,574, 실패율 100%, 평균 응답시간 0.1ms이고 APM이 본 요청은 0입니다. 시험용으로 허용한 User-Agent로는 TPS 57, 실패율 0%, 평균 응답시간 52.5ms이고 APM이 본 요청은 342입니다."></div>
  <figcaption>같은 시험을 막힌 경우와 허용된 경우로 돌린 결과 (실험, 6초, 막는 규칙은 가정)</figcaption>
</figure>

왼쪽은 약 24만 건이 전부 차단됐고 서버에 도착한 요청은 0건입니다. 그런데 완료한 요청을 모두 세면 40,574 TPS, 평균 0.1ms가 됩니다. 이 숫자는 서버의 처리 성능을 보여주지 않습니다. 오른쪽처럼 시험 요청을 허용했을 때 비로소 서버를 포함한 경로의 시간을 재게 됩니다. 이 실험의 차단 규칙은 설명용으로 정한 것이며, 실제 장비가 k6를 같은 기준으로 막는다는 뜻은 아닙니다.

실패율에 임계값을 걸면 빠르게 실패한 요청이 좋은 결과로 통과하는 것을 막을 수 있습니다. 아래는 실패율 1% 미만을 예시 기준으로 둔 설정입니다. 서비스의 정상 응답에 맞는 판정 기준과 상태 코드도 함께 확인해야 합니다.

```javascript
export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],  // 실패율 1% 미만
  },
};
```

서버 처리 한도를 재려는 시험이라면 보안 담당자와 시간, 부하발생기 IP, 시험용 헤더를 정해 허용할 수 있습니다. 다만 예외를 적용한 요청에는 원래 차단 규칙이 작동하지 않습니다. 서버 성능과 차단 정책을 모두 확인하려면 허용 여부를 구분해 시험하고, 각 결과에 적용한 예외를 적어야 합니다.

## 부하발생기가 밀리면 서버가 느려진 것처럼 보입니다

서버 밖의 시간이 늘었다고 중간 장비만 찾으면 원인을 놓칠 수 있습니다. 부하발생기의 CPU가 모자라면 요청을 보내고 응답을 읽는 일이 밀리고, 그 지연이 k6의 시간 지표에도 영향을 줍니다. 목표 요청 수를 보내지 못하는 경우도 생깁니다.

응답을 받은 뒤 스크립트가 CPU를 4ms씩 쓰도록(체크나 파싱, 암호화 같은 일을 흉내) 하고, 초당 요청 수 목표를 1,000에서 3,600까지 올려 봤습니다. 서버는 20ms 일하는 가짜 서버입니다.

<figure class="fig-figure">
  <div class="fig" data-fig="generator" role="group" aria-label="가로축은 목표 TPS 1,000에서 3,600입니다. 서버가 일한 시간의 p95를 나타내는 파란 선은 20ms에서 24ms로 거의 평평합니다. k6가 잰 응답시간의 p95를 나타내는 빨간 선은 목표 2,800까지는 파란 선과 붙어 있다가 3,200에서 93ms, 3,600에서 191ms로 치솟고, 목표 3,600에서는 시작하지 못한 요청이 3,148건입니다."></div>
  <figcaption>목표 TPS를 올렸을 때 k6가 잰 응답시간과 서버가 일한 시간 (실험, p95)</figcaption>
</figure>

목표 2,800 TPS까지는 두 p95가 가깝습니다. 목표 3,200부터 k6의 p95가 올라가 3,600에서는 191ms가 되지만, 서버 p95는 약 24ms입니다. 이때 `dropped_iterations`도 3,148건입니다. 요청의 도착률을 고정한 이번 시나리오에서는 사용할 VU가 없어 시작하지 못한 반복입니다. 이 스크립트는 반복당 요청을 한 번 보내므로 시작하지 못한 요청 수도 같습니다.

목표 3,600에서 평균 waiting은 61ms, 서버 시간은 21ms였습니다. 차이 약 40ms를 중간 장비의 검사시간이라고 읽으면 잘못된 진단이 됩니다. 이 실험은 그런 장비를 두지 않았고 부하발생기의 CPU 작업을 늘렸습니다. receiving과 sending도 함께 늘어, 서버 밖의 시간에 부하발생기의 영향이 섞일 수 있음을 보여줍니다.

[k6 문서](https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/)는 CPU 사용률을 80% 안쪽, 메모리를 90% 안쪽으로 유지하는 기준과 함께 회선, 가용 포트, 파일 디스크립터도 확인하도록 안내합니다. 이번 실험의 초당 3,000건 안팎은 이 컴퓨터와 스크립트의 조건에서 나온 값입니다. 다른 시험의 안전한 요청 수로 재사용할 수 없습니다.

부하발생기가 밀렸을 때의 신호는 이렇습니다.

- 구간별 시간이 서버 시간과 상관없이 같이 늘어남.
- dropped_iterations가 생김(시각 고정 방식일 때).
- 부하발생기의 CPU나 메모리, 회선 사용량이 한계 가까이 올라 있음.

## 시험 위치를 바꾸면 확인하는 경로도 바뀝니다

이제 같은 시나리오를 어디에서 실행할지도 정해야 합니다. 그림은 WAS에 직접 요청하는 경로, 내부 로드밸런서를 거치는 경로, 외부 사용자 경로를 비교합니다. 구성에 따라 실제로 지나가는 장비는 달라집니다.

<figure class="fig-figure">
  <div class="fig" data-fig="coverage" role="group" aria-label="표입니다. 행은 서버 처리 한계, 로드밸런서와 TLS 처리 한계, 방화벽과 WAF의 검사 지연과 속도 제한, 봇과 매크로 차단, 인터넷 구간 대역폭과 거리, 부하발생기 자체의 한계입니다. 열은 WAS에 바로, 내부 로드밸런서를 거쳐, 외부망 실제 경로입니다. 이 구성에서 서버 처리 한계는 세 곳 모두에서 드러나고, 로드밸런서와 TLS는 내부 로드밸런서와 외부망에서 드러납니다. 방화벽과 WAF, 봇 차단, 인터넷 구간은 외부망 경로에만 포함되며, 부하발생기의 한계는 어디서든 생깁니다."></div>
  <figcaption>부하를 거는 위치별로 시험에서 드러나는 문제 (모식도, 흔한 구성을 가정)</figcaption>
</figure>

WAS에 직접 요청하면 앞단 장비와 외부 회선을 거치지 않습니다. 서버의 처리 한도를 확인할 기준선은 얻지만, 제외된 경로의 검사 지연과 차단, 대역폭 한도는 확인하지 못합니다. 부하발생기 자체의 한계는 어느 위치에서든 생길 수 있습니다.

외부 경로만 시험하면 서버와 중간 경로가 함께 결과에 영향을 줍니다. 같은 시나리오와 부하 조건으로 직접 경로와 외부 경로를 비교하면 어느 구간에서 차이가 커지는지 좁힐 수 있습니다. 요청 크기, 연결 재사용과 판정 기준도 맞춰야 합니다.

- WAS에 바로(또는 같은 망 안에서): 서버가 낼 수 있는 처리량과 응답시간. 다른 시험의 기준선이 됩니다.
- 외부망의 실제 경로로: 그 위치에서 관찰한 HTTP 시간과 중간 구간의 문제. 사용자의 위치가 다양하면 위치별로 비교합니다.

외부망으로 부하를 걸 때는 미리 챙길 일이 있습니다. 보안장비, CDN, 호스팅이나 클라우드의 부하시험 정책을 확인하고, 시험 시간과 부하발생기 IP, 시험용 헤더를 보안 담당자와 정해 둡니다. 시험을 시작하기 전에 소규모로 돌려서 부하발생기 자체의 포화점도 확인하고요.

## 같은 요청인지 확인한 뒤 느린 구간을 좁힙니다

실제 결과를 볼 때는 다음 순서로 확인합니다.

1. 같은 API, 시간대, 상태 코드와 요청 집합을 비교하는지 봅니다. 평균과 p95를 섞거나, 차단된 요청까지 포함한 k6 결과를 성공한 서버 요청과 바로 비교하지 않습니다.
2. 부하발생기의 CPU·메모리·회선과 `dropped_iterations`를 확인합니다. 목표 부하를 보냈는지부터 알아야 서버와 경로를 평가할 수 있습니다.
3. duration과 별도로 blocked·connecting·TLS를 보고, sending·waiting·receiving 중 커진 구간을 찾습니다. 서버 시간은 범위를 확인해 같은 요청과 연결합니다.
4. 의심한 구간의 로그를 확인하고, 같은 부하 조건에서 시험 위치나 연결 설정을 바꿔 비교합니다.

아래 그림과 표는 구간을 찾은 뒤 확인할 후보입니다. 지표 하나만으로 원인이 확정되는 것은 아닙니다.

<figure class="fig-figure">
  <div class="fig" data-fig="triage" role="group" aria-label="k6에서 보이는 현상과 먼저 의심할 곳을 짝지은 일곱 줄의 표입니다. blocked, connecting, tls가 크고 duration이 정상이면 새 연결을 처리하는 곳입니다. sending이 크면 올리는 쪽 회선입니다. waiting이 크고 서버 시간이 작으면 중간 장비와 왕복 시간이고, 서버 시간도 크면 서버 자체입니다. receiving이 크고 waiting이 일정하면 내려받는 회선과 응답 크기입니다. 실패율이 오르고 응답시간과 APM 요청 수가 줄면 장비의 차단과 제한입니다. 모든 구간이 같이 늘고 dropped_iterations가 생기면 부하발생기의 자원입니다."></div>
  <figcaption>k6와 APM 숫자가 다를 때 먼저 볼 곳 (정리)</figcaption>
</figure>

각 후보를 확인할 자료는 다음과 같습니다.

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

## 3초와 200ms의 차이는 같은 요청에서 확인합니다

처음의 k6 p95 3초와 APM p95 200ms는 서버 밖의 시간을 확인하라는 단서입니다. 두 값을 빼서 특정 장비가 2.8초를 썼다고 결론낼 수는 없습니다. 먼저 같은 요청 집합인지 확인하고, 부하발생기가 목표를 따라갔는지 본 뒤 구간별 지표에서 차이가 커지는 곳을 찾습니다.

duration이 긴 요청이라면 sending·waiting·receiving을 나눠 보고 서버의 같은 요청 기록과 비교합니다. 연결 지연은 duration 밖의 지표에서 따로 확인합니다. 마지막으로 직접 경로와 사용자 경로를 같은 조건에서 비교하고 장비 로그를 대조하면 원인을 더 좁힐 수 있습니다. 이 글의 모형 실험은 지표를 읽는 방법을 보여주며, 실제 서비스에서 어느 구간이 느린지는 그 경로에서 측정해야 합니다.
