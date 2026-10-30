# HANDOFF — Escape Tsunami 繪本版改版

> 最後更新：2026-10-30 晚（公司 PC）— **先看最下面「👉 10-30 收工」那段**
> 分支：**`restyle-storybook`** — 2026-10-22 已合併進 `main` 上線（繪本版＝正式版）
> 最後 commit：見 `git log -1`（交接時以 GitHub 上這個分支的最新 commit 為準）

---

## 🧭 這是什麼專案
給 12 歲兒子玩的多人跑酷撿錢遊戲（靈感來自 Roblox《Escape Tsunami For Brainrots》）。
- 正式版：**https://cooldragon313.github.io/eddie-world/** （倉庫 cooldragon313/eddie-world，GitHub Pages，`main` 一推就上線 → **改動一律先走分支**）
- 舊網址 escapetsunamiformoney / saturnfamily：只留跳轉頁（搬家後就不再更新內容）
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

## 🆕 2026-10-29 刺牆賽跑第二關（分支上，還沒上架）
- 賽跑改成「關卡＝資料」：`race/race.src.html` 的 `LEVEL1` / `LEVEL2`，同一套跑跳碰撞；第一關數值沒動
- 第二關 天空機關城（430 m）：① 石柱跳跳（67→78、78→89 兩格要二段跳）② 之字窄橋 ③ 烤肉旋轉棒（低棒跳、高棒抓時機、刺刺棒、雙棒反轉）④ 擺錘窄道＋移動平台 ⑤ 計時大門（右邊岔路按開關，門開 4 秒；一般跑 4.7 秒過不去、衝刺 3.4 秒過得去；這段刺牆停在柵欄後）
- 開場改成選關按鈕（各關最佳時間）；結算畫面有「選別關」
- 測過：第一關機器人跑法和以前一樣；第二關每個機關單獨測（石柱可達性、棒子高度判定、擺錘打飛、平台帶著走、大門跑／衝刺計時）。**整關真人難度沒測**

## ⚠️ 已知問題／待確認
1. **手機上商店能不能關**：已加 ✕、底部「關閉」、點外面關閉三種方式，還沒在真手機確認
2. Bernie 說過「手機版壞了」，細節不明 → 下次先問清楚或實機走一輪
3. 多人連線時，**別人看不到你的衝浪板和姿勢**（只看得到位置）
4. 預覽版 rAF 在背景分頁會暫停，Claude 的瀏覽器測試只能「手動呼叫 update()」，手感需要人玩
5. 難度（賺錢速度、浪頻率）**刻意先不調**，最後統一處理

## 👉 下次第一件事
**看檔案最下面「👉 10-30 收工」那段**：照它的「下一步」做。

## 🔒 規矩
- 🟢 **2026-10-22 起的開發方式**：正式版（main `9954644`）保持穩定給別人測試；之後的改版都只在 `restyle-storybook` 分支＋本機單機／試玩連結上做。**Bernie 說「佈上去」才上架**（推 main、wrangler deploy）。
- 🔴 **上架規則（Bernie 2026-10-22）**：`main` 一推就上線。**任何改動都不准直接推 `main` 或 `wrangler deploy`**：先發布到試玩連結，Bernie 或兒子實際玩過、說 OK，才上架。開發過程不用每一步都問。
  - 原因：10-22 連推揮棒、Shift+G、二段跳三版後，Bernie 回報黑畫面、不能玩，正式版已退回 `15230de` 的內容（main commit `2f8e53f`）
  - 之後上架做法：在 main 上執行 `git checkout restyle-storybook -- .`，再 commit（main 有一筆退版 commit，不能直接 fast-forward）
- 本機測試只連本機伺服器（`localhost` 會自動連 `localhost:1999`），不要在正式伺服器建帳號
- 回覆要短；小改動一兩句＋連結就好

## 🗣️ 給新 Claude 的開場白
```
我們要繼續開發「艾迪的幻想世界」（repo eddie-world，資料夾
C:\Users\plee3\Downloads\AI FOLDER\escapetsunamiformoney，分支 restyle-storybook）。
一律用繁體中文回覆。請依序讀：
1. HANDOFF.md ← 先看最下面最新那段（2026-10-30）
2. docs/PLAN-101跑酷.md、docs/PLAN-101-難度表.md
3. docs/LOCAL-DEV.md
大檔案（island.html、tower/tower.src.html）不要整份讀，用搜尋。
讀完跟我說「跟上進度了」，然後照最下面那段的「下一步」做。
```

## 2026-10-29 — 逃離土星 有自己的網址

- 正式網址：https://cooldragon313.github.io/saturnfamily/ （倉庫 cooldragon313/saturnfamily，只放產出的 `index.html` + README）
- 原始碼仍在本倉庫 `race/race.src.html`（跟海嘯島共用角色/畫風程式），`python tools/build_race.py` 產出 `index.html`，
  上架時：本倉庫照舊推 main（舊網址的賽跑也同步），再把 `index.html` 複製到 `D:\downloads\AI GAME\saturnfamily` commit + push。
- 海嘯島的「逃離土星」按鈕在 github.io 上連到新網址；新網址的「回海嘯島」連回舊網址。帳號/金幣/排行榜同一台伺服器、同網域，登入共用。
- 第一關改名「家庭聚會」：酒鬼大叔（取代刺牆）、鬼媽媽 ×4、地上小屁孩 ×6、小屁孩大魔王、12 個成就（存在玩家瀏覽器 localStorage）。
- 家庭小遊戲藍圖：`docs/PLAN-家庭小遊戲.md`（未動工）。

## 2026-10-29 — 家庭小遊戲第二款「熱熔膠條之夜」MVP（還沒 commit、還沒上架）

- 原始碼 `family/gluenight.src.html` → `python tools/build_family.py` 產出 `gluenight.html`（繪本畫風一樣從 island.html 抄 LOOK 區塊）
- 試玩連結（單機、不連伺服器）：https://claude.ai/artifact/2V9EGsXkb4Ch6D6tMZ5oFk ；更新：`python tools/build_family.py --preview <檔>` 再發布到同一個 artifact
- 玩法：第一人稱書桌，桌上鏡子看得到背後的門；4 種偷玩（畫畫/漫畫/YouTube/打電動，越爽越難藏）、裝乖、翻頁；嬤嬤 away→腳步預兆→（假動作走掉）或開門看；被抓＝熱熔膠條「咻—啪」＋怒氣；連抓兩次嬤嬤守門；撐到 10 點過關
- 難度用機器人模擬調過：只看漫畫穩過、YouTube 要反應快、一直打電動必爆
- 還沒做：金幣入帳海嘯島帳號／排行榜、首頁「家庭小遊戲」入口、真人手感測試
- ⚠️ 本機測試另開 `.claude/launch.json` 的 `etfm-family`（port 8767），跟 etfm-web 8765 分開
## 2026-10-29 — 土星之家 H1（公司 PC，分支上、還沒上架）
- 方向（Bernie）：**一個遊戲、很多關卡**。大廳＝自己的 3D 家 → 出門選關卡：逃離土星／恐怖考前複習夜（原熱熔膠條之夜）／**土星拆家王**（原拆家寶寶，還沒做）。海嘯撿錢不再當入口。藍圖 `docs/PLAN-土星之家.md`
- 原始碼 `home/home.src.html` → `python tools/build_home.py [--preview 檔]` → `home.html`
- 試玩連結：https://claude.ai/artifact/7CVMoMJmmk3GrbZScdNTsQ
- 做了：8×8 房間、11 件家具（買／擺／轉／收）、4 地板 4 壁紙、門→選關卡、點地板走路；存在瀏覽器（`etfm-home-v1`），試玩錢 777
- 下一步 H2：伺服器存 `home`、扣真的金幣；H3：關卡結束「回家」；H4：首頁改成土星之家

## 2026-10-29 — 遊戲名稱：艾迪的幻想世界＋主角原型
- 整個遊戲叫 **艾迪的幻想世界**；大廳＝土星之家；關卡：逃離土星／恐怖考前複習夜／土星拆家王
- 主角艾迪原型（照 Bernie 兒子的照片做 Q 版）：`prototypes/eddie.src.html` → `python tools/build_proto.py eddie [--preview 檔]`
  - 試玩：https://claude.ai/artifact/11zvrShMMHSVBgN43xA17Z
  - 特徵：黑色短髮頭頂往上抓、兩側短、開口大笑、粗眉、白 T、軍綠短褲、白鞋黑襪、白手環、星空背包、橘色猩猩圍巾（可開關）
- 還沒做：把艾迪放進土星之家和各關當預設角色

## 2026-10-29 — 艾迪進關卡（公司 PC，分支上、還沒上架）
- 每個關卡的玩家都是艾迪（`buildAvatar` 遇到 `custom.hero !== 'custom'` 就改用 `buildEddieAvatar`）
- 艾迪骨架 v2：頭、手肘、膝蓋、表情（笑／大笑／嚇到／哭哭／得意＋眨眼）；共用動作 `animateEddie(A, o)`（都在 island.html 的 AVATAR 區）
  - ⚠️ 面向 -z：膝蓋往後折＝rotation.x 負、手肘往前彎＝正（曾經寫反過）
- 試玩：逃離土星艾迪版 https://claude.ai/artifact/2r6p37955RvFwrHZZc9fP5 ／土星之家 https://claude.ai/artifact/7CVMoMJmmk3GrbZScdNTsQ ／艾迪原型 https://claude.ai/artifact/11zvrShMMHSVBgN43xA17Z
- 舊的「逃離土星」試玩 `…1GfYgGkd…` 是艾迪之前的版本

## 2026-10-29 — 逃離土星第一關後段重做（✅ 已上架 main 1f0fb7a ＋ saturnfamily dbac885）
- 共用小屁孩 `buildKid()`（island.html AVATAR 區，照 Bernie 照片：黑短髮瀏海、白T淺藍短褲、赤腳）；原型 https://claude.ai/artifact/4KMMx6mQamrWN8R3XiNfsu
- ⑤ 頂樓遊戲室（430–478）：小屁孩丟小車／遙控器輪流，**手上先拿著下一發**＋舉手壞笑預告；兩種都能揮棒打回去讓他哭（成就「全壘打王」）。中間的掩體拿掉了
- ⑥ 頂樓曬衣場（478–530）：大風（先跳箭頭警告再推人）、飛襪子🧦／內褲🩲（大圖示卡）、床單、盆栽
- 全屋 36 灘水窪（`LEVEL1.puddles`）：踩到照原方向溜冰 0.8 秒不能轉向、不扣血；成就「🛼 溜冰高手」連滑 3 灘不受傷
- 警告字改粉圓體（Huninn）＋貼紙底（`.flash` 奶油膠囊、`#impact` 彩色貼紙）
- 髒髒度：Bernie 說只當成就、不影響玩法 → **還沒做**
- 下一步：第二關（LEVEL2 天空機關城）要重新規劃主題

## 2026-10-29 — 恐怖考前複習夜 媽媽版（✅ 已上架 main e53487f；逃離土星音效 saturnfamily 0f218b4）
- 嬤嬤 → 媽媽（共用 `buildMom`，island.html AVATAR 區；原型 https://claude.ai/artifact/6uHQME8BxUenFG77wqMm3i ）
- 三種武器每次開門隨機：膠條／愛的小手（輕）／衣架（重）；抽打特效、台詞、震動分武器；整個畫面震
- 艾迪三張真實塗鴉（照片→`scratchpad/doodles.py` 去背成鉛筆線，內嵌 PNG）：畫畫沿著線慢慢長出來，畫完一張 +25、三張 +40；畫到一半收起來會畫歪，下次先擦 0.6 秒
- 媽媽問「那頁看多久了」之後不翻頁就不走，怒氣慢慢漲；翻頁才走
- 十點勝利：鐘聲＋彩帶＋10:00 大章；9 個成就（localStorage `gluenight.ach`）
- 難度用機器人模擬調過（反應 0.6 秒：YouTube 約 170、打電動高風險）
- 試玩：https://claude.ai/artifact/22KEpAkE6hMkbmHdEin8Bs

## 2026-10-29 — 土星之家當首頁（✅ 已上架 main 9d351fc、saturnfamily 7543e3b）
- ⚠️ **檔名換了**：`index.html` ＝ 土星之家（`tools/build_home.py` 產出）；逃離土星改成 `race.html`（`tools/build_race.py` 產出）；`home.html` 只是跳轉到 index.html 的小頁
- 上架 saturnfamily 時：把 **race.html** 複製成 saturnfamily 的 `index.html`（不是複製 index.html！）
- 每關都有「🏠 回土星之家」：github.io 上連 `https://cooldragon313.github.io/escapetsunamiformoney/`，本機連 index.html，claude.ai 預覽隱藏
- 海嘯島的「逃離土星」按鈕：本機 race.html、github.io 上照舊連 saturnfamily

## 2026-10-29 — 搬家到 eddie-world（✅ 已上架 eddie-world main 7caac5a；舊站跳轉 escapetsunamiformoney fcd7c5c、saturnfamily ac1b5d5；伺服器已 deploy）
- 新倉庫 `cooldragon313/eddie-world`（含全部歷史；Bernie 推的）。本機 `origin` 改指新倉庫，舊的留成 `old-tsunami`
- 程式裡寫死的網址都改 eddie-world；海嘯島的逃離土星按鈕改用相對路徑 race.html（不再連 saturnfamily）
- **saturnfamily 不再需要每次複製**；之後舊網址只放跳轉頁
- 排行榜（/glue_score、全成就👑）在分支上，要先 `cd cloudflare && npx wrangler deploy` 才能上架

## 2026-10-29 — 土星之家擴建 E1+E2（✅ 已上架 eddie-world main 23537d3；伺服器已 deploy）
- 家＋錢接上帳號：`GET /home`（第一次送 777 一次）、`POST /home_buy`（furn/floor/wall/expand，價格在 server.js `HOME_FURN/HOME_FLOORS/HOME_WALLS/HOME_LEVELS`）、`POST /home_save`（只收擺設，伺服器檢查有沒有買、有沒有超出房間）
- ⚠️ 改家具／地板／壁紙價格或新增家具：**home.src.html 和 server.js 兩邊都要改**，再 wrangler deploy
- 擴建 Lv2 大客廳 10×10（$600），Lv3–5 顯示「施工規劃中」；施工動畫＝圍籬＋鎚子＋敲打聲＋彩帶
- 試玩版（claude.ai 預覽）仍是本機 777 測試屋；正式網址沒登入不能買
- 下一個：101 跑酷（docs/PLAN-101跑酷.md，艾迪提案）

## 2026-10-29 — 101 跑酷 1–20F＋玩具架（✅ 已上架 eddie-world main 9d4b8b0；伺服器已 deploy）
- 101：`tower/tower.src.html` → `python tools/build_family.py --only tower`；設計與版本紀錄看 docs/PLAN-101跑酷.md（v2.2）
- 金幣：伺服器 `towerCoins`（1–10F 每層 1 … 91–100F 每層 10＋登頂 460＝1010）
- 玩具架：家具店 $300（server `HOME_FURN.toyshelf`）；6 格佔位玩具；找到的紀錄先在手機 `etfm-toys`
- 下一步：21F 以上、各關藏玩具（逃離土星）、塗鴉牆（艾迪的畫）、獎盃架、101 排行榜接伺服器
- ⚠️ wrangler deploy 之後，Cloudflare 大約要 5 分鐘才換成新版，先確認新路由有回應再上網頁

## 2026-10-30 — 101 跑酷 21–40F（分支 `restyle-storybook` 74e0d43＋之後的 docs，**還沒上架**）
- 試玩連結（101）：https://claude.ai/artifact/EkQswp7qfPUCGuFULc2zk9 — 更新：`python tools/build_family.py --only tower --preview <scratchpad>/tower-preview.html` 後發布到同一個 artifact
- 做完：
  - 第 3 段（21–30F）「冷氣機森林」加難：滴水冷氣更窄更滑、風吹在濕冷氣上 ×2；側路藏 🌀 爆破貝利亞（玩具）
  - 第 4 段（31–40F）「竹節初登場」：橫移牆 → 竹節外凸牆 → 38F 第二個媽媽窗戶；35F 安全網；成就 🎋 竹節征服者（不手滑）
  - 💪 握力上限道具（金色啞鈴，+25、永久，存 `etfm-tower2-grip-<帳號>`）：g1 在第 3 段側路、g2 在第 4 段側路
  - 修 bug：繞塔兩圈後牆抓不到、粉筆／道具撿不到（`onSpan` 改成可繞圈、`sDist`）；橫移牆接外凸牆卡住、握力變負不會滑
  - 機器人測：0→40F 約 50 秒；第 4 段最低握力 36、不手滑
- ❗ **Bernie 回饋（10-30）：「第四關完全沒感覺，竹節啥都沒特別」→ 第 4 段要重做**
  - 問題：竹節只是一面普通牆換顏色，外觀和玩法都跟前面一樣
  - 方向（待跟 Bernie 討論）：101 真實外觀是 8 節「倒梯形竹節」往外斜 → 要做出**看得到的外凸斜面**（塔身每 8 層一節往外擴、節與節之間有凹進去的接縫）；玩法上要有**往外斜爬／快倒掛**的感覺（例如外凸段握力消耗加倍、爬到節頂要「翻上去」的動作和音效、鏡頭拉遠讓人看到懸空）
- 第 5 段「夜幕降臨」設計稿已寫在 docs/PLAN-101-難度表.md 最下面，**等 Bernie 確認**：霓虹招牌滅掉要「掉下去」還是「變滑」、側路放什麼
- 待 Bernie 決定（隱藏道具規則：放什麼一定先問）：第 4、5 段側路放哪個玩具（剩 iPad、乒乓球拍、寶可夢卡冊、存錢小豬公、JJ CD）；💪 g1／g2 位置 OK 嗎
- 下一步：① 第 4 段重做（先討論方向）② 第 5 段 ③ 6–10 段 ④ 101 排行榜接伺服器、玩具／成就存帳號 ⑤ 家裡獎盃架、塗鴉牆 ⑥ 拆家王 MVP（docs/PLAN-土星拆家王.md v2）
- 這次只有網頁改動，伺服器沒動 → 上架只要推 main（照「上架做法」），不用 wrangler deploy

## 2026-10-30 — 第 4 段竹節重做＋難度調整（分支 `restyle-storybook`，**還沒上架**）
- 試玩連結同上（101）：https://claude.ai/artifact/EkQswp7qfPUCGuFULc2zk9（Version 9）
- 為什麼重做：第 2 段早就有一面同樣耗握力的外凸牆（還比第 4 段高）；難度表的「握力消耗逐段變快」沒做進程式
- 第 4 段新竹節（`tower/tower.src.html` 搜 `NODE`）：
  - 兩面**往外斜**的牆（下半 out 0.3 → 上半 3.2，約 9m 高），外面包一大片斜玻璃裙板＋接縫帶＋節頂（`slab()` 畫斜面）
  - 握力消耗跟著斜度：`22 + 14 × 高度比例`（底部 22、頂端 36）
  - 中間**接縫**（type `seam`）：站上去休息，握力最多回到 6 成；從上半手滑會**穿過接縫**掉到節底的網子（`mountOnly` + `P.slipped`）
  - 爬到頂「翻上竹節」：嘿咻動作＋音效（`P.mantleAt`、`sfx.mantle`）
  - 掛在竹節上**颱風不會來**（爬完才來）；鏡頭拉遠、往旁邊轉、壓低，看得到斜面和底下的街
  - 35F 網子改成竹節底下的網子（約 33.5F）；最後那面小外凸牆拿掉，媽媽窗戶移到約 39F
- 其他段：第 2 段外凸牆改「小凸牆」（高 2.5、每秒 22，多一個冷氣機補高度）；一般牆握力 1–30F 每秒 13、31F 起 15
- 機器人測（只測竹節，不含颱風）：沒啞鈴不休息 → 頂端剩 16；爬到一半常停頓 → 剛好 0（會手滑）；吃 1 個啞鈴剩 41、2 個剩 66。30→40F 整段走得通、手滑三種位置都掉到網子
- 10-30 Bernie 回饋修正：站接縫時艾迪被斜玻璃蓋住（接縫改成伸出玻璃外的**黃色平台**＋旁邊「😮‍💨 休息點」牌子，爬到下半段頂端前提示「上面黃色接縫可以休息」）；竹節岩點改成大顆石頭。Bernie 說「第二段竹節忘了做攀岩的石頭」——程式裡上半段有石頭，待確認他指的是哪裡
- 10-30 再修：竹節頂整片綠色都能站；冰箱後的旗桿藏在轉角後 → 改成繞轉角的陽台；所有攀爬牆改沙色板＋大顆石頭；39F 媽媽移到 40F 平台上方。
- 🐛 **大樓外擴把牆埋掉**：塔身 24F 起每節往外擴 5%（`flare`），到節頂玻璃凸出約 0.4m，攀爬牆只離玻璃 0.08m → 31–40F（和部分 21–30F）的牆被埋進玻璃看不到。已拿掉 flare（塔身改直的）。**規矩：牆上的東西都是用固定距離貼在塔身外，塔身不能再做外擴**；要斜就用 `slab()` 做成可爬的竹節
- 沒測到：真人手感、手機上鏡頭轉側面會不會暈
- 下一步：① Bernie／艾迪試玩第 4 段，回饋再調數字（`22 + 14`、接縫 6 成、竹節高度）② 第 5 段夜幕降臨（設計稿等確認）③ 側路玩具放什麼（要問）

## 2026-10-30 — 101 v2.5：空拍機＋隱藏照片（分支，**還沒上架**）
- 試玩：101 連結同上（開始畫面有「🧪 試玩：直接給空拍機」，只在非正式網址出現）；特效範本 `prototypes/polaroid.src.html`
- 程式（`tower/tower.src.html` 搜 `THE DRONE + HIDDEN PHOTOS`）：
  - 空拍機在第 4 段竹節頂往左的岔路（`item: 'drone'`），存 `etfm-tower2-drone-<帳號>`
  - 照片點用 `photo(id, 字幕, 提示, 落腳點, {…})` 掛在路線上（`PHOTOS`），12 個＋2 張事件照片（💩 鴿屎運、🕸️ 網子）
  - 拍照時世界暫停（`S.snap`；⚠️ `S.shot` 是原本鏡頭切換用的，別混用）；照片存 `etfm-tower2-photos-<帳號>`（264px JPEG）
  - 媽媽照片在 40F 平台、媽媽窗戶旁（只有媽媽開心那天）；兩人比 V＋中間大 💖（Q 版頭太大，手舉高會被頭擋住）
  - 結算畫面「📖 相簿」：一段一頁，沒拍到的是 ? ＋提示
- 測過：12 個照片點都能觸發、存檔；空拍機岔路跳得到；20–40F 機器人走得通
- 還沒做：土星之家的相簿（目前只在 101 裡看）；照片存帳號

## 👉 10-30 收工（✅ 已上架：101 21–40F＋竹節重做＋v2.5 空拍機照片；伺服器沒動、不用 wrangler deploy）
- 正式網址 https://cooldragon313.github.io/eddie-world/ （101 = tower.html）；試玩連結 https://claude.ai/artifact/EkQswp7qfPUCGuFULc2zk9 （v16）
- 照片總覽：`docs/photos-review/v2-全部照片.jpg`（Bernie 還沒回饋 v2；v1 是改之前的）
- 這一天做完：第 4 段竹節重做（斜牆、接縫休息點、翻上去）、一連串 bug（接縫被玻璃蓋住、竹節頂踩空、冰箱後轉角、牆被塔身外擴埋掉）、所有牆改沙色板＋大石頭、39F 媽媽移到 40F 平台上；v2.5 空拍機＋14 張照片＋相簿
- 每張照片的姿勢／道具／空拍機角度在 `photo(...)` 的 `pose`、`cam`（tower.src.html 搜 `photo('`）；姿勢在 `photoPose()`
- 本機看照片的方法：開本機 tower.html，用 `window.__tw` 傳送到每個照片點、`__tw.frame(t, true)` 手動跑幀（背景分頁 rAF 會停）
- **下一步（照順序）**：
  1. 問 Bernie／艾迪 v2 照片 OK 嗎、第 4 段玩起來怎樣
  2. 土星之家的相簿（拿到空拍機後家裡出現一本，讀 `etfm-tower2-photos-<帳號>`）
  3. 第 5 段夜幕降臨（設計稿在 docs/PLAN-101-難度表.md，照「每段必備清單」做，含 3 個照片點）
  4. 之前列的第 4 段改版點子（繞一圈、辦公室捷徑、如意、古錢幣、珍奶、跑步機）— docs/PLAN-101跑酷.md v2.5
- 待 Bernie 決定：第 4、5 段岔路放哪個玩具（iPad／乒乓球拍／寶可夢卡冊／存錢小豬公／JJ CD）；媽媽照片維持隨機（媽媽生氣那天拍不到）還是有空拍機時一定開心

## 2026-10-30 下午 — 101 第 5 段夜幕降臨＋冷氣機＋手殘版（家裡 PC，分支 `restyle-storybook`，**還沒上架**）
- 大廳已改名「艾迪的幻想世界」（✅ 已上架 main c80ad74）
- 冷氣機重畫：白色室外機＋圓形風扇格柵（會轉）＋側邊散熱片＋支架＋銅管（`acUnit()`）
- 第 5 段 41–50F（`BUILT = 50`）：細節看 docs/PLAN-101-難度表.md「第 5 段實作」；第一間窗戶房間＝加班辦公室（`buildOffice()`）
- 🐣 手殘版：開始畫面勾選（存 `etfm-tower2-easy`）：握力消耗 ×0.65、颱風間隔 +5 秒、霓虹黑 0.5 秒
- 修 bug：鴿子被踩到不會飛走（一行註解把程式吃掉了）
- 試玩連結（家裡 PC 發的新連結，101）：見下一行
- 下一步：Bernie 實玩第 5 段 → 回饋調數字；下階段＝家裡相簿＋照片存伺服器（R2）；之後的窗戶房間：風阻尼器（87–92F）最推
- 101 試玩連結（第 5 段版）：https://claude.ai/artifact/LCkqyB3M38ig1bkX7JWaWz — 更新：`python tools/build_family.py --only tower --preview <scratchpad>/tower-preview.html` 後發布到同一個 artifact（家裡 PC 的 session）
