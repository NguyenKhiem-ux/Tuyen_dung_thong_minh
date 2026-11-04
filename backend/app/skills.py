"""Danh mục kỹ năng cho engine AI.

Mỗi dòng: (tên chuẩn, [bí danh], [kỹ năng được ngầm hiểu]).

- Bí danh giúp nhận ra cách viết khác nhau ("k8s" = kubernetes, "nodejs" = node.js).
- "Ngầm hiểu" chỉ dùng khi đối chiếu yêu cầu tuyển dụng: người có Django được coi là
  biết Python, người có MySQL được coi là biết SQL. Danh sách kỹ năng lưu trong hồ sơ
  CV vẫn chỉ gồm kỹ năng được nêu trực tiếp.
- Cố ý KHÔNG đưa vào các từ quá mơ hồ như "go", "r", "c", "rest", "ai", "ml", "ui".
"""
from __future__ import annotations

SKILLS: list[tuple[str, list[str], list[str]]] = [
    # Ngôn ngữ lập trình
    ("python", ["python3", "python 3"], []),
    ("java", [], []),
    ("javascript", ["js", "ecmascript", "es6"], []),
    ("typescript", [], ["javascript"]),
    ("c#", ["csharp", "c sharp"], []),
    ("c++", ["cpp"], []),
    ("golang", ["go lang"], []),
    ("rust", [], []),
    ("php", [], []),
    ("ruby", [], []),
    ("kotlin", [], []),
    ("swift", [], []),
    ("scala", [], []),
    ("sql", ["t-sql", "pl/sql"], []),
    ("html", ["html5"], []),
    ("css", ["css3", "scss", "sass"], []),
    ("bash", ["shell script", "shell scripting"], []),
    # Framework và nền tảng ứng dụng
    ("react", ["reactjs", "react.js"], ["javascript"]),
    ("react native", [], ["react", "javascript"]),
    ("next.js", ["nextjs", "next js"], ["react", "javascript"]),
    ("vue", ["vuejs", "vue.js"], ["javascript"]),
    ("angular", ["angularjs"], ["typescript", "javascript"]),
    ("node.js", ["nodejs", "node js"], ["javascript"]),
    ("express.js", ["expressjs", "express js"], ["node.js", "javascript"]),
    ("fastapi", [], ["python"]),
    ("django", [], ["python"]),
    ("flask", [], ["python"]),
    ("spring boot", ["springboot", "spring framework"], ["java"]),
    ("laravel", [], ["php"]),
    (".net", ["dotnet", ".net core", "asp.net", "asp.net core"], []),
    ("flutter", [], []),
    ("android", [], []),
    ("ios", [], []),
    # Dữ liệu và hạ tầng dữ liệu
    ("mysql", [], ["sql"]),
    ("postgresql", ["postgres", "psql"], ["sql"]),
    ("sqlite", [], ["sql"]),
    ("sql server", ["mssql", "microsoft sql server"], ["sql"]),
    ("mongodb", ["mongo"], []),
    ("redis", [], []),
    ("elasticsearch", ["elastic search"], []),
    ("kafka", ["apache kafka"], []),
    ("rabbitmq", [], []),
    ("apache spark", ["spark sql", "spark streaming"], []),
    ("pyspark", [], ["apache spark", "python"]),
    ("airflow", ["apache airflow"], []),
    ("dbt", [], ["sql"]),
    ("hadoop", [], []),
    ("snowflake", [], ["sql"]),
    ("bigquery", [], ["sql"]),
    # Cloud và DevOps
    ("docker", [], []),
    ("kubernetes", ["k8s"], []),
    ("aws", ["amazon web services"], []),
    ("azure", ["microsoft azure"], []),
    ("gcp", ["google cloud", "google cloud platform"], []),
    ("terraform", [], []),
    ("ansible", [], []),
    ("jenkins", [], []),
    ("github actions", [], ["github", "git", "ci/cd"]),
    ("gitlab ci", ["gitlab-ci"], ["gitlab", "git", "ci/cd"]),
    ("ci/cd", ["cicd", "ci cd", "continuous integration", "continuous delivery"], []),
    ("nginx", [], []),
    ("linux", [], []),
    ("git", [], []),
    ("github", [], ["git"]),
    ("gitlab", [], ["git"]),
    ("prometheus", [], []),
    ("grafana", [], []),
    # Máy học và dữ liệu
    ("machine learning", ["machine-learning"], []),
    ("deep learning", ["deep-learning"], ["machine learning"]),
    ("nlp", ["natural language processing", "xử lý ngôn ngữ tự nhiên"], []),
    ("computer vision", ["thị giác máy tính"], []),
    ("llm", ["large language model", "large language models"], []),
    ("pytorch", [], ["python", "deep learning"]),
    ("tensorflow", [], ["python", "deep learning"]),
    ("keras", [], ["python", "deep learning"]),
    ("scikit-learn", ["sklearn", "scikit learn"], ["python", "machine learning"]),
    ("pandas", [], ["python"]),
    ("numpy", [], ["python"]),
    ("matplotlib", [], ["python"]),
    ("opencv", [], ["computer vision"]),
    ("hugging face", ["huggingface"], ["nlp"]),
    ("mlops", [], ["machine learning"]),
    ("data science", ["khoa học dữ liệu"], []),
    # BI và văn phòng
    ("power bi", ["powerbi"], []),
    ("tableau", [], []),
    ("excel", ["ms excel", "microsoft excel"], []),
    ("google analytics", [], []),
    ("spss", [], []),
    # API, kiến trúc, kiểm thử
    ("rest api", ["restful", "restful api", "rest apis", "restful apis"], []),
    ("graphql", [], []),
    ("microservices", ["microservice"], []),
    ("grpc", [], []),
    ("oauth", ["oauth2", "oauth 2.0"], []),
    ("unit testing", ["unit test", "unit tests"], []),
    ("selenium", [], []),
    ("playwright", [], []),
    ("cypress", [], []),
    ("pytest", [], ["python"]),
    ("jest", [], ["javascript"]),
    # Quy trình và quản lý
    ("agile", [], []),
    ("scrum", [], ["agile"]),
    ("kanban", [], ["agile"]),
    ("jira", [], []),
    ("project management", ["quản lý dự án"], []),
    # Thiết kế và marketing
    ("figma", [], []),
    ("photoshop", [], []),
    ("illustrator", [], []),
    ("ui/ux", ["ux/ui", "ui ux", "ux design", "ui design"], []),
    ("seo", [], []),
    ("digital marketing", ["marketing số"], []),
    ("content marketing", [], []),
    ("google ads", ["google adwords"], []),
    ("facebook ads", [], []),
    ("copywriting", [], []),
]

# Nhóm kỹ năng tương đương: có một kỹ năng trong nhóm được tính một phần điểm cho yêu cầu
# là kỹ năng khác cùng nhóm (người dùng Vue có thể học React nhanh).
RELATED_GROUPS: list[set[str]] = [
    {"react", "vue", "angular", "next.js"},
    {"fastapi", "django", "flask"},
    {"aws", "azure", "gcp"},
    {"power bi", "tableau"},
    {"pytorch", "tensorflow", "keras"},
    {"mysql", "postgresql", "sql server", "sqlite"},
    {"jenkins", "github actions", "gitlab ci"},
    {"selenium", "playwright", "cypress"},
    {"kafka", "rabbitmq"},
    {"terraform", "ansible"},
    {"android", "ios", "flutter", "react native"},
    {"java", "kotlin", ".net", "c#"},
    {"seo", "google ads", "facebook ads", "content marketing", "digital marketing"},
    {"figma", "photoshop", "illustrator"},
    {"scrum", "kanban", "agile"},
]

# Từ thông dụng trong tiếng Anh: chỉ nhận là kỹ năng khi viết hoa như tên riêng
# (React, Swift, Rust) hoặc nằm trong dòng liệt kê nhiều kỹ năng.
AMBIGUOUS = {"react", "swift", "rust"}
