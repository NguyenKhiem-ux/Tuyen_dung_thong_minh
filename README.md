# Smart Recruitment AI — v2 (Full MVP)

> Backend không tự tạo/migrate/seed database khi khởi động. Đọc [hướng dẫn database](docs/DATABASE_OPERATIONS.md) trước khi đổi `DATABASE_URL` hoặc dùng môi trường chung.

Nền tảng tuyển dụng thông minh với AI phân tích CV, chấm điểm & xếp hạng ứng viên,
gợi ý việc làm, quản lý quy trình phỏng vấn/tuyển dụng, và dashboard riêng cho
Ứng viên / Nhà tuyển dụng / Admin.

## Stack
- **Backend:** FastAPI, SQLAlchemy 2.0, JWT auth, PyMuPDF, python-docx
- **AI engine:** TF-IDF + cosine similarity, rule-based skill/experience/education/project
  extraction — chạy hoàn toàn local, không cần API key
- **Frontend:** React 18 + Vite (không dùng router ngoài, điều hướng bằng state)
- **Database:** SQLite mặc định; đổi `DATABASE_URL` sang PostgreSQL khi triển khai

## Tính năng
- Đăng ký / đăng nhập JWT với 3 vai trò: `candidate`, `recruiter`, `admin`
- Dashboard riêng biệt cho từng vai trò
- Upload CV PDF/DOCX (giới hạn 8 MB) → trích xuất text, kỹ năng, số năm kinh nghiệm,
  học vấn, dự án cơ bản
- CV Builder cho Candidate: mẫu Olive Sidebar hai cột có ảnh chân dung riêng tư,
  form + preview A4, bản nháp, PDF tiếng Việt,
  chọn CV đang sử dụng và đưa qua cùng pipeline AI Matching
- AI Matching CV ↔ Job: điểm Skill / Experience / Semantic / Project / Final
- Phát hiện Missing Skills / Skill Gap cho từng đơn ứng tuyển
- AI Job Recommendation cho ứng viên (xếp hạng toàn bộ job đang mở theo CV mới nhất)
- Nhà tuyển dụng: quản lý công ty, tạo/sửa/xóa/đóng-mở tin tuyển dụng
- AI Ranking ứng viên theo từng tin tuyển dụng
- Cập nhật trạng thái đơn ứng tuyển:
  `Applied → Screening → Interview → Offer → Hired / Rejected`
- Tạo & quản lý lịch phỏng vấn (online/onsite, đánh dấu hoàn tất/hủy)
- Đánh giá ứng viên (rating 1–5, điểm mạnh, điểm cần lưu ý, nhận xét)
- Dashboard thống kê cho ứng viên, nhà tuyển dụng và admin
- Admin: quản lý người dùng (đổi vai trò, khóa/mở khóa), xem toàn bộ job & công ty
- Tìm kiếm việc làm theo từ khóa/kỹ năng/địa điểm
- CORS cấu hình sẵn cho localhost (Vite dev server & build preview)
- `GET /health` health check, Swagger UI tại `/docs`
- `seed_demo.py` tạo dữ liệu demo đầy đủ (admin, recruiter, candidate, job, CV,
  application đã chấm điểm, 1 interview, 1 evaluation)

## Chạy Backend
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python scripts\check_schema.py
.\start_backend.ps1
```
API: http://127.0.0.1:8000/docs · Health check: http://127.0.0.1:8000/health

Nếu chưa có database, hoặc cần chạy seed demo trên database tạm, làm theo
[hướng dẫn database](docs/DATABASE_OPERATIONS.md). Backend không tự tạo schema, migrate hay seed khi khởi động.
Database đã có dữ liệu từ trước cần chạy migration CV Builder theo
[hướng dẫn riêng](docs/CV_BUILDER.md); không chạy migration nếu chưa backup và kiểm tra URL.

## Chạy Frontend
```bash
cd frontend
npm ci
npm run dev
```
Frontend: http://127.0.0.1:5173

Nếu backend không chạy ở `http://127.0.0.1:8000`, copy `.env.example` thành `.env`
trong thư mục `frontend` và chỉnh `VITE_API_URL`.

## Tài khoản demo (sau khi chạy `seed_demo.py`)
| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@smartrecruit.ai | Admin@123 |
| Nhà tuyển dụng | recruiter1@demo.ai | Password123 |
| Nhà tuyển dụng | recruiter2@demo.ai | Password123 |
| Ứng viên | candidate1@demo.ai | Password123 |
| Ứng viên | candidate2@demo.ai | Password123 |
| Ứng viên | candidate3@demo.ai | Password123 |

## Luồng demo
1. Đăng nhập với tài khoản `recruiter1@demo.ai` → xem tin đã đăng, xếp hạng AI của
   ứng viên `candidate1@demo.ai` cho vị trí Backend Developer, đã có lịch phỏng vấn mẫu.
2. Đăng nhập `candidate1@demo.ai` → xem đơn ứng tuyển, điểm chi tiết, gợi ý việc làm AI.
3. Đăng nhập `admin@smartrecruit.ai` → xem thống kê toàn hệ thống, quản lý người dùng.
4. Tự đăng ký tài khoản mới, tải CV thật (PDF/DOCX) để trải nghiệm AI phân tích trực tiếp.

## Cấu trúc thư mục
```
smart-recruitment/
├── backend/
│   ├── app/
│   │   ├── ai_service.py     # trích xuất CV + engine chấm điểm/xếp hạng AI
│   │   ├── config.py         # settings (.env)
│   │   ├── database.py       # engine/session SQLAlchemy
│   │   ├── deps.py           # auth dependency + role guard
│   │   ├── main.py           # FastAPI app, CORS, /health
│   │   ├── models.py         # User, Company, Job, Resume, Application, Interview, Evaluation
│   │   ├── routers.py        # toàn bộ API /api/*
│   │   ├── schemas.py        # Pydantic schemas
│   │   └── security.py       # hash mật khẩu + JWT
│   ├── seed_demo.py
│   └── requirements.txt
└── frontend/
    └── src/
        ├── api.js                        # fetch wrapper gọi backend
        ├── App.jsx                       # auth state + role routing
        └── components/
            ├── AuthForm.jsx
            ├── Navbar.jsx
            ├── CandidateDashboard.jsx
            ├── RecruiterDashboard.jsx
            ├── AdminDashboard.jsx
            └── Common.jsx                # badge, thanh điểm, card, tabs dùng chung
```

## Cài đặt từ repository mới clone

Yêu cầu: Git, Python 3.11+, Node.js 20+ và npm.

```powershell
git clone <repository-url>
cd smart-recruitment

cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Thay `SECRET_KEY` placeholder trong `backend/.env` bằng giá trị ngẫu nhiên riêng của môi trường. Không commit file `.env`.

Trong terminal khác:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

## Tạo database lần đầu và chạy migration

Repository không chứa database thật và backend không tự tạo, migrate hoặc seed database khi khởi động. Với database phát triển hoàn toàn mới:

```powershell
cd backend
$env:DATABASE_ALLOW_CREATE = "true"
python -m alembic upgrade head
Remove-Item Env:DATABASE_ALLOW_CREATE
python scripts\check_schema.py
```

Với database đã tồn tại, phải backup và đọc [Database operations](docs/DATABASE_OPERATIONS.md) trước khi chạy lệnh Alembic. Không `stamp` hoặc `upgrade` một database thật nếu chưa xác nhận `DATABASE_URL` và revision hiện tại.

```powershell
python -m alembic current
python -m alembic heads
python -m alembic upgrade head
```

Sau khi schema hợp lệ, chạy backend bằng `.\start_backend.ps1`. Dữ liệu demo chỉ được tạo trên database dùng một lần theo hướng dẫn trong `.env.example`; không bật demo seed trên database thật.

## Kiểm thử

Các test backend dùng SQLite tạm/in-memory, không dùng database được cấu hình trong `.env`:

```powershell
cd backend
python -m unittest discover -s tests -v
python -m compileall -q app tests scripts migrations

cd ..\frontend
npm run test:unit
npm run build
npm run test:e2e
```

## Dữ liệu riêng tư và đóng gói source

Repository chỉ chứa source, migrations, tests, dependency manifests, font/assets cần thiết, tài liệu và `.env.example`. Không commit database, backup, `.env`, CV, ảnh chân dung, uploads, logs, virtual environment, `node_modules` hay artifact test/build. Tài khoản trong `seed_demo.py` là dữ liệu giả dành riêng cho database demo dùng một lần; repository không được chứa dữ liệu người dùng thật.

Sau khi review và commit toàn bộ source cần thiết, tạo ZIP sạch trực tiếp từ Git index:

```powershell
git archive --format=zip --output=..\smart-recruitment-ai-source.zip HEAD
```

Lệnh này không đưa file ignored hoặc untracked vào ZIP.

## Ghi chú
Đây vẫn là kiến trúc MVP có thể mở rộng: engine AI hiện dùng TF-IDF + rule-based
(không cần API key). Có thể nâng cấp lên Sentence Transformers, LLM, RAG, hoặc
Agent layer mà không cần đổi schema API.
