# HANDOFF — Escape Tsunami 繪本版改版

> 最後更新：2026-10-22（家裡 PC）
> 分支：**`restyle-storybook`** — 2026-10-22 已合併進 `main` 上線（繪本版＝正式版）
> 最後 commit：見 `git log -1`（交接時以 GitHub 上這個分支的最新 commit 為準）

---

## 🧭 這是什麼專案
給 12 歲兒子玩的多人跑酷撿錢遊戲（靈感來自 Roblox《Escape Tsunami For Brainrots》）。
- 正式版：https://cooldragon313.github.io/escapetsunamiformoney/ （GitHub Pages，`main` 一推就上線 → **改動一律先走分支**）
- 🗺 **檔案結構（2026-10-27 起，已上架：main `283cdc6`，伺服器 Cloudflare 版本 `e981869e`）**：網址一打開＝**刺牆賽跑** `index.html`（主玩法）；**海嘯島** = `island.html`（商店、造型、蓋房子，海嘯撿錢當副玩法）
  - `index.html` 是**產生出來的**：改 `race/race.src.html` 後跑 `python tools/build_race.py`。角色／造型／繪本畫風／揮棒自動從 `island.html` 抄過去，不要手改 `index.html`
  - 賽跑跑完的金幣走伺服器 `POST /race_reward`（**加錢不覆蓋**，上限 120、30 秒一次）；島上開著會收到 `race_reward` 訊息同步
- 伺服器：**Cloudflare Worker**（Bernie 自己的帳號 cooldragon313@gmail.com），正式網址 `etfm.cooldragon313.workers.dev`
  - 遊戲邏輯仍在 `party/server.js`（沒改）；`cloudflare/worker.js` 是轉接殼，把它包成 Durable Object
  - 部署：`cd cloudflare && npx wrangler deploy`（需 `npx wrangler login`）；密鑰 `AUTH_SECRET` 已設，換掉會讓所有人重新登入
  - ⚠️ Claude 的沙箱連不到 Cloudflare API，部署要在沙箱外跑
  - PartyKit 託管 2026-10-16 停止部署、10-23 刪除專案 → 舊帳號／存款／排行榜**沒搬過來**，大家要重新註冊
- 連不上伺服器時：遊戲 6 秒內自動切單人模式（`?solo=offline`），用這台裝置快取的進度玩
- 開發模式：Bernie 當製作人，Claude 負責企劃、程式、測試；Bernie 和兒子用手機玩、給意見

## 📱 手機試玩連結（最新）
**https://claude.ai/artifact/KQxdw7JqrC6D7sKLJcfgXV**
- 單人模式、不連伺服器、不用登入；進度存在手機瀏覽器；每次開場至少 $777
- 更新方式：把 `island.html` 去掉 `<html>/<head>/<body>` 外殼後發布到同一個 artifact（上一個 session 用 scratchpad 的 `storybook-preview.html`）
- ⚠️ `…JzZMRGcv…` 是舊的「風格比較頁」，不要跟試玩版搞混

## 📚 先讀這些
1. `HANDOFF.md`（本檔）
2. `docs/PLAN-去像素化.md` — 定案規格、點子池、**決策紀錄**（最下面那張表就是時間軸）
3. `docs/LOCAL-DEV.md` — 本機跑伺服器＋測試帳號
4. `README.md` — 原本的遊戲說明（部分內容已過時，例如「坑」已改成石頭）
5. `island.html`（海嘯島，約 6000 行，**不要整份讀**，用搜尋找下面列的區塊）；刺牆賽跑看 `race/race.src.html`

## ✅ 這個分支做完的事
| 項目 | 重點 | 在 island.html 搜尋 |
|---|---|---|
| 繪本風介面 | 奶油紙面板、咖啡色框、圓體字 | `STORYBOOK THEME` |
| 卡通著色 | 所有 Lambert 材質自動變 4 階 toon；咖啡色描邊 | `STORYBOOK LOOK`、`sbOutline` |
| Q 版角色 | 大圓頭、20 件造型重新定位 | `function buildAvatar`、`COSMETIC_TWEAKS` |
| 海嘯 | 捲浪造型、水紋、浪花 | `function createTsunami` |
| 手機版面 | 精簡 HUD、按鈕縮小、直拿提示 | `PHONE LAYOUT` |
| 新手村 | 200m 防波堤，大浪過了變小浪 | `BREAKWATER` |
| 木箱 | 揮棒敲開，掉木頭＋金幣 | `WOODEN CRATES` |
| 石頭掩護 | **取代坑**；躲石頭後面（淡藍色區）所有浪都安全 | `SHELTER ROCKS`、`shelterAt` |
| 背包 | 新造型分頁「背包」5 款；死掉掉自己的背包 | `BAG_SKINS`、`makeChestMesh` |
| 衝浪 | 青綠「衝浪浪」＋衝浪板 4 款 skin（只換外觀與姿勢） | `SURFING`、`startSurf`、`surfTick` |
| 其他 | 浪穿透 bug 修正、鏡頭縮放鈕、聊天鈕、語音轉文字🎤、音樂預設關、商店 ✕／關閉鈕 | — |

伺服器（`party/server.js`）也有改：死亡背包帶 skin、新增 `surf` 浪種。

## 🆕 2026-10-16
- 家裡 PC 修的東西**只發布到試玩連結、沒推 GitHub**；公司 PC 已從試玩連結搬回程式（commit `310e3a4`）：固定浪速＋6 秒預警、浪雷達、手機鏡頭、金色 $ 幣、商店關閉鈕置底
- `party/server.js` 已照同公式改浪速（家裡那份沒傳上來）
- **正式版還沒上**：`npx partykit deploy` 和推 `main` 需要 Bernie 自己執行（被安全機制擋）
- 🔔 **規矩：不管哪台電腦，收工前一定要 commit＋push，只發布試玩連結不算**

## 🆕 2026-10-22
- 鍵盤卡住修正（失焦／聊天／注音輸入法吃掉放開訊號 → 自動放開）
- 伺服器搬到 Cloudflare、正式版上線繪本版（`main` 已合併並推送）
- 本機測多人：`npm run dev:cf`（wrangler，port 1999）＋ 開 `localhost` 的 index.html（賽跑）或 island.html（海嘯島）
- 揮棒（雙手橫掃＋殘影）、二段跳（商店升級）、畫質改 Shift+G、當機提示畫面 → 已上線
- 🐛 **黑畫面根因（已修，main `9954644`）**：遊戲時鐘 `t` 在第一幀可能是**負數**（rAF 時間戳早於起始時間）。
  `t < (state.shakeUntil || 0)` 在 shakeUntil 未設時成立 → 以 NaN 強度震鏡頭 → 鏡頭位置變 NaN、之後永遠 NaN → 全黑，看載入時運氣。
  **規矩：所有「t < xxxUntil」判斷都要先確認 xxxUntil 有設過**；鏡頭每幀有 NaN 防護網。
  我手動餵幀的測試抓不到它（時鐘都是正的），要用「比起始時間早的時間戳」才重現。

## ⚠️ 已知問題／待確認
1. **手機上商店能不能關**：已加 ✕、底部「關閉」、點外面關閉三種方式，還沒在真手機確認
2. Bernie 說過「手機版壞了」，細節不明 → 下次先問清楚或實機走一輪
3. 多人連線時，**別人看不到你的衝浪板和姿勢**（只看得到位置）
4. 預覽版 rAF 在背景分頁會暫停，Claude 的瀏覽器測試只能「手動呼叫 update()」，手感需要人玩
5. 難度（賺錢速度、浪頻率）**刻意先不調**，最後統一處理

## 👉 下次第一件事
**先不要加新功能。** 在手機尺寸（812×375）完整走一輪：
開始 → 開商店／關商店 → 造型店買衝浪板 → 遇到衝浪浪去衝 → 死掉 → 撿回背包 → 躲石頭。
修完 bug、發布試玩版，再請 Bernie 驗收。

## 🔒 規矩
- 🟢 **2026-10-22 起的開發方式**：正式版（main `9954644`）保持穩定給別人測試；之後的改版都只在 `restyle-storybook` 分支＋本機單機／試玩連結上做。**Bernie 說「佈上去」才上架**（推 main、wrangler deploy）。
- 🔴 **上架規則（Bernie 2026-10-22）**：`main` 一推就上線。**任何改動都不准直接推 `main` 或 `wrangler deploy`**：先發布到試玩連結，Bernie 或兒子實際玩過、說 OK，才上架。開發過程不用每一步都問。
  - 原因：10-22 連推揮棒、Shift+G、二段跳三版後，Bernie 回報黑畫面、不能玩，正式版已退回 `15230de` 的內容（main commit `2f8e53f`）
  - 之後上架做法：在 main 上執行 `git checkout restyle-storybook -- .`，再 commit（main 有一筆退版 commit，不能直接 fast-forward）
- 本機測試只連本機伺服器（`localhost` 會自動連 `localhost:1999`），不要在正式伺服器建帳號
- 回覆要短；小改動一兩句＋連結就好

## 🗣️ 給新 Claude 的開場白
```
我們要繼續開發 Escape Tsunami 繪本版（分支 restyle-storybook）。請依序讀：
1. HANDOFF.md ← 目前進度與下一步
2. docs/PLAN-去像素化.md（看「定案規格」和最下面的決策紀錄）
3. docs/LOCAL-DEV.md
island.html 很長（約 6000 行），不要整份讀，照 HANDOFF 表格裡的關鍵字搜尋。
讀完跟我說「跟上進度了」。
```
