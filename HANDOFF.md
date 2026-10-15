# HANDOFF — Escape Tsunami 繪本版改版

> 最後更新：2026-10-15（公司 PC）
> 分支：**`restyle-storybook`**（還沒合併 `main`，正式版沒動）
> 最後 commit：見 `git log -1`（交接時以 GitHub 上這個分支的最新 commit 為準）

---

## 🧭 這是什麼專案
給 12 歲兒子玩的多人跑酷撿錢遊戲（靈感來自 Roblox《Escape Tsunami For Brainrots》）。
- 正式版：https://cooldragon313.github.io/escapetsunamiformoney/ （GitHub Pages，`main` 一推就上線 → **改動一律先走分支**）
- 伺服器：PartyKit（`party/server.js`），正式網址 `etfm.cooldragon313.partykit.dev`
- 開發模式：Bernie 當製作人，Claude 負責企劃、程式、測試；Bernie 和兒子用手機玩、給意見

## 📱 手機試玩連結（最新）
**https://claude.ai/artifact/KQxdw7JqrC6D7sKLJcfgXV**
- 單人模式、不連伺服器、不用登入；進度存在手機瀏覽器；每次開場至少 $777
- 更新方式：把 `index.html` 去掉 `<html>/<head>/<body>` 外殼後發布到同一個 artifact（上一個 session 用 scratchpad 的 `storybook-preview.html`）
- ⚠️ `…JzZMRGcv…` 是舊的「風格比較頁」，不要跟試玩版搞混

## 📚 先讀這些
1. `HANDOFF.md`（本檔）
2. `docs/PLAN-去像素化.md` — 定案規格、點子池、**決策紀錄**（最下面那張表就是時間軸）
3. `docs/LOCAL-DEV.md` — 本機跑伺服器＋測試帳號
4. `README.md` — 原本的遊戲說明（部分內容已過時，例如「坑」已改成石頭）
5. `index.html`（約 6000 行，**不要整份讀**，用搜尋找下面列的區塊）

## ✅ 這個分支做完的事
| 項目 | 重點 | 在 index.html 搜尋 |
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
- **不要推 `main`**，合併前一定先問 Bernie
- 本機測試只連本機伺服器（`localhost` 會自動連 `localhost:1999`），不要在正式伺服器建帳號
- 回覆要短；小改動一兩句＋連結就好

## 🗣️ 給新 Claude 的開場白
```
我們要繼續開發 Escape Tsunami 繪本版（分支 restyle-storybook）。請依序讀：
1. HANDOFF.md ← 目前進度與下一步
2. docs/PLAN-去像素化.md（看「定案規格」和最下面的決策紀錄）
3. docs/LOCAL-DEV.md
index.html 很長（約 6000 行），不要整份讀，照 HANDOFF 表格裡的關鍵字搜尋。
讀完跟我說「跟上進度了」。
```
