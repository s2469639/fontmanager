"""웹용 글꼴 준비 스크립트 (한 번만 실행하면 됩니다).

사용법: python3 scripts/prepare-fonts.py <원본 글꼴 폴더>
  - 모든 글꼴은 OFL-1.1 (수정·재배포 허용)
  - 용량이 큰 글꼴(Noto Sans KR, Noto Serif KR, Gowun Batang)은
    KS X 1001 한글 2,350자 + 기본 라틴/숫자/기호만 남기고 줄입니다.
    (글꼴 이름은 바꾸지 않았고, 글리프 디자인은 수정하지 않았습니다.)
  - 앱에서 지원하지 않는 글자는 Pretendard(전체 11,172자)로 대체됩니다.
  - 결과물은 fontkit이 읽을 수 있는 WOFF(zlib) 형식으로 저장합니다.
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools import subset

src, out = sys.argv[1], os.path.join(os.path.dirname(__file__), "..", "public", "fonts")

def ksx1001_hangul():
    chars = []
    for cp in range(0xAC00, 0xD7A4):
        try:
            chr(cp).encode("euc_kr")
            chars.append(cp)
        except UnicodeEncodeError:
            pass
    return chars

BASIC = list(range(0x20, 0x7F)) + [0xB7, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x3000, 0x3001, 0x3002]
JAMO = list(range(0x3131, 0x318F))

JOBS = [
    # (원본 파일, 출력 이름, 줄일지 여부)
    ("PretendardVariable.ttf", "Pretendard", False),
    ("NotoSansKR.ttf", "NotoSansKR", True),
    ("NotoSerifKR.ttf", "NotoSerifKR", True),
    ("GowunBatang-Regular.ttf", "GowunBatang", True),
    ("IBMPlexSansKR-Regular.ttf", "IBMPlexSansKR", False),
    ("Jua.ttf", "Jua", False),
    ("BlackHanSans.ttf", "BlackHanSans", False),
    ("DoHyeon.ttf", "DoHyeon", False),
]

for fname, name, shrink in JOBS:
    path = os.path.join(src, fname)
    font = TTFont(path)
    if shrink:
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.glyph_names = False
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=ksx1001_hangul() + BASIC + JAMO)
        sub.subset(font)
    font.flavor = "woff"
    dest = os.path.join(out, name + ".woff")
    font.save(dest)
    print(f"{name}: {os.path.getsize(dest)/1024:.0f} KB")
