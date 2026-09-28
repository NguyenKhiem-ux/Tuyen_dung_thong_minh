# Home Smart Recruitment AI

Ngay hoan thanh: 2026-09-26. Frontend: http://127.0.0.1:5174/

## 1. File da sua

- `frontend/src/App.jsx`: Home chung, URL cac man hinh, khoi phuc phien bang `/api/me`, kiem tra role, dang nhap va dang xuat.
- `frontend/src/components/Navbar.jsx`: mot header chung cho Guest, Candidate, Recruiter va Admin; menu mobile va menu tai khoan.
- `frontend/src/components/AuthForm.jsx`: them `initialMode` de `/register` mo dung form dang ky.
- `frontend/src/api.js`: export ham doc token, doc stored user an toan, goi API doc jobs cong khai va dung Vite proxy khi development.
- `frontend/vite.config.js`: proxy `/api` va `/health` toi backend hien tai, tranh loi CORS khi Vite dung cong khac 5173.
- `frontend/index.html`: favicon va description.
- `frontend/package.json`, `frontend/package-lock.json`: Lucide cho icon; Playwright trong devDependencies; script `test:e2e`.
- `frontend/.gitignore`: bo qua ket qua Playwright.
- `backend/app/routers.py`: mo hai API doc jobs cho Guest; tim kiem bo sung theo ten cong ty.

## 2. File moi

- `frontend/src/navigation.jsx`
- `frontend/src/components/HomePage.jsx`
- `frontend/src/components/PublicJobs.jsx`
- `frontend/src/public.css`
- `frontend/public/images/home-career.png`
- `frontend/public/favicon.svg`
- `frontend/playwright.config.js`
- `frontend/tests/home.spec.js`
- `HOME_IMPLEMENTATION.md`

Build tao lai `frontend/dist/`. Screenshot kiem tra nam trong `frontend/test-results/`.

## 3. Routing

Project truoc day chi dung state, chua co URL rieng cho cac tab. Su dung History API cua trinh duyet, khong them router dependency.

| URL | Quyen truy cap | Hanh vi |
| --- | --- | --- |
| `/` | Tat ca | Cung mot Home, ke ca sau dang nhap hoac refresh |
| `/jobs?q=...&location=...` | Tat ca | Danh sach va tim kiem jobs |
| `/jobs/:id` | Tat ca | Chi tiet job; apply yeu cau Candidate |
| `/login` | Guest | Form dang nhap hien co |
| `/register` | Guest | Form dang ky hien co |
| `/candidate/dashboard` | Candidate | Candidate Dashboard hien co |
| `/candidate/resume` | Candidate | CV hien co |
| `/candidate/applications` | Candidate | Don ung tuyen hien co |
| `/candidate/recommendations` | Candidate | Goi y AI hien co |
| `/candidate/interviews` | Candidate | Lich phong van hien co |
| `/recruiter/dashboard` | Recruiter | Recruiter Dashboard hien co |
| `/admin/dashboard` | Admin | Admin Dashboard hien co |

Back/Forward, refresh URL, logo ve Home va query tim kiem deu hoat dong. Redirect sau login chi chap nhan cac URL noi bo duoc cho phep.

## 4. Component

- `Navbar`, `Brand`: header dung chung theo auth state.
- `HomePage`, `HeroSection`, `SectionHeading`, `AIIntroSection`, `HomeCTA`, `Footer`.
- `JobSearchBar`, `JobGrid`, `JobCard`, `CompanyMark`: dung lai giua Home va trang tim viec.
- `JobsPage`, `JobDetailPage`: doc jobs cong khai; apply qua API hien co.
- `useJobs`: xu ly loading, error, retry va bo qua response cu khi doi query/roi trang.

## 5. API thuc te

| API | Cach dung |
| --- | --- |
| `GET /api/jobs?status=open&q=...&location=...` | Home va tim viec, khong can token |
| `GET /api/jobs/{id}` | Chi tiet job, khong can token |
| `GET /api/me` | Xac minh phien dang nhap va lay user that |
| `POST /api/auth/login` | Tai su dung auth hien co |
| `POST /api/auth/register` | Tai su dung auth hien co |
| `POST /api/jobs/{id}/apply` | Ung tuyen bang token Candidate |

Home chi tai danh sach jobs. Khong goi stats, resumes, applications, interviews hay recommendations tren Home.

Featured lay 3 jobs open, uu tien `applicants_count` giam dan, tiep theo `created_at` giam dan. Latest lay toi da 5 jobs theo `created_at` giam dan. Khong them du lieu gia de lap day grid; database hien co 4 jobs open. Khong gia logo cong ty; fallback la chu cai tu ten cong ty that.

## 6. Guest va Candidate

Guest xem Home, tim viec va chi tiet ma khong bi yeu cau login. Header co Trang chu, Tim viec, Smart AI, Ve chung toi, Dang ky, Dang nhap. CTA co tao tai khoan. Kham pha AI chuyen den login va quay ve recommendations sau khi thanh cong.

Candidate thay cac lien ket CV, don ung tuyen, goi y AI, lich phong van; ten va avatar initials lay tu user that. Dropdown co Dashboard, CV, don ung tuyen, dang xuat. Home giu nguyen cau truc; khong chuyen thanh dashboard. Dang xuat tai su dung luong xoa `sra_token` va `sra_user`.

Recruiter/Admin van xem Home va vao dashboard rieng tu menu tai khoan. Hanh dong danh rieng cho Candidate khong duoc thuc thi voi role khac.

## 7. Bao ve truy cap va backend

Khong co component `ProtectedRoute` trong project cu. `App.jsx` kiem tra phien va role truoc khi mount cac trang ca nhan. Guest vao URL Candidate duoc chuyen toi login; user sai role thay thong bao va lien ket dashboard cua minh.

Backend bat buoc phai dieu chinh vi ca `GET /api/jobs` va `GET /api/jobs/{id}` truoc day deu phu thuoc `current_user`. Chi bo yeu cau auth cho hai API doc nay. Cac API apply, CV, interviews, applications, recommendations, recruiter va admin giu nguyen auth/role dependencies.

Khong sua database, models, schemas, security, AI model, matching algorithm hay noi dung cac component dashboard hien co.

## 8. Build

`npm.cmd run build`: thanh cong.

## 9. Lint va kiem thu

Project khong co script lint; khong them lint framework.

`npm.cmd run test:e2e`: 8/8 bai kiem tra thanh cong bang Chrome headless.

- API jobs cong khai, job khong ton tai, search theo cong ty va dia diem.
- API ca nhan va thao tac tuyen dung van tu choi Guest.
- Guest Home, tim kiem, chi tiet, refresh, Back/Forward va form dang ky.
- Candidate login, Home sau refresh, menu va cac trang ca nhan, logout.
- AI redirect sau login va tu choi redirect ra website ben ngoai.
- Ung tuyen: loi thieu CV va thanh cong. Chi response apply trong test nay duoc mo phong de khong tao don trong database.
- Recruiter/Admin vao Home, dashboard rieng va bi chan khi truy cap trang Candidate.
- Skeleton, empty, error va retry. Response empty/error duoc mo phong chi trong test.
- Screenshot va kiem tra khong tran ngang tai 1920x1080, 1366x768, 1024x768, 768x1024, 390x844, 320x740.
- Kiem tra anh tai thanh cong, menu mobile Guest/Candidate, dong menu bang Escape, va console Home khong co loi.

Chay backend co du lieu demo hien tai, sau do `npm.cmd run dev -- --port 5174` va `npm.cmd run test:e2e` trong frontend. Test dang nhap dung tai khoan demo da duoc mo ta trong README. Co the doi `TEST_BASE_URL`, `TEST_API_URL`, `TEST_BROWSER`.

## 10. Phan chua trien khai

- Bookmark chi la icon UI disabled, vi chua co API luu viec lam.
- Dieu khoan, Chinh sach, Lien he trong footer la text khong click; chua tao trang moi.
- Khong them personalization/recommendations API tren Home.
- Khong thuc hien upload CV, tao tai khoan hoac apply that trong kiem thu de tranh thay doi du lieu hien tai.

## 11. Ghi chu kien truc

- Khi deploy frontend, web server can fallback cac URL SPA ve `index.html` de refresh `/jobs/:id` va cac route ca nhan. Vite dev da ho tro.
- API jobs hien tra toan bo ket qua, chua phan trang. Home dung API nay va chi render mot so card; can phan trang o backend khi du lieu lon. Khong refactor trong task nay.
- Production van dung `VITE_API_URL` hoac dia chi backend mac dinh hien co. Dev khong dat `VITE_API_URL` se dung proxy; neu dat URL backend truc tiep thi CORS phai cho phep origin frontend.
- CSS moi dung class rieng trong `public.css`, khong redesign cac trang dashboard/CV/Application/Interview.

## Asset minh hoa

Dung built-in imagegen; anh duoc copy vao `frontend/public/images/home-career.png` (khoang 1.2 MB). Khong dung banner hay logo TopCV.

Prompt da su dung:

```text
Create an original bitmap background illustration for the Smart Recruitment AI Vietnamese recruitment website homepage. Landscape wide 1536x640 composition. Clean professional softly shaded digital illustration, bright very pale mint-white background (#f0fbf5), NOT a screenshot and NO UI, NO text, NO typography, NO watermark, NO logos. Left 53 percent is entirely empty near-white space for live HTML headline and search form. Right 47 percent depicts a friendly young adult Vietnamese male candidate, black neatly styled hair, emerald green crew-neck sweater, seated at a light desk using an open silver laptop. Clearly visible face and laptop, not cropped. On the right of the desk a small leafy indoor plant in white pot. Behind the candidate a few faint abstract document and career chart motifs as part of the illustration. Flat editorial vector-like but raster artwork with soft dimensional shading, refined and approachable, human proportions. Desk aligned to bottom edge, scene contained in the far right half, candidate around 76 percent from left. NO orbs, NO blobs, NO bokeh, NO floating cards. Keep outer edges pale mint-white so the bitmap blends with a pale mint page band. Do not depict a finished webpage.
```
