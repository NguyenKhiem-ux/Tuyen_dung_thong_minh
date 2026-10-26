# Engine AI v3

Lộ trình: v1 (bản gốc) → v2 (độ chính xác trích xuất) → v2.1 (từ mơ hồ, kỹ năng tương đương, mức thành thạo) → **v3 (bản này)**.
Tài liệu mô tả toàn bộ engine hiện tại, cách bật/tắt, và những giới hạn còn lại.

Phạm vi thay đổi so với bản gốc: `backend/app/` (ai_service, skills, config, models, schemas, routers), `backend/evaluation/`,
`backend/tests/`, bốn file giao diện (`api.js`, `styles.css`, `CandidateDashboard.jsx`, `RecruiterDashboard.jsx`).
Không có migration: bảng mới `ai_feedback` được tạo tự động khi backend khởi động lại. Chữ ký hàm cũ vẫn dùng được.

## Tổng quan v3

| Nhóm | Tính năng | Ở đâu |
|---|---|---|
| Chấm điểm | Kỹ năng **ưu tiên** vs **bắt buộc** (viết `docker (ưu tiên)` hoặc `~docker`) | `ai_service.py`, form đăng tin |
| Chấm điểm | Bằng chứng trích từ CV cho mỗi kỹ năng khớp | gợi ý AI của ứng viên |
| Chấm điểm | Trọng số cấu hình được (`AI_WEIGHTS`) | `.env` |
| Công bằng | Che email, số điện thoại, giới tính, ngày sinh, địa chỉ, hôn nhân, quốc tịch, tên ứng viên khỏi điểm ngữ nghĩa và dự án | `redact_pii` |
| Đầu vào | OCR cho CV dạng ảnh/scan (Tesseract, có tiếng Việt); từ chối CV không đọc được kèm hướng dẫn, và xóa file lỗi | `extract_text_from_file`, upload |
| Ứng viên | **Chất lượng CV 0-100** và gợi ý cải thiện cụ thể | trang "CV của tôi" |
| Nhà tuyển dụng | Nút **đánh giá điểm AI** (hợp lý / quá cao / quá thấp) trong hồ sơ ứng viên | cửa sổ chi tiết ATS |
| Quản trị | Tổng hợp phản hồi AI | `GET /api/admin/ai/feedback-summary` |
| Đo lường | So sánh v1/v3 trên dữ liệu thật, kiểm tra công bằng, báo cáo phản hồi, đề xuất trọng số từ kết quả tuyển/loại | `backend/evaluation/` |

Những thứ đã có từ v2/v2.1: danh mục 114 kỹ năng với bí danh và quan hệ ngầm định, khớp theo ranh giới từ, đọc kinh nghiệm theo ngữ cảnh và
khoảng thời gian làm việc, IDF học từ toàn bộ tin tuyển dụng, điểm dự án dựa trên bằng chứng, kỹ năng tương đương và "mới học" được nửa điểm.
Công thức tổng giữ nguyên: 40% kỹ năng + 25% kinh nghiệm + 20% ngữ nghĩa + 15% dự án.

## Cách dùng các tính năng mới

**Kỹ năng ưu tiên.** Trong ô "Kỹ năng yêu cầu" của tin tuyển dụng: `python, fastapi, sql, docker (ưu tiên)`. Các cách viết được nhận:
`~docker`, `docker (ưu tiên)`, `(nice to have)`, `(optional)`, `(preferred)`, `(bonus)`. Kỹ năng ưu tiên chỉ ảnh hưởng điểm bằng **một nửa**
(`PREFERRED_WEIGHT = 0.5`) và được nêu riêng trong lời giải thích.

**Trọng số.** `AI_WEIGHTS=0.5,0.2,0.2,0.1` (thứ tự: kỹ năng, kinh nghiệm, ngữ nghĩa, dự án; tổng bằng 1). Giá trị sai thì dùng mặc định, không làm hỏng chấm điểm.
Chỉ thay đổi khi `tune_weights.py` đề xuất dựa trên dữ liệu thật.

**OCR.** Chỉ chạy khi PDF gần như không có lớp chữ (dưới 40 ký tự) và máy có Tesseract. Nếu không có, ứng viên nhận thông báo rõ ràng để xuất lại CV dạng chữ.
- Ubuntu/Debian: `sudo apt install tesseract-ocr tesseract-ocr-vie`
- macOS: `brew install tesseract tesseract-lang`
- Windows: cài bản của UB Mannheim, chọn thêm ngôn ngữ Vietnamese, thêm thư mục cài đặt vào `PATH`.
- Tắt: `AI_OCR=false`. Đổi ngôn ngữ: `AI_OCR_LANGS=eng+vie`.

**Phản hồi của nhà tuyển dụng.** Mở hồ sơ ứng viên trong ATS và bấm một trong ba nút. Có thể sửa lại lựa chọn; mỗi nhà tuyển dụng một phản hồi cho mỗi đơn.

### API mới
| Endpoint | Quyền | Mô tả |
|---|---|---|
| `GET /api/resumes/me/insights` | ứng viên | `quality_score`, `tips[]`, `skills`, `experience_years` |
| `PUT /api/applications/{id}/ai-feedback` | nhà tuyển dụng sở hữu tin | `{label: agree\|too_high\|too_low, note}` |
| `GET /api/applications/{id}/ai-feedback` | nhà tuyển dụng sở hữu tin | phản hồi của mình hoặc `null` |
| `GET /api/admin/ai/feedback-summary` | admin | số lượng, tỉ lệ đồng ý, điểm trung bình theo nhãn, đã đủ dữ liệu để tinh chỉnh chưa |

`GET /api/recommendations` trả thêm `matched_skills`, `partial_skills`, `preferred_skills`, `evidence`.

## Công cụ đo (`backend/evaluation/`)

| Lệnh | Việc làm |
|---|---|
| `python evaluation/extraction_benchmark.py` | So v1 và v3 trên ca gán tay (hồi quy trích xuất) |
| `python evaluation/shadow_compare.py` | Chấm mọi CV x tin trong CSDL bằng cả v1 và v3, báo tương quan thứ hạng và nơi hai bản bất đồng |
| `python evaluation/fairness_audit.py` | Thêm/đổi giới tính, ngày sinh, địa chỉ, liên hệ, tên vào CV thật, báo độ lệch điểm (phải bằng 0,00) |
| `python evaluation/feedback_report.py` | Tỉ lệ đồng ý, xu hướng chấm lệch, độ tin cậy theo khoảng điểm |
| `python evaluation/tune_weights.py` | Đề xuất trọng số từ kết quả tuyển/loại thật. Từ chối khi dưới 30 đơn hoặc mỗi nhóm dưới 8 đơn. Không tự áp dụng |

Quy trình khuyến nghị khi đưa vào dùng thật: chạy `shadow_compare` để xem chỗ bất đồng, để nhà tuyển dụng dùng nút phản hồi vài tuần,
đọc `feedback_report`, và chỉ khi đủ dữ liệu mới chạy `tune_weights`.

## Kết quả kiểm chứng

- Backend: `cd backend && python -m pytest tests` → **81 test đạt** (13 test gốc, 68 test mới cho engine, API và công cụ), gồm cả OCR trên một PDF quét thật.
- Giao diện: `frontend/tests/ai-v3.spec.js` (3 test đạt). Bộ e2e đầy đủ: 15 đạt, 4 lỗi có từ trước và không liên quan AI (xem mục cuối).
- Trên dữ liệu seed: `shadow_compare` cho cùng chọn tin tốt nhất 5/5 CV; `fairness_audit` độ lệch điểm 0,00 ở cả 6 phép thử.
- Hiệu năng: gợi ý với 300 tin 0,31 giây (v1: 0,94 giây).
- Benchmark trích xuất (v1 → v3): kỹ năng F1 0,911 → 1,000 (23 ca); kinh nghiệm 43,8% → 100% (16 ca).

## Những điều cần đọc kỹ trước khi tin con số

1. **Benchmark là kiểm tra hồi quy, không phải độ chính xác thật.** Đáp án do người viết dự án gán tay, một phần sau khi đã hiểu engine; 100% không có nghĩa là hoàn hảo.
2. **Chưa có đánh giá trên CV thật.** Repo không có nội dung CV của bộ đánh giá cũ. Độ chính xác xếp hạng thật chỉ đo được khi có CV và nhãn của nhà tuyển dụng.
3. **Công bằng: phạm vi hạn chế.** `redact_pii` chỉ xóa các trường có nhãn rõ ràng ("Gender: …", "Địa chỉ: …"), email, số điện thoại và tên được truyền vào.
   Thông tin nhạy cảm viết trong câu văn tự do, ảnh trong CV, hoặc tên trường/nơi làm việc có thể gián tiếp tiết lộ giới tính/độ tuổi **không** bị che.
   Khi phát triển, test công bằng đầu tiên hóa ra không chứng minh được gì (vectorizer vốn đã bỏ qua từ lạ); đã viết lại theo kịch bản địa chỉ trùng địa điểm làm việc,
   có test chứng minh nó thật sự đỏ khi tắt tính năng che, và test đó đã bắt được một kẽ hở thật (nhãn "Phone:"/"Email:"). Đây là biện pháp giảm rủi ro, **không phải bằng chứng không thiên lệch**.
   Số năm kinh nghiệm vẫn tính từ ngày tháng gốc của CV (là dữ liệu nghề nghiệp), nên không hề trung lập về tuổi tác nếu nhà tuyển dụng đặt ngưỡng kinh nghiệm cao.
4. **Nửa điểm là phán đoán.** `PARTIAL_CREDIT`, `PREFERRED_WEIGHT` và `RELATED_GROUPS` do người viết đặt, chưa kiểm chứng bằng dữ liệu tuyển dụng.
5. **Phản hồi chưa tự động chỉnh engine.** Nó chỉ thu thập dữ liệu; việc chỉnh trọng số cần người xem kết quả `tune_weights` và quyết định.
6. **Từ mơ hồ** ("react", "swift", "rust") vẫn có thể sai ở vài câu hiếm. Danh mục có 114 kỹ năng, thiên về công nghệ thông tin và marketing; ngành khác cần bổ sung `skills.py`.
7. Điểm của các đơn ứng tuyển **đã nộp** không đổi (lưu cố định lúc nộp). Dùng `python reanalyze_resumes.py` (xem trước) và `--apply` để làm sạch phân tích của CV đã lưu.

## Triển khai

1. `pip install -r requirements.txt` (thêm `pytesseract`, `Pillow`; vẫn chạy bình thường nếu không cài chương trình Tesseract).
2. Khởi động lại backend; bảng `ai_feedback` tự được tạo.
3. Tùy chọn: sao các dòng `AI_*` từ `.env.example` vào `.env`.
4. Tùy chọn: `python reanalyze_resumes.py --apply`.

## Chưa làm, và vì sao

- Embedding / LLM thay TF-IDF: chưa có dữ liệu chứng minh hơn; thử nghiệm cũ trên 20 cặp không cho thấy lợi ích.
- Tự học trọng số liên tục: cần dữ liệu thật và người giám sát; hiện chỉ có công cụ đề xuất.
- Từ điển kỹ năng chuẩn quốc tế (ESCO/O*NET): nên làm khi cần mở rộng sang ngành ngoài CNTT.
- 4 test e2e lỗi từ trước: `home.spec.js` mong `/candidate/resume` nhưng code dùng `/candidate/cv`; `ats-pipeline.spec.js` tìm *button* "Ứng viên & ATS" trong khi menu là *link*;
  `ats-backend-api.spec.js` mong mã 403 nhưng API trả 200 cho chính ứng viên sở hữu đơn; `apply-flow-step3.spec.js` cần CSDL đã seed tại `backend/smart_recruitment.db` (đạt khi có dữ liệu).
