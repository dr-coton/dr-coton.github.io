// 실험용 k6 스크립트. 옵션은 환경 변수 OPTS(JSON)로 받는다. 응답의 Server-Timing 헤더에서 서버가 일한 시간을 읽어 server_time으로 남긴다.
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const serverTime = new Trend('server_time', true);
const BASE = __ENV.BASE || 'http://127.0.0.1:8101';
const PATH = __ENV.TARGET || '/app?ms=50';
const BODY = __ENV.BODY_KB ? 'x'.repeat(Number(__ENV.BODY_KB) * 1024) : null;

export const options = JSON.parse(__ENV.OPTS || '{}');

function record(res) {
  const m = /dur=([\d.]+)/.exec(res.headers['Server-Timing'] || '');
  if (m) serverTime.add(Number(m[1]));
}

// 응답을 받은 뒤 스크립트가 CPU를 쓰는 상황(체크, 파싱, 암호화 등)을 흉내 낸다
function burn(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy */ }
}

export default function () {
  if (__ENV.BATCH) {
    http.batch(Array.from({ length: Number(__ENV.BATCH) }, () => ['GET', BASE + PATH])).forEach(record);
  } else {
    record(BODY ? http.post(BASE + PATH, BODY) : http.get(BASE + PATH));
  }
  if (__ENV.BURN_MS) burn(Number(__ENV.BURN_MS));
}
