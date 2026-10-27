# 本機開發／測試

只給**本機測試伺服器**用，跟正式伺服器（etfm.cooldragon313.partykit.dev）完全無關。

## 啟動
1. `npm install`（第一次）
2. `npm run dev` → 遊戲伺服器在 http://localhost:1999
3. 另開靜態伺服器：`python -m http.server 8765` → 打開 http://localhost:8765/index.html（刺牆賽跑）或 island.html（海嘯島）
4. 從 localhost 開的頁面會自動連本機伺服器（`PARTYKIT_HOST` 依網址判斷）

## 本機測試帳號
| 帳號 | 密碼 | 顯示名稱 |
|---|---|---|
| sbtest01 | local-b9eed10de076 | 繪本測試 |

本機伺服器資料存在 `.partykit/`（已 gitignore），刪掉就重來。
