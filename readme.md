# Viewer

Viewer は、画像やテキストをレイヤーとして配置し、スライド形式のドキュメントを作成・閲覧・再生できる Web アプリです。
ブラウザ上でスライドを編集し、保存したドキュメントを再び読み込み、スライドショーとして表示できます。単なる画像ビューアではなく、複数スライド、レイヤー編集、画像差し替え、クリップ、整列、履歴管理を備えた軽量なスライド編集ツールです。

## 主な機能
- スライドの作成、複製、削除、並び替え
- 画像レイヤーとテキストレイヤーの配置
- レイヤーの移動、拡大縮小、回転、反転
- レイヤーの上下順序変更、整列、フィット配置
- 画像の差し替え、クリップ編集、透明度調整
- テキストレイヤーの追加と編集
- Undo / Redo による編集履歴管理
- スライドショー再生
- `.hvd`、`.hvz`、埋め込みデータ付き PNG の読み書き
- PC ブラウザ向け編集モードとスマホ PWA 向け閲覧モード

## 使い方のイメージ
1. 画像を追加してスライド上に配置する
2. 必要に応じてサイズ、位置、回転、透明度、クリップを調整する
3. テキストレイヤーを重ねる
4. 複数スライドを作成して構成する
5. ドキュメントとして保存、またはスライドショーとして再生する

## 対応ファイル
Viewer は既存ドキュメントとの互換性を重視しています。

- `.hvd`: JSON ベースのドキュメント形式
- `.hvz`: ドキュメントと関連データをまとめた zip 形式
- `.png`: ドキュメントデータを埋め込んだ PNG 形式

互換仕様の詳細は [docs/data-compatibility-spec.md](docs/data-compatibility-spec.md) を参照してください。

## 実行モード
### Browser Mode

PC ブラウザ向けの通常モードです。閲覧、編集、保存、読み込み、スライドショーを利用できます。

### Mobile PWA Mode
スマホ PWA 向けの閲覧中心モードです。スライド一覧とスライドショーを中心に使い、編集や破壊的操作は制限されます。

モード仕様の詳細は [docs/mode-spec.md](docs/mode-spec.md) を参照してください。

## 開発
依存関係をインストールします。

```sh
npm install
```

開発サーバーを起動します。

```sh
npm run dev
```

本番ビルドを作成します。

```sh
npm run build
```

ビルド結果をプレビューします。

```sh
npm run serve
```

ユースケーステストを実行します。

```sh
npm run test:usecase
```

互換性チェックを実行します。

```sh
npm run check:phase2
```

## ディレクトリ構成

```text
src/
  bridge/          React UI と Viewer 本体をつなぐコマンド/イベント層
  model/           Document、Slide、Layer のモデル
  react/           React UI コンポーネント
  runtime/         実行モード、機能ゲート、PWA 向け処理
  storage/         保存/読込アダプタ
  useCase/         アプリケーションユースケース
  utils/           共通ユーティリティ
  view/            既存ビュー層
  viewController/  既存コントローラ層

css/               スタイル
docs/              仕様・設計・テスト計画
fixtures/          互換性確認用データ
scripts/           検証スクリプト
tests/             テスト
```

## 関連ドキュメント

- [docs/function-list.md](docs/function-list.md)
- [docs/mode-spec.md](docs/mode-spec.md)
- [docs/data-compatibility-spec.md](docs/data-compatibility-spec.md)
- [docs/test-plan.md](docs/test-plan.md)

## English Summary

Viewer is a web-based slide document viewer and editor. It lets users compose slides from image and text layers, edit layer transforms and visual properties, save/load documents, and play them as slideshows. It supports `.hvd`, `.hvz`, and PNG files with embedded document data.
