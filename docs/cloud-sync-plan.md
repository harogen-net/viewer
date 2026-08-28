# クラウド同期 計画書（PC↔スマホ ドキュメント移送）

> ステータス: **プランニングのみ（未着手）**。本書は設計合意の記録であり、実装は未開始。
>
> **前提作業あり**: 本機能は文書の同一性（docId）を必要とするが、現状はすべて `title` が
> キーになっている。先に [document-id-plan.md](document-id-plan.md) を実施すること
> （オープン事項 4 はそちらで扱う）。

## 目的
PC（Windows）で編集したドキュメントを、離れた場所にいるスマホ（iPhone）へ効率的に移す手段を提供する。
現状は「PC で HVD/HVZ 書き出し → 手動転送 → スマホでインポート → 保存」と手数が多く、AirDrop も
Windows では使えない。**バックエンドを自前運用せず**、静的 PWA（GitHub Pages）のままクラウド同期を実現する。

## 関連ドキュメント
- docs/sensitive-mode-spec.md（既存の暗号コア PBKDF2 + AES-256-GCM を流用）
- docs/data-compatibility-spec.md（HVD/HVZ フォーマット）
- docs/mode-spec.md（VIEW/EDIT・mobile 環境判定）

## 前提（現状アーキテクチャ）
- 静的 PWA（React/Mantine、GitHub Pages 配信）。サーバーは持たない。
- ドキュメントは各端末の **IndexedDB にローカル保存**（PC とスマホで別領域）。
- 既存機能: HVD/HVZ 書き出し・読み込み、`src/utils/sensitiveCrypto.ts`（PBKDF2 + AES-256-GCM）、
  `src/hooks/useStorage.ts`（IDB CRUD）、`src/hooks/useFileIO.ts`（import/export）。
- iOS 制約: Web Share Target / File System Access 非対応。WebRTC・fetch は可。

## 確定事項（2026-07-21 決定）
- **基盤: Supabase**（Postgres + Auth + Storage + Realtime。無料枠。`supabase-js` でクライアント完結）。
- **認証/識別: 共有パスフレーズ方式（capability ベース）**。メール/OAuth は使わない。
  パスフレーズ 1 本を両端末に入力するだけ。
- **暗号: 全件 E2E**。クラウドには暗号文のみを置く。Supabase も中身を読めない。
- **同期モデル MVP: 手動 push/pull**（明示ボタン）。自動同期・リアルタイムは後段の増分。
- **衝突解決: updatedAt 後勝ち（LWW）＋「リモートが新しい」警告**（同一ユーザ 2 端末前提）。
- **ローカル IDB は維持**（オフライン源兼キャッシュ）。クラウドは同期レイヤ。

## アーキテクチャ

### 鍵導出（パスフレーズ P から）
既存 PBKDF2 を流用し、**独立した 2 値**を導出する（保存パスから暗号鍵が漏れないよう salt/ info を分離）:
- **名前空間 ID** `ns = KDF(P, salt_ns)` … クラウド上の“部屋”（保存パスの接頭辞）。
- **暗号鍵** `K = KDF(P, salt_enc)` … AES-256-GCM で本体を暗号化する鍵。
- `salt_ns` / `salt_enc` はアプリ固定定数（パスフレーズだけで両端末が同じ `ns`/`K` に到達する必要があるため、
  文書ごと salt は使わない。※センシティブモードの per-file salt とは別レイヤ）。

### ストレージ構成（Supabase Storage バケット `sync/`）
- `sync/{ns}/{docId}.enc` … 各ドキュメント本体（HVZ を `K` で暗号化した blob）。
- `sync/{ns}/index.enc` … ドキュメント一覧（`{docId, title, updatedAt, size}[]`）の暗号化マニフェスト。
- E2E のため平文メタを DB に置かない。一覧は暗号マニフェストで持つ（DB テーブルは必須ではない）。
- **バケットの listing は無効化**（`ns` の総当り列挙を防ぐ）。

### 同期フロー（MVP＝手動）
- **Push（クラウドへ保存）**:
  1. 対象ドキュメントを HVZ 化 → `K` で暗号化 → `sync/{ns}/{docId}.enc` に put。
  2. `index.enc` を取得・復号 → 当該エントリを upsert（updatedAt 更新）→ 再暗号化して put。
- **Pull（クラウドから取得）**:
  1. `index.enc` を取得・復号 → ローカル IDB の一覧と `updatedAt` 比較。
  2. リモートが新しい docId のみ `.enc` を取得・復号 → import → ローカル保存。
  3. ローカルが新しい/未アップロードは Push を促す。
- **衝突**: 同一 docId でローカル base より リモート updatedAt が新しい場合は警告し、上書き可否をユーザに確認。

### 門番の設計判断（**未決 / 実装前に確定要**）
capability 方式を Supabase に載せる際、`ns` 配下の読み書きをどう守るか:
- **案 α（最小）**: 匿名 read/write 可バケット。守りは **`ns`（高エントロピー秘密）の秘匿 + E2E** のみ。
  実装最小だが、`ns` を知らなくても乱数パスへ書ける＝**いたずら書き込み / 容量濫用のリスク**が残る。
- **案 β（推奨・堅い）**: **Supabase Edge Function を門番**にし、`P` 由来の HMAC を proof として検証してから、
  その `ns` 用の署名付き URL を発行 or 代理 read/write。開放バケットの濫用を防げる。サーバーコードは 1 関数
  （サーバレスなので運用不要）。
- いずれも **中身の機密は E2E で担保**。**濫用耐性の観点で β を推奨**。→ 実装着手前に α/β を確定する。

## 役割分担
- **要プロビジョニング（利用者/Supabase 側）**:
  - Supabase プロジェクト作成、Storage バケット `sync` 作成、listing 無効化。
  - β 採用時は Edge Function をデプロイ。
  - **Project URL と anon key** を提供（anon key は RLS/門番前提で公開して問題ない値）。
- **実装（クライアント）**:
  - パスフレーズ → `ns`/`K` 導出ユーティリティ（既存 crypto 流用）。
  - HVZ ⇄ 暗号 blob の codec、暗号マニフェスト（index.enc）の読み書き。
  - `useCloudSync` フック（push / pull / 一覧 / 衝突判定）。
  - 同期パネル UI（パスフレーズ入力、Push/Pull、進捗、警告）。
  - β 採用時は Edge Function 雛形。

## フェーズ計画
- **Phase 0（本書）**: 設計合意。α/β の確定と Supabase プロビジョニング待ち。
- **Phase 1（クレデンシャル不要な範囲）**: `ns`/`K` 導出・暗号 codec・`useCloudSync` の I/F とローカル側
  ロジック（IDB 突合・衝突判定）を、Supabase 接続をモック差し替え可能な形で実装＋テスト。
- **Phase 2（結線）**: Project URL/anon key（+β なら Edge Function）を得て Supabase Storage に接続。手動
  push/pull を通す。
- **Phase 3（増分）**: リアルタイム購読による自動 pull、衝突 UX 改善、古い版の掃除（容量対策）。

## リスク・制約
- **パスフレーズ紛失＝復元不可**（E2E の宿命）。UI で強く警告し、控えの保管を促す。
- **無料枠 Storage 1GB**。画像の多い文書を貯め続けると上限に当たる → 版の掃除方針（Phase 3）が要る。
- **案 α のバケット濫用リスク**（上記）。個人用途なら許容余地はあるが β を推奨。
- **CSP**: 張っている場合は接続先 `*.supabase.co` を許可に追加（SW は runtime fetch なので precache 影響なし）。
- **iOS Safari**: fetch/WebCrypto 対応済み。特別対応は不要の見込み。

## オープン事項（実装前に決める）
1. 門番方式 **α / β** の確定（推奨: β）。
2. パスフレーズの保持ポリシー（毎回入力 / セッション保持 / “記憶する”オプション）。センシティブ機能の
   「セッション保持・非永続」に倣うのが自然。
3. 同期対象の粒度（全ドキュメント一括 / 選択したものだけ）。
4. ~~docId の採番~~ → **決着済み**。安定 UUID を新設する。設計と移行手順は
   [document-id-plan.md](document-id-plan.md)。本機能の着手前に完了させる。

## テスト方針（実装フェーズで）
- 鍵導出の決定性（同一 P → 同一 `ns`/`K`、異なる salt で独立）。
- 暗号 codec の往復（HVZ → enc → HVZ 一致）。
- `useCloudSync` の push/pull・LWW 衝突判定（Supabase クライアントはモック）。
- パスフレーズ不一致時に復号失敗（他人の `ns` を引いても読めない）。
