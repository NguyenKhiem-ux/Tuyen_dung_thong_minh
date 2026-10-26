"""Engine phân tích CV và chấm điểm mức độ phù hợp (v2).

Nâng cấp so với v1 (xem AI_UPGRADE.md):
  * Kỹ năng: khớp theo ranh giới từ + bí danh + quan hệ ngầm định (app/skills.py).
  * Kỹ năng yêu cầu ngoài danh mục vẫn được tìm trực tiếp trong CV.
  * Kinh nghiệm: đọc theo ngữ cảnh và theo khoảng thời gian làm việc.
  * Ngữ nghĩa: TF-IDF học IDF từ toàn bộ tin tuyển dụng (ScoringContext).
  * Dự án: chấm theo bằng chứng (mục dự án, liên kết, kỹ năng liên quan).
  * Trả thêm `warnings` khi CV thiếu dữ liệu để người xem không hiểu nhầm điểm thấp.

Chữ ký các hàm công khai của v1 được giữ nguyên; tham số mới đều là tùy chọn.
"""
from __future__ import annotations

import re
import unicodedata
import warnings
from dataclasses import dataclass
from datetime import date

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .config import settings
from .skills import AMBIGUOUS, RELATED_GROUPS, SKILLS

ENGINE_VERSION = "3.0"

# ---------------------------------------------------------------------------
# Hằng số và danh mục
# ---------------------------------------------------------------------------
SKILL_VOCAB = [name for name, _, _ in SKILLS]  # giữ lại tên cũ cho mã đang import

EDUCATION_KEYWORDS = [
    "university", "đại học", "cao đẳng", "college", "bachelor", "master's", "master of",
    "phd", "cử nhân", "thạc sĩ", "tiến sĩ", "kỹ sư",
]
PROJECT_KEYWORDS = ["project", "dự án", "github", "portfolio", "capstone"]

DEFAULT_WEIGHTS = {"skill": 0.40, "experience": 0.25, "semantic": 0.20, "project": 0.15}


def parse_weights(raw: str) -> dict[str, float]:
    """Đọc AI_WEIGHTS="a,b,c,d"; giá trị sai thì dùng mặc định (không bao giờ làm hỏng chấm điểm)."""
    try:
        values = [float(x) for x in (raw or "").split(",") if x.strip()]
        if len(values) != 4 or any(v < 0 for v in values) or not 0.99 <= sum(values) <= 1.01:
            return dict(DEFAULT_WEIGHTS)
        total = sum(values)
        return dict(zip(DEFAULT_WEIGHTS, (v / total for v in values)))
    except ValueError:
        return dict(DEFAULT_WEIGHTS)


WEIGHTS = parse_weights(settings.AI_WEIGHTS)
# Điểm cho kỹ năng chỉ đạt một phần: có kỹ năng tương đương, hoặc CV ghi mới học/cơ bản.
PARTIAL_CREDIT = 0.5

_ALIAS_TO_CANON: dict[str, str] = {}
_IMPLIES: dict[str, tuple[str, ...]] = {}
for _canon, _aliases, _implies in SKILLS:
    for _alias in [_canon, *_aliases]:
        _ALIAS_TO_CANON[_alias] = _canon
    _IMPLIES[_canon] = tuple(_implies)


def _phrase(text: str) -> str:
    """Regex cho một cụm từ: khoảng trắng linh hoạt."""
    return re.escape(text).replace(r"\ ", r"\s+")


_SKILL_RE = re.compile(
    r"(?<!\w)(?:"
    + "|".join(_phrase(a) for a in sorted(_ALIAS_TO_CANON, key=len, reverse=True))
    + r")(?!\w)"
)

_RELATED_OF: dict[str, set[str]] = {}
for _group in RELATED_GROUPS:
    for _name in _group:
        _RELATED_OF.setdefault(_name, set()).update(_group - {_name})

_HEDGE = re.compile(
    r"(?<!\w)(?:(?:currently|still|now|am|i'm)\s+learning|learning\s+(?:to|about)|beginner|"
    r"basic\s+(?:knowledge|level|understanding)|basics\s+of|exposure\s+to|some\s+knowledge|"
    r"currently\s+studying|đang\s+học|mới\s+học|kiến\s+thức\s+cơ\s+bản|mức\s+cơ\s+bản|"
    r"cơ\s+bản\s+về|biết\s+sơ)(?!\w)"
)
_TECH_FOLLOW = {"developer", "developers", "engineer", "native", "hooks", "js", "component", "components",
                "framework", "library", "and", "or", "apps", "app", "experience"}
_BAD_AFTER_AMBIGUOUS = r"(?!\s+(?:to|quickly|fast|well|positively|accordingly|swiftly|appropriately|promptly)\b)"

_VI_STOP = {
    "và", "của", "các", "là", "có", "cho", "với", "trong", "một", "những", "được", "để",
    "khi", "này", "đã", "sẽ", "cũng", "như", "từ", "tại", "về", "không", "rất", "theo",
    "bạn", "chúng", "tôi", "hoặc", "nếu", "thì", "mà", "ở", "đến", "các", "người",
}
_STOP_WORDS = sorted(set(ENGLISH_STOP_WORDS) | _VI_STOP)


# ---------------------------------------------------------------------------
# Đọc file và chuẩn hóa văn bản
# ---------------------------------------------------------------------------
def ocr_available() -> bool:
    """Có thể OCR không: cần thư viện pytesseract và chương trình Tesseract trên máy."""
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr_pdf(path: str, max_pages: int = 5) -> str:
    import fitz
    import pytesseract
    from PIL import Image

    langs = settings.AI_OCR_LANGS
    try:
        installed = set(pytesseract.get_languages())
        wanted = [l for l in langs.split("+") if l in installed]
        langs = "+".join(wanted) or "eng"
    except Exception:
        langs = "eng"
    texts = []
    with fitz.open(path) as doc:
        for page in list(doc)[:max_pages]:
            pix = page.get_pixmap(dpi=200)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            texts.append(pytesseract.image_to_string(image, lang=langs))
    return "\n".join(texts)


def extract_text_from_file(path: str, filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        import fitz
        with fitz.open(path) as doc:
            text = "\n".join(page.get_text() for page in doc)
        # PDF quét/ảnh gần như không có lớp chữ: thử OCR nếu máy có Tesseract.
        if len(text.strip()) < 40 and settings.AI_OCR and ocr_available():
            try:
                text = _ocr_pdf(path) or text
            except Exception:
                pass
        return text
    if ext == "docx":
        from docx import Document
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)
    raise ValueError("Only PDF and DOCX files are supported")


def normalize_text(text: str) -> str:
    # NFC: PDF hay trả tiếng Việt ở dạng tổ hợp (NFD) làm so khớp từ khóa sai.
    text = unicodedata.normalize("NFC", text or "").replace("’", "'")
    return re.sub(r"\s+", " ", text.lower()).strip()


# ---------------------------------------------------------------------------
# Kỹ năng
# ---------------------------------------------------------------------------
def _find_skills_normalized(norm: str) -> list[str]:
    return sorted({_ALIAS_TO_CANON[m.group(0)] if m.group(0) in _ALIAS_TO_CANON
                   else _ALIAS_TO_CANON[re.sub(r"\s+", " ", m.group(0))]
                   for m in _SKILL_RE.finditer(norm)})


def _is_real_skill(text: str, skill: str) -> bool:
    """Phân biệt framework React với động từ "react", ngôn ngữ Swift với tính từ "swift"."""
    word = skill.title()
    for m in re.finditer(rf"\b(?:{word}|{word.upper()}){_BAD_AFTER_AMBIGUOUS}", text):
        before = text[:m.start()].rstrip(" \t")
        if before and before[-1] not in ".!?\n":
            return True  # viết hoa giữa câu: tên riêng
        tail = text[m.end():m.end() + 24]  # đầu câu: chỉ nhận khi theo sau là ngữ cảnh kỹ thuật
        follow = re.match(r"\s*([A-Za-z.]+)", tail)
        if re.match(r"\s*[,/(&]", tail) or (follow and follow.group(1).lower() in _TECH_FOLLOW):
            return True
    for line in text.splitlines():  # dòng liệt kê: "skills: react, vue, node.js"
        low = normalize_text(line)
        if re.search(rf"(?<!\w){skill}(?!\w)", low) and len(_find_skills_normalized(low)) >= 3:
            return True
    return False


def extract_skills(text: str) -> list[str]:
    """Các kỹ năng được nêu trực tiếp (tên chuẩn, đã sắp xếp)."""
    text = unicodedata.normalize("NFC", text or "")
    return [s for s in _find_skills_normalized(normalize_text(text)) if s not in AMBIGUOUS or _is_real_skill(text, s)]


def _weak_skills(text: str) -> set[str]:
    """Kỹ năng mà mọi lần nhắc đến đều kèm cụm "đang học / cơ bản / learning / beginner"."""
    strong, weak = set(), set()
    for segment in re.split(r"[\n;]|\.\s", unicodedata.normalize("NFC", text or "").lower()):
        found = _find_skills_normalized(normalize_text(segment))
        (weak if _HEDGE.search(segment) else strong).update(found)
    return weak - strong


def expand_skills(skills) -> set[str]:
    """Thêm kỹ năng được ngầm hiểu (Django -> Python, MySQL -> SQL...)."""
    result = set(skills)
    stack = list(result)
    while stack:
        for implied in _IMPLIES.get(stack.pop(), ()):
            if implied not in result:
                result.add(implied)
                stack.append(implied)
    return result


def _clean_token(raw: str) -> str:
    token = normalize_text(raw)
    token = re.sub(r"\([^)]*\)", " ", token)
    token = token.strip(" .:;-•*·\t")
    return re.sub(r"\s+", " ", token)


_PREFERRED_RE = re.compile(
    r"(?:^\s*[~*]|\((?:[^)]*\b)?(?:ưu tiên|nice[- ]to[- ]have|optional|preferred|bonus|plus|không bắt buộc)\b[^)]*\)"
    r"|(?<!\w)(?:ưu tiên|nice[- ]to[- ]have|optional|preferred|bonus)(?!\w))",
    re.I,
)
PREFERRED_WEIGHT = 0.5  # kỹ năng "ưu tiên" ảnh hưởng điểm bằng một nửa kỹ năng bắt buộc


def _split_requirements(job_skills: str | None) -> list[tuple[str, bool]]:
    """Tách danh sách kỹ năng của tin: [(kỹ năng, là_ưu_tiên)]. Ưu tiên: "~docker", "docker (ưu tiên)"."""
    seen, items = set(), []
    for raw in re.split(r"[,;\n|•]", job_skills or ""):
        preferred = _PREFERRED_RE.search(raw) is not None
        token = _clean_token(_PREFERRED_RE.sub(" ", raw))
        if token and token not in seen:
            seen.add(token)
            items.append((token, preferred))
    return items


def _alternatives(token: str) -> set[str] | None:
    """Tên chuẩn thỏa yêu cầu `token`; None nếu kỹ năng nằm ngoài danh mục."""
    if token in _ALIAS_TO_CANON:
        return {_ALIAS_TO_CANON[token]}
    found = _find_skills_normalized(token)
    return set(found) if found else None


def _contains_phrase(norm_text: str, phrase: str) -> bool:
    pattern = r"(?<!\w)" + re.escape(phrase).replace(r"\ ", r"[\s\-]+") + r"(?!\w)"
    return re.search(pattern, norm_text) is not None


# ---------------------------------------------------------------------------
# Kinh nghiệm
# ---------------------------------------------------------------------------
_NUM = r"(\d{1,2}(?:[.,]\d)?)"
_YEAR = r"(?:years?'?|yrs?|năm)"
_EXP = r"(?:experience|exp\b|kinh nghiệm)"
_NOT_AGE = r"(?!\s*(?:-?\s*old|ago|tuổi|trước|of age))"

_EXPLICIT = [
    re.compile(rf"{_NUM}\s*\+?\s*{_YEAR}\s*(?:of\s+)?(?:[\w\-]+\s+){{0,3}}?{_EXP}"),
    re.compile(rf"(?:experience|kinh nghiệm)\s*(?:of|:|là|about|[-–])?\s*(?:over\s+|more than\s+|hơn\s+|trên\s+)?{_NUM}\s*\+?\s*{_YEAR}"),
    re.compile(rf"(?:over|more than|hơn|trên|nearly|almost|gần|about|khoảng)\s+{_NUM}\s*\+?\s*{_YEAR}{_NOT_AGE}"),
    re.compile(rf"{_NUM}\s*\+?\s*(?:years?|yrs?)\s+(?:in|as|with|working|developing|using)\b"),
    re.compile(rf"\bfor\s+{_NUM}\s*\+?\s*(?:years?|yrs?)\b{_NOT_AGE}"),
    re.compile(rf"{_NUM}\s*\+?\s*năm\s*(?:làm việc|kinh nghiệm|trong|làm)"),
]
_MONTHS_EXP = re.compile(rf"{_NUM}\s*\+?\s*(?:months?|tháng)\s*(?:of\s+)?(?:[\w\-]+\s+){{0,2}}?{_EXP}")
_GENERIC_YEARS = re.compile(rf"{_NUM}\s*\+?\s*(?:years?|yrs?)\b{_NOT_AGE}(?!\s*(?:warranty|guarantee|plan|contract))")

_MONTH_NUM = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
              "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
_DATE_PART = r"(?:(?:[a-z]{3,9}\.?|tháng\s*\d{1,2})[\s,/\-]+|\d{1,2}\s*[/.\-]\s*)?(?:19|20)\d{2}"
_RANGE = re.compile(
    rf"(?<![\w/])({_DATE_PART})\s*(?:-|–|—|to|đến|until|till)\s*"
    rf"({_DATE_PART}|present|current|now|today|ongoing|hiện tại|hiện nay|đến nay|nay)(?![\w])"
)

_SECTIONS = {
    "education": ("education", "học vấn", "academic background", "đào tạo", "trình độ học vấn"),
    "experience": ("experience", "work experience", "employment", "work history", "employment history",
                   "professional experience", "kinh nghiệm", "kinh nghiệm làm việc", "quá trình làm việc"),
    "projects": ("projects", "project", "personal projects", "side projects", "dự án", "dự án cá nhân", "portfolio"),
    "other": ("skills", "technical skills", "kỹ năng", "certifications", "certificates", "chứng chỉ",
              "awards", "giải thưởng", "languages", "ngôn ngữ", "summary", "profile", "tóm tắt",
              "objective", "mục tiêu", "interests", "sở thích", "references", "activities",
              "hoạt động", "publications"),
}
_HEADER_LOOKUP = {name: section for section, names in _SECTIONS.items() for name in names}

_EDU_RE = re.compile(
    r"(?<!\w)(?:university|college|bachelor(?:'s)?|bsc|b\.sc|msc|m\.sc|ph\.?d|doctorate|mba|"
    r"master's|masters? degree|master (?:of|in)|đại học|cao đẳng|cử nhân|thạc sĩ|tiến sĩ|học viện)(?!\w)"
)
_EDU_CONTEXT_RE = re.compile(r"(?<!\w)(?:tốt nghiệp|bằng|chuyên ngành|gpa|degree|graduat\w*)(?!\w)")
_NON_WORK_LINE_RE = re.compile(r"(?<!\w)(?:project|dự án|course|khóa học|certificate|chứng chỉ|certification)(?!\w)")


def _header_of(line: str) -> str | None:
    key = line.strip().lower().rstrip(":").strip()
    return _HEADER_LOOKUP.get(key) if 0 < len(key) <= 40 else None


def _to_float(value: str) -> float:
    return float(value.replace(",", "."))


def _month_index(part: str, today: date, default_month: int = 1) -> int | None:
    if part in {"present", "current", "now", "today", "ongoing", "hiện tại", "hiện nay", "đến nay", "nay"}:
        return today.year * 12 + today.month - 1
    year = re.search(r"(?:19|20)\d{2}", part)
    if not year:
        return None
    month = default_month
    name = re.search(r"[a-z]{3,}", part)
    vi = re.search(r"tháng\s*(\d{1,2})", part)
    num = re.match(r"\s*(\d{1,2})\s*[/.\-]", part)
    if vi:
        month = int(vi.group(1))
    elif num:
        month = int(num.group(1))
    elif name and name.group(0)[:3] in _MONTH_NUM:
        month = _MONTH_NUM[name.group(0)[:3]]
    if not 1 <= month <= 12:
        month = default_month
    return int(year.group(0)) * 12 + month - 1


def _worked_months(text: str, today: date) -> int:
    """Tổng số tháng của các khoảng thời gian làm việc, đã gộp phần chồng nhau."""
    section, spans = None, []
    for line in unicodedata.normalize("NFC", text or "").splitlines():
        header = _header_of(line)
        if header:
            section = header
            continue
        if section in {"education", "projects", "other"}:
            continue
        low = line.lower()
        if _EDU_RE.search(low) or _EDU_CONTEXT_RE.search(low) or _NON_WORK_LINE_RE.search(low):
            continue
        for match in _RANGE.finditer(low):
            start = _month_index(match.group(1), today)
            end = _month_index(match.group(2), today)
            if start is None or end is None or end < start or end - start > 50 * 12:
                continue
            spans.append((start, end))
    spans.sort()
    total, cur_start, cur_end = 0, None, None
    for start, end in spans:
        if cur_end is None or start > cur_end:
            if cur_end is not None:
                total += cur_end - cur_start
            cur_start, cur_end = start, end
        else:
            cur_end = max(cur_end, end)
    if cur_end is not None:
        total += cur_end - cur_start
    return total


def extract_experience(text: str, now: date | None = None) -> float:
    """Số năm kinh nghiệm: lấy giá trị lớn hơn giữa câu khai báo và tổng thời gian làm việc."""
    today = now or date.today()
    norm = normalize_text(text)
    explicit = []
    for pattern in _EXPLICIT:
        explicit.extend(_to_float(v) for v in pattern.findall(norm))
    explicit.extend(_to_float(v) / 12 for v in _MONTHS_EXP.findall(norm))
    explicit = [v for v in explicit if 0 < v <= 50]
    from_ranges = round(_worked_months(text, today) / 12, 1)
    best = max([*explicit, from_ranges]) if (explicit or from_ranges) else 0.0
    if best == 0.0:
        loose = [_to_float(v) for v in _GENERIC_YEARS.findall(norm)]
        best = max((v for v in loose if 0 < v <= 50), default=0.0)
    return round(min(best, 50.0), 1)


# ---------------------------------------------------------------------------
# Học vấn và dự án
# ---------------------------------------------------------------------------
def extract_education(text: str) -> list[str]:
    hits = []
    for line in unicodedata.normalize("NFC", text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        low = line.lower()
        is_edu = _EDU_RE.search(low) is not None
        if not is_edu and "kỹ sư" in low and _EDU_CONTEXT_RE.search(low):
            is_edu = True
        if is_edu:
            hits.append(line[:200])
    return hits[:5]


_BULLET = re.compile(r"^[\s\-•*▪●◦·\d.)]+")
_PROJECT_PREFIX = re.compile(r"^[\s\-•*▪●◦·\d.)]*(?:personal project|side project|project|dự án)\s*[:\-–]\s*", re.I)
_REPO_URL = re.compile(r"(?:github|gitlab|bitbucket)\.(?:com|io)/[\w.\-]+|behance\.net/[\w.\-]+|dribbble\.com/[\w.\-]+")
_LINK_WORDS = re.compile(r"(?<!\w)(?:github|gitlab|portfolio|behance|dribbble)(?!\w)")


def extract_projects(text: str) -> list[str]:
    lines = [l.strip() for l in unicodedata.normalize("NFC", text or "").splitlines() if l.strip()]
    items, section = [], None
    for line in lines:
        header = _header_of(line)
        if header:
            section = header
            continue
        low = line.lower()
        if len(line) <= 8 or section == "education":
            continue
        if section == "projects" or _PROJECT_PREFIX.match(line):
            items.append(_BULLET.sub("", _PROJECT_PREFIX.sub("", line, count=1))[:200])
    if not items:  # CV không có mục dự án rõ ràng: lấy các dòng có từ khóa dự án
        for line in lines:
            low = line.lower()
            if len(line) > 8 and not _EDU_RE.search(low) and any(k in low for k in PROJECT_KEYWORDS):
                items.append(_BULLET.sub("", line)[:200])
    seen, unique = set(), []
    for item in items:
        if item.lower() not in seen:
            seen.add(item.lower())
            unique.append(item)
    return unique[:8]


# ---------------------------------------------------------------------------
# Độ tương đồng ngữ nghĩa
# ---------------------------------------------------------------------------
def _slug(skill: str) -> str:
    special = {"c#": "csharp", "c++": "cpp", ".net": "dotnet"}
    return special.get(skill) or re.sub(r"[^a-z0-9]+", "_", skill).strip("_")


def _semantic_text(text: str) -> str:
    """Văn bản + tên kỹ năng chuẩn hóa, làm cầu nối giữa JD tiếng Việt và CV tiếng Anh."""
    norm = normalize_text(text)
    return norm + " " + " ".join(_slug(s) for s in _find_skills_normalized(norm))


def _new_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(stop_words=_STOP_WORDS, ngram_range=(1, 2), sublinear_tf=True, max_features=8000)


def _cosine(vectorizer: TfidfVectorizer, a: str, b: str, fit: bool) -> float:
    docs = [_semantic_text(a), _semantic_text(b)]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            matrix = vectorizer.fit_transform(docs) if fit else vectorizer.transform(docs)
        return float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])
    except ValueError:  # từ vựng rỗng sau khi bỏ stop words
        return 0.0


def similarity(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    return _cosine(_new_vectorizer(), a, b, fit=True)


def job_text(title: str | None, skills: str | None, description: str | None) -> str:
    return "\n".join(part for part in (title or "", skills or "", description or "") if part.strip())


class ScoringContext:
    """IDF học từ toàn bộ tin tuyển dụng để từ phổ biến ít trọng số, từ đặc trưng nhiều trọng số."""

    def __init__(self, documents: list[str]):
        docs = [_semantic_text(d) for d in documents if d and d.strip()]
        self.vectorizer: TfidfVectorizer | None = None
        if len(docs) >= 2:
            vectorizer = _new_vectorizer()
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    vectorizer.fit(docs)
                self.vectorizer = vectorizer
            except ValueError:
                self.vectorizer = None

    @classmethod
    def from_jobs(cls, jobs) -> "ScoringContext":
        return cls([job_text(j.title, j.skills, j.description) for j in jobs])

    def cosine(self, a: str, b: str) -> float:
        if not a.strip() or not b.strip():
            return 0.0
        if self.vectorizer is None:
            return similarity(a, b)
        return _cosine(self.vectorizer, a, b, fit=False)


# ---------------------------------------------------------------------------
# Công bằng: không để thông tin nhạy cảm ảnh hưởng điểm
# ---------------------------------------------------------------------------
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE_RE = re.compile(r"(?<![\w/])\+?\d(?:[\s.()-]?\d){8,13}(?![\w/])")
_SENSITIVE_LINE_RE = re.compile(
    r"^[\s\-•*▪●◦·]*(?:gender|sex|giới\s*tính|date\s+of\s+birth|d\.?o\.?b\.?|birth\s*(?:day|date|place)|born|"
    r"ngày\s+sinh|năm\s+sinh|nơi\s+sinh|age|tuổi|marital\s+status|tình\s+trạng\s+hôn\s+nhân|hôn\s+nhân|"
    r"nationality|quốc\s+tịch|religion|tôn\s+giáo|ethnicity|dân\s+tộc|address|địa\s+chỉ|nơi\s+ở|hometown|quê\s+quán|"
    r"photo|ảnh|height|chiều\s+cao|weight|cân\s+nặng|health|sức\s+khỏe|"
    r"phone|tel|mobile|e-?mail|điện\s+thoại|sđt|zalo|skype)\b\s*[:\-–].*$",
    re.I | re.M,
)


def redact_pii(text: str, extra_terms=()) -> str:
    """Xóa email, số điện thoại, các dòng nhạy cảm (giới tính, ngày sinh, địa chỉ, hôn nhân, quốc tịch...) và tên ứng viên.

    Chỉ dùng cho phần chấm điểm ngữ nghĩa/dự án; số năm kinh nghiệm vẫn tính từ văn bản gốc.
    Giới hạn: chỉ xóa các trường có nhãn rõ ràng ("Gender: ...") và tên được truyền vào.
    """
    text = unicodedata.normalize("NFC", text or "")
    text = _SENSITIVE_LINE_RE.sub(" ", text)
    text = _EMAIL_RE.sub(" ", text)
    text = _PHONE_RE.sub(" ", text)
    for term in extra_terms:
        term = (term or "").strip()
        if len(term) >= 3:
            text = re.sub(re.escape(term), " ", text, flags=re.I)
    return text


# ---------------------------------------------------------------------------
# Bằng chứng và gợi ý cải thiện CV
# ---------------------------------------------------------------------------
def _aliases_of(token: str) -> list[str]:
    canon = _ALIAS_TO_CANON.get(token, token)
    names = [a for a, c in _ALIAS_TO_CANON.items() if c == canon] or [token]
    return sorted(set(names), key=len, reverse=True)


def _evidence(text: str, token: str) -> str | None:
    """Đoạn CV (tối đa ~100 ký tự) nơi kỹ năng xuất hiện, để người xem kiểm chứng."""
    for alias in _aliases_of(token):
        m = re.search(r"(?<!\w)" + _phrase(alias) + r"(?!\w)", text, re.I)
        if m:
            start, end = max(0, m.start() - 45), min(len(text), m.end() + 45)
            snippet = re.sub(r"\s+", " ", text[start:end]).strip()
            return ("…" if start else "") + snippet + ("…" if end < len(text) else "")
    return None


_METRIC_RE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:%|\+|k\b|x\b|ms\b|users?|người dùng|khách hàng|triệu|tỷ|million|billion)")


def resume_tips(text: str, now: date | None = None) -> dict:
    """Chấm chất lượng CV (0-100) và đưa ra gợi ý cụ thể, dựa trên chính văn bản CV."""
    text = text or ""
    norm = normalize_text(text)
    skills = extract_skills(text)
    experience = extract_experience(text, now)
    projects = extract_projects(text)
    headers = {_header_of(line) for line in text.splitlines()} - {None}
    tips = []

    def add(code, severity, message):
        tips.append({"code": code, "severity": severity, "message": message})

    if len(norm) < 40:
        add("scan_suspect", "high", "Hầu như không đọc được chữ: có thể CV là bản quét/ảnh. Hãy xuất lại CV dạng PDF có chữ (không phải ảnh chụp).")
    elif len(norm) < 400:
        add("short_text", "high", "CV quá ngắn. Hãy bổ sung mô tả công việc, kết quả đạt được và dự án.")
    if len(norm) >= 40:
        if not skills:
            add("no_skills", "high", "Không nhận diện được kỹ năng nào. Hãy có mục Kỹ năng liệt kê rõ công nghệ/công cụ bạn dùng.")
        elif len(skills) < 5:
            add("few_skills", "medium", f"Chỉ nhận diện được {len(skills)} kỹ năng. Hãy liệt kê đầy đủ công nghệ và công cụ bạn đã dùng.")
        if experience == 0:
            add("no_experience", "medium", "Chưa thấy số năm hoặc mốc thời gian làm việc. Hãy ghi rõ như \"Tháng 3/2021 - nay\" hoặc \"3 năm kinh nghiệm\".")
        if not _METRIC_RE.search(norm):
            add("no_metrics", "medium", "Chưa có con số thể hiện thành tích (%, số người dùng, doanh thu...). Số liệu giúp CV thuyết phục hơn.")
        if not projects:
            add("no_projects", "medium", "Chưa thấy dự án nào. Hãy thêm mục Dự án nêu rõ công nghệ và vai trò của bạn.")
        if not (_REPO_URL.search(norm) or _LINK_WORDS.search(norm)):
            add("no_links", "low", "Chưa có liên kết GitHub/portfolio. Thêm liên kết để nhà tuyển dụng xem sản phẩm thật.")
        if not extract_education(text):
            add("no_education", "low", "Chưa thấy thông tin học vấn.")
        if len(headers) < 2:
            add("no_sections", "low", "Hãy dùng tiêu đề mục rõ ràng (Kinh nghiệm, Học vấn, Kỹ năng, Dự án) để hệ thống đọc chính xác hơn.")
    if len(norm) > 12000:
        add("too_long", "low", "CV rất dài. Nên rút gọn còn 1-2 trang, ưu tiên nội dung liên quan vị trí ứng tuyển.")
    penalty = {"high": 25, "medium": 12, "low": 5}
    score = max(0, 100 - sum(penalty[t["severity"]] for t in tips))
    return {"quality_score": score, "tips": tips, "skills": skills, "experience_years": experience,
            "engine_version": ENGINE_VERSION}


# ---------------------------------------------------------------------------
# Hồ sơ CV đã phân tích và chấm điểm
# ---------------------------------------------------------------------------
@dataclass
class _ResumeProfile:
    raw: str  # văn bản gốc: dùng cho kỹ năng, kinh nghiệm và bằng chứng
    text: str  # văn bản đã che thông tin nhạy cảm: dùng cho điểm ngữ nghĩa
    norm: str
    skills: set[str]
    expanded: set[str]
    strong_expanded: set[str]
    experience: float
    projects: list[str]
    project_norm: str
    link_evidence: float


def _build_profile(resume_text: str, resume_skills, resume_exp: float, now: date | None,
                   redact_terms=()) -> _ResumeProfile:
    raw = resume_text or ""
    norm = normalize_text(raw)
    clean = redact_pii(raw, redact_terms)
    skills = set(extract_skills(raw))
    if not skills and len(norm) < 30:  # gần như không có văn bản: dùng danh sách đã lưu
        skills = {_ALIAS_TO_CANON.get(normalize_text(s), normalize_text(s)) for s in (resume_skills or []) if s}
    experience = extract_experience(raw, now) if norm else float(resume_exp or 0)
    projects = extract_projects(clean)
    link = 1.0 if _REPO_URL.search(norm) else 0.5 if _LINK_WORDS.search(norm) else 0.0
    strong = expand_skills(skills - _weak_skills(raw))
    return _ResumeProfile(raw, clean, norm, skills, expand_skills(skills), strong, experience, projects,
                          normalize_text(" ".join(projects)), link)


# Mỗi yêu cầu: (kỹ năng, tên chuẩn thỏa yêu cầu hoặc None, trọng số)
Requirement = tuple[str, "set[str] | None", float]


def _skill_match(profile: _ResumeProfile, requirements: list[Requirement]):
    """Trả về (khớp đủ, khớp một phần, thiếu), mỗi phần tử là (nhãn, trọng số)."""
    matched, partial, missing = [], [], []
    for token, alternatives, weight in requirements:
        if alternatives is None:  # ngoài danh mục: tìm thẳng trong văn bản
            (matched if _contains_phrase(profile.norm, token) else missing).append((token, weight))
        elif alternatives & profile.strong_expanded:
            matched.append((token, weight))
        elif alternatives & profile.expanded:
            partial.append((f"{token} (mới học/cơ bản)", weight))
        else:
            related = sorted(
                {r for alt in alternatives for r in _RELATED_OF.get(alt, ())} & profile.strong_expanded
            )
            if related:
                partial.append((f"{related[0]} (tương đương {token})", weight))
            else:
                missing.append((token, weight))
    return matched, partial, missing


def _project_score(profile: _ResumeProfile, requirements: list[Requirement], job_doc: str,
                   ctx: ScoringContext) -> float:
    count = len(profile.projects)
    presence = 0.0 if count == 0 else 0.5 if count == 1 else 0.8 if count == 2 else 1.0
    relevance = 0.0
    if profile.project_norm:
        known = [alts for _, alts, _ in requirements if alts]
        if known:
            found = expand_skills(_find_skills_normalized(profile.project_norm))
            hits = sum(1 for alts in known if alts & found)
            relevance = min(1.0, hits / min(len(known), 4))
        else:
            relevance = min(1.0, ctx.cosine(job_doc, profile.project_norm) * 2)
    return round(100 * (0.35 * presence + 0.15 * profile.link_evidence + 0.50 * relevance), 2)


def _label(final: float) -> str:
    if final >= 75:
        return "rất phù hợp"
    if final >= 55:
        return "phù hợp"
    if final >= 35:
        return "phù hợp một phần"
    return "ít phù hợp"


def _score(profile: _ResumeProfile, job_description: str, job_skills: str, min_exp: float,
           job_title: str, ctx: ScoringContext) -> dict:
    parsed = _split_requirements(job_skills)
    if parsed:
        requirements: list[Requirement] = [
            (t, _alternatives(t), PREFERRED_WEIGHT if pref else 1.0) for t, pref in parsed
        ]
    else:
        derived = _find_skills_normalized(normalize_text(f"{job_title} {job_description}"))
        requirements = [(t, _alternatives(t), 1.0) for t in derived]
    matched, partial, missing = _skill_match(profile, requirements)

    min_exp = float(min_exp or 0)
    total_weight = sum(w for _, _, w in requirements)
    credit = sum(w for _, w in matched) + PARTIAL_CREDIT * sum(w for _, w in partial)
    skill_score = 100.0 if not requirements else credit / total_weight * 100
    experience_score = 100.0 if min_exp <= 0 else min(profile.experience / min_exp, 1.0) * 100
    doc = job_text(job_title, job_skills, job_description)
    semantic_score = ctx.cosine(doc, profile.text) * 100
    project_score = _project_score(profile, requirements, doc, ctx)

    final = round(
        WEIGHTS["skill"] * skill_score + WEIGHTS["experience"] * experience_score
        + WEIGHTS["semantic"] * semantic_score + WEIGHTS["project"] * project_score, 2
    )

    notes = []
    if len(profile.norm) < 200:
        notes.append("CV có rất ít văn bản (có thể là file quét/ảnh) nên điểm có thể thấp hơn thực tế")
    if not profile.skills:
        notes.append("không nhận diện được kỹ năng nào trong CV")
    if profile.experience == 0 and min_exp > 0 and len(profile.norm) >= 200:
        notes.append("không tìm thấy số năm kinh nghiệm rõ ràng trong CV")

    matched_names = [t for t, _ in matched]
    partial_names = [t for t, _ in partial]
    required_missing = sorted(t for t, w in missing if w >= 1.0)
    preferred_missing = sorted(t for t, w in missing if w < 1.0)
    preferred_names = [t for t, _, w in requirements if w < 1.0]

    explanation = (
        f"Phù hợp {final}% ({_label(final)}). "
        f"Kỹ năng khớp {len(matched_names)}/{len(requirements)}: {', '.join(matched_names) if matched_names else 'chưa xác định'}. "
        + (f"Khớp một phần (tính {PARTIAL_CREDIT:g} điểm): {', '.join(partial_names)}. " if partial_names else "")
        + f"Kinh nghiệm hồ sơ: {profile.experience:g} năm; yêu cầu: {min_exp:g} năm. "
        f"Kỹ năng còn thiếu: {', '.join(required_missing) if required_missing else 'không phát hiện kỹ năng bắt buộc còn thiếu'}. "
        + (f"Kỹ năng ưu tiên chưa có (ảnh hưởng nhẹ): {', '.join(preferred_missing)}. " if preferred_missing else "")
        + f"Điểm ngữ nghĩa: {semantic_score:.1f}% và điểm dự án: {project_score:.1f}%."
    )
    if notes:
        explanation += " Lưu ý: " + "; ".join(notes) + "."

    return {
        "skill_score": round(skill_score, 2),
        "experience_score": round(experience_score, 2),
        "semantic_score": round(semantic_score, 2),
        "project_score": round(project_score, 2),
        "final_score": final,
        "explanation": explanation,
        "job_skills": [t for t, _, _ in requirements],
        "preferred_skills": preferred_names,
        "missing_skills": sorted(required_missing + preferred_missing),
        "matched_skills": sorted(matched_names),
        "partial_skills": partial_names,
        "warnings": notes,
        "engine_version": ENGINE_VERSION,
    }


def _attach_evidence(profile: _ResumeProfile, match: dict, limit: int = 8) -> dict:
    evidence = {}
    for token in match["matched_skills"][:limit]:
        snippet = _evidence(profile.raw, token)
        if snippet:
            evidence[token] = snippet
    match["evidence"] = evidence
    return match


def match_candidate(job_description: str, job_skills: str, min_exp: float,
                    resume_text: str, resume_skills: list[str], resume_exp: float,
                    *, job_title: str = "", context: ScoringContext | None = None,
                    now: date | None = None, redact_terms=(), with_evidence: bool = True):
    profile = _build_profile(resume_text, resume_skills, resume_exp, now, redact_terms)
    ctx = context or ScoringContext([])
    match = _score(profile, job_description or "", job_skills or "", min_exp, job_title or "", ctx)
    return _attach_evidence(profile, match) if with_evidence else match


def recommend_jobs_for_resume(resume_text: str, resume_skills: list[str], resume_exp: float, jobs: list,
                              context: ScoringContext | None = None, now: date | None = None,
                              redact_terms=(), evidence_top: int = 10) -> list[dict]:
    """Xếp hạng danh sách Job (ORM) theo mức độ phù hợp với một CV."""
    profile = _build_profile(resume_text, resume_skills, resume_exp, now, redact_terms)
    ctx = context or ScoringContext.from_jobs(jobs)
    scored = [
        {"job": job, "match": _score(profile, job.description or "", job.skills or "", job.min_experience,
                                     job.title or "", ctx)}
        for job in jobs
    ]
    scored.sort(key=lambda item: item["match"]["final_score"], reverse=True)
    for item in scored[:evidence_top]:
        _attach_evidence(profile, item["match"])
    return scored
