"""k6 + AWS 글의 가정별 계산. AWS 호출 없이 고정한 공식 단가로 계산한다."""
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from common import write_data

# 2026-10-04 확인. 원본 항목과 요금 데이터 발행 시각은 docs/k6-aws-load-test-notes.md.
EC2 = Decimal('0.096')
IPV4 = Decimal('0.005')
GP3 = Decimal('0.0912')
DISK_GB = 8
MONTH_HOURS = 30 * 24  # EBS 일할 계산의 예시 월: 30일
OVERHEAD = Decimal('0.5')  # 준비와 결과 회수·종료까지 합쳐 30분이라는 가정
OUT_GB = Decimal('0.126')  # 서울 인터넷 송신의 첫 유료 10TB 구간


def money(value):
    return float(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def resources(nodes, test_hours):
    hours = Decimal(test_hours) + OVERHEAD
    return dict(nodes=nodes, test_hours=test_hours, billed_hours=float(hours),
                ec2=money(nodes * hours * EC2), ipv4=money(nodes * hours * IPV4),
                ebs=money(nodes * hours * DISK_GB * GP3 / MONTH_HOURS),
                total=money(nodes * hours * (EC2 + IPV4 + DISK_GB * GP3 / MONTH_HOURS)))


def traffic(kib):
    # 300대 × 초당 1,000회 × 2시간. 평균 외부 송신량 1/4 KiB, 청구 GB는 2^30 바이트로 계산.
    byte_count = 300 * 1000 * (2 * 3600) * kib * 1024
    gb = Decimal(byte_count) / (1024 ** 3)
    assert gb < 10240  # 예시 전체가 첫 유료 10TB 구간 안
    base = Decimal(str(resources(300, 2)['total']))
    return dict(kib=kib, gb=round(float(gb), 2), transfer=money(gb * OUT_GB),
                base=float(base), total=money(base + gb * OUT_GB))


def build():
    return dict(matrix=[resources(n, h) for n in (100, 300, 500) for h in (1, 2, 3)],
                cost=[resources(300, h) for h in (1, 2, 3)],
                traffic=[traffic(k) for k in (1, 4)],
                split=dict(nodes=3, global_rate=6000, each=6000 // 3, duplicate=6000 * 3),
                fleet=dict(nodes=300, each=1000, total=300 * 1000),
                start=dict(arrivals=[0, 12, 25], at=60))


def check(data):
    expected = [15.30, 25.50, 35.70, 45.91, 76.51, 107.11, 76.51, 127.52, 178.52]
    assert [r['total'] for r in data['matrix']] == expected
    assert resources(300, 2) == dict(nodes=300, test_hours=2, billed_hours=2.5,
                                    ec2=72.0, ipv4=3.75, ebs=0.76, total=76.51)
    assert [r['transfer'] for r in data['traffic']] == [259.55, 1038.21]
    assert [r['total'] for r in data['traffic']] == [336.06, 1114.72]
    assert data['split']['each'] * data['split']['nodes'] == data['split']['global_rate']
    assert data['fleet']['total'] == 300000
    assert data['fleet']['total'] * 7200 == 2160000000
    samples = [100] * 10000 + [2000] * 100
    assert samples[ceil(len(samples) * .95) - 1] == 100
    assert (100 + 2000) / 2 == 1050


if __name__ == '__main__':
    data = build()
    check(data)
    write_data('fleet', data)
