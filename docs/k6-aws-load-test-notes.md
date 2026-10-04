# k6와 AWS 대규모 부하테스트 글 편집 메모

본문은 `_writings/k6-aws-load-test.md`. 2026-10-04에 이번 글의 커밋·푸시를 요청받아 `published: false`와 `noindex: true`를 제거했다. 일반 빌드에서도 공개 글로 포함한다.

## 문체 수정

2026-10-04에 'AI스럽다'는 피드백을 받고 JMeter와 k6를 사용한 확인된 경험을 도입으로 옮겼다. 가상 조직 소개와 글의 범위 예고를 빼고, 독립 실행 → 한 대의 발생 성능 → 부하 분할 → 시작 시각 → 자원 비용과 전송료 순서로 연결했다. 실행 템플릿의 임의 버전, AWS 생성 명령, `run-at.sh`와 systemd 명령은 본문에서 제외했다. JavaScript와 실행 구간 예제, 가격과 그림 다섯 개는 유지했다. 문체를 바꾸기 위해 도입 과정이나 시행착오, 측정값을 추가하지 않았다.

## 사용자에게 확인된 경험과 아직 없는 근거

- 그동안 JMeter를 사용했고, 같은 설정의 환경에서 k6로 더 많은 부하를 발생시키는 것을 관찰했다고 말씀했다. Go 엔진이 유리하다는 인상이 있으나 인과관계나 배수는 확인하지 않았다.
- 원하는 구성은 AWS CLI로 EC2를 준비하고, 각 서버에 SSH로 명령을 보내 독립 실행하는 방식이다. 실제 사용한 자동화 코드나 서버별 결과는 아직 제공되지 않았다.
- 시험은 보통 1~3시간, 대규모 시험은 연 1회 정도라는 맥락이다. 모든 조직의 의무나 보편적인 주기로 쓰지 않는다.
- LoadRunner 대비 저렴하다는 관점을 원한다. 제품 종류, 계약 기간, 프로토콜, VU 라이선스 수, 견적과 기존 보유 라이선스는 확인되지 않았다. 절감률이나 LoadRunner 가격을 만들어 쓰지 않는다.
- 비동기 질문: 실제 AWS 리전·인스턴스 종류·대수, JMeter와 k6의 1대당 부하를 요청했다. 답이 오면 현재의 서울 c6i.large 가정과 경험 문장을 구체화한다.

본문의 구성, 실행 구간 명령, 300대·300,000회/초는 설명용 예시다. AWS에서 실행하거나 실제 서비스에 부하를 보내지 않았다. 인스턴스 타입은 가격 계산용 선택이며 1대당 1,000회/초를 보장하는 추천 사양이 아니다.

## 공식 가격을 확인한 방법

확인일: 2026-10-04. 웹 요금표가 읽어 오는 AWS 공개 JSON을 HTTPS로 읽었다. gzip 응답을 풀고 `regions['Asia Pacific (Seoul)']`에서 항목 이름으로 추출했다. 계정 API나 인증 정보는 사용하지 않았다.

| 항목 | 공식 데이터 URL과 키 | USD 단가 | rateCode |
| --- | --- | --- | --- |
| Linux c6i.large 온디맨드 | https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2.json → `OnDemand Linux-instancetype-c6i.large` | 0.096/시간 | `23MGE6DFM4A5NZ7M.JRTCKXETXF.6YS6EN2CT7` |
| gp3 저장량 | https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ebs.json → `Storage General Purpose gp3 GB Mo` | 0.0912/GB 월 | `MTK7D9SGKGYR3JD6.JRTCKXETXF.6YS6EN2CT7` |
| 인터넷 송신 첫 유료 10TB | https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/datatransfer/USD/current/datatransfer.json → `DataTransfer External Outbound Next 10 TB` | 0.126/GB | `9AS8NERTGECRPGT7.JRTCKXETXF.Q3Z75P77EN` |
| 공인 IPv4 1개 | https://aws.amazon.com/vpc/pricing/ → Public IPv4 Address | 0.005/시간 | 웹 요금표 |

EC2·EBS 데이터의 `hawkFilePublicationDate`: `2026-09-25T17:45:21Z`. 전송 데이터: `2026-09-16T13:22:08Z`. 원본 전체 JSON은 `/tmp/k6-aws-*-prices.json`에 임시로 저장했으며 저장소에는 넣지 않는다.

자원 비용 표의 가정: 100/300/500대, 시험 1/2/3시간, 준비·회수·종료 합계 30분, 각 서버마다 같은 생존 시간의 공인 IPv4 1개와 gp3 8GB. EBS는 30일 월로 환산한다. 기본 gp3 IOPS·처리량을 쓰고 종료 시 디스크를 삭제한다. 온디맨드, 할인·크레딧·세금 제외.

전송 계산의 가정: 300대 × 1,000회/초 × 2시간, 요청 1회당 평균 외부 송신량 1KiB 또는 4KiB. 예시 청구 GB는 2^30 바이트로 환산한다. 그달 무료 100GB를 이미 사용했고, 예시 전송량 전체에 첫 유료 10TB 단가를 적용할 여유가 있다고 가정한다. 4KiB도 약 8,239.75GB로 이 구간 안에 있다. 전송량은 실제 네트워크 계측 값이 아니며 NAT·리전 간·대상 환경의 비용은 더하지 않았다.

## 설명을 확인한 주요 원문

- https://github.com/grafana/k6 : Go 엔진과 JavaScript 시나리오, 오픈 소스 도구.
- https://jmeter.apache.org/usermanual/best-practices.html : CLI 실행·리스너 최소화, 분산 모드와 독립 실행 모두 가능.
- https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/ : CPU·메모리·네트워크·스크립트가 발생 성능을 제한, 응답 본문 버리기 등.
- https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/ : `rate`는 반복 시작률, 응답 지연과 독립적인 모델, VU 부족 시 목표률 유지 불가.
- https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/#execution-segment : 실행 구간과 공통 구간 목록. 시작 시각·노드 생존을 동기화하는 기능은 아님.
- https://grafana.com/docs/k6/latest/using-k6/execution-context-variables/ : `scenario.iterationInTest` 식별자. 여러 프로세스가 공유 상태를 만드는 것으로 설명하지 않는다.
- https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/ : 노드 요약 백분위수의 평균은 전체 백분위수로 합쳐지지 않음. 병합할 히스토그램 경로는 버전·수신기 확인 필요.
- https://docs.aws.amazon.com/cli/latest/reference/ec2/run-instances.html : 작은 배치로 생성, 클라이언트 토큰, 태그와 생성 결과 ID 보관.
- https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html : 온디맨드 vCPU 한도와 증설 요청.
- https://aws.amazon.com/ec2/pricing/on-demand/ : Linux 초 단위 과금, 최소 60초, 월 무료 인터넷 송신 100GB와 경로별 요금.
- https://aws.amazon.com/ebs/pricing/ : 저장량의 생존 시간 과금, gp3 기본 성능과 추가 성능 비용.
- https://www.opentext.com/products/professional-performance-engineering : LoadRunner Professional 계열의 기능 범위. 같은 부하에 대한 고정 비교 견적은 확보하지 못함.

## 그림과 검증

기존 SVG 런타임을 사용한다. 제어 명령과 HTTP 경로, 부하 복제와 구간 분할, 공통 시작 시각, 자원 비용, 전송 비용 다섯 그림. 그림의 시각·요청률은 모식도 또는 계산 가정으로 명시한다. 계산은 `scripts/figure_data/fleet.py`의 Decimal과 assert로 확인한다.

코드 검증: 공식 배포본 k6 v1.4.2를 임시 폴더에 받아 본문의 JavaScript 예제를 로컬 HTTP 모형에 실행했다. 전체 30회/초·2초·VU 예산 9/최대 18로 낮추고 세 실행 구간을 동시에 실행해 요청 21/20/20건, 실패와 dropped_iterations 0을 확인했다. 시작 경계의 즉시 실행 1건 때문에 짧은 시험의 총 건수는 단순한 시간 곱과 정확히 같지 않을 수 있다. 이 검증은 실행 구간의 동작 확인이며 도구 성능이나 AWS 발생 성능을 측정한 벤치마크가 아니다.

초기 초안의 `run-at.sh`는 bash 문법 검사와 지난 시각의 명령 거절·종료 코드 기록을 확인했다. AWS 생성과 Linux systemd·SSH 명령은 공식 옵션을 확인한 설명용 예제였으며 실제 AWS에서 실행하지 않았다. 이 셸 예제들은 문체 수정 과정에서 본문에서 제외했다.

미리보기 빌드의 4편과 일반 발행 빌드의 3편에 대해 기존 사이트 검사를 통과했다. 일반 빌드에서 초안 파일·목록 항목·사이트맵 항목이 없음을 확인했다. 초안을 지원하도록 기존 사이트 검사의 글 목록 선택만 조정했으며 기존 SEO 변경 내용은 유지했다. 그림 다섯 개의 최종 장면을 데스크톱·모바일 폭에서 확인했다. 실제 페이지의 좁은 화면에서는 숫자가 줄 중간에서 끊어지던 비용 표를 세 열로 바꿨다.

공개 설정으로 전환한 뒤에는 스테이징한 파일만 별도 폴더에 추출해 일반 빌드와 사이트 검사를 실행했다. 4편·9페이지 검사를 통과했고, 새 글이 일반 HTML·글 목록·사이트맵에 포함되는 것을 확인했다. 기존의 별도 SEO 작업은 이 커밋에 포함하지 않았다.
