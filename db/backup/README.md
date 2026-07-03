# 数据库备份

`kids_english_family.sql` 是完整的 PostgreSQL 逻辑备份(schema + 全部数据),包含:

- 358 本词书、19811 个单词、241577 条词书条目(lilinji/English 全套 19 版本教材 + 中考/高考词表 + 样例种子)
- demo 账号(`demo@example.com` / `demo123456`)及其唯一学习档案(小明,小学五年级)和默认学习计划

生成方式:

```bash
pg_dump -h localhost -U kids_english --no-owner --no-privileges kids_english_family > db/backup/kids_english_family.sql
```

恢复到一个空库(库和用户需已存在,见根目录 README 的初始化说明;恢复时**不要**再执行 `db/init/` 下的脚本,两者取其一):

```bash
psql -h localhost -U kids_english -d kids_english_family -f db/backup/kids_english_family.sql
```

说明:备份由 PostgreSQL 18 的 pg_dump 生成,已移除 PG18 psql 专用的 `\restrict` 元命令,可用 PG 16+ 的 psql 恢复。
