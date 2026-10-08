# CV-JD Evaluation Dataset

Thu muc nay dung de tao dataset ground truth danh gia chat luong matching CV-JD cua Smart Recruitment AI.

Script `export_cv_jd_pairs.py` chi doc database hien tai va ghi file CSV, khong insert/update/delete `Resume`, `Job` hay bang nao khac.

## File CSV

File output:

```text
backend/evaluation/data/cv_jd_labels.csv
```

Moi dong la mot cap `Resume x Job`, khong lap trung `resume_id + job_id`.

Cot:

- `pair_id`: ma cap, vi du `resume_1_job_3`
- `resume_id`: ID ho so ung vien
- `candidate_id`: ID ung vien, khong export email/password/token
- `job_id`: ID cong viec
- `job_title`: tieu de cong viec
- `job_skills`: ky nang yeu cau trong JD
- `min_experience`: so nam kinh nghiem toi thieu
- `ai_score`: diem AI hien tai neu script import duoc `app.ai_service.match_candidate`
- `human_relevance`: nhan do con nguoi gan
- `notes`: ghi chu khi gan nhan

## Nhan human_relevance

Dung thang diem:

- `0` = khong phu hop
- `1` = it phu hop
- `2` = kha phu hop
- `3` = rat phu hop

`human_relevance` la ground truth do con nguoi gan. Khong dung `ai_score` de quyet dinh `human_relevance`; `ai_score` chi de so sanh/chat luong model sau khi da co nhan nguoi.

## Cach chay

Tu thu muc goc project:

```bash
python backend/evaluation/export_cv_jd_pairs.py
```

Hoac tu thu muc `backend`:

```bash
python evaluation/export_cv_jd_pairs.py
```

Script se co gang reuse truc tiep `app.ai_service.match_candidate` de tinh `ai_score`. Neu moi truong chay thieu dependency hoac import bi loi, script van export CSV va de trong `ai_score`, dong thoi in ly do ra terminal.
