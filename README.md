# [myerwang/PhotoClub](https://github.com/myerwang/PhotoClub)

# PhotoClub 同框照相馆 📸

![PhotoClub UI](assets/ui.png)

把普通照片变成一整套 AI 写真工作流：先做人设，再选风格，再批量出图。适合做头像、贴纸、写真、合照、打印照片，也适合持续收集和扩展自己的摄影风格库。

## 中文

### 这是什么 ✨

PhotoClub 是一个本地 AI 照相馆。你可以把家人、朋友、虚拟角色或公众人物做成稳定的人物设定，再用不同风格生成照片。

重点不是一次性玩 prompt，而是做成可反复使用的照相馆流程：

1. 先建立人物设定，让同一个人的脸尽量稳定。
2. 再选择风格、打印尺寸、横竖方向和数量。
3. 点击生成，结果自动保存，还能中断后继续。

### 现在能做什么 💡

- 👤 人物设定：一个人物一个文件夹，可以放多张参考照片，生成一张标准多视图人物参考图。
- 📝 文字建人设：不放照片也可以，输入人物描述即可创建真实人物或虚构人物设定。
- 👨‍👩‍👧 多人同框：人物可以多选，一次生成多人物合照。
- 🎨 275+ 风格：内置大量写真、街拍、胶片、棚拍、复古、赛博、旅行、贴纸等风格。
- ➕ 自定义风格：在界面里输入你喜欢的风格提示词，系统会整理成可复用 style。
- ✅ 多选风格批量跑：选几个风格就按顺序跑几个风格，每个风格可以生成多张。
- 🖼️ 输出记录：生成历史会保留，取消、额度不足或中断后可以继续未完成部分。
- 🧾 打印尺寸：支持 7-Eleven L、2L、DSC、KG、A4、4x6、5x7、8x10 和自定义尺寸。
- 🧷 贴纸模式：支持贴纸岛、出血安全边距和适合 7-Eleven 1L 的输出。
- 🌏 三语界面：中文 / 日本語 / English 实时切换。
- 🔒 本地隐私：你的输入照片、人物设定、输出照片、风格缩略图默认不上传到 Git。

### 推荐使用流程 🚀

1. 把人物照片放进 `input/人物名/`，同一个人可以放多张。
2. 打开控制台，点“人物设定”，选择对应输入目录。
3. 人物列表出现多视图参考图后，选择一个或多个人物。
4. 选择一个或多个风格，也可以点“仅看未生成”刷还没试过的风格。
5. 选择打印格式、横向/纵向、生成数量。
6. 填写本次额外要求，例如“夏天感”“更像杂志封面”“情侣合照”。
7. 点击生成，完成后在结果区预览大图或打开输出文件夹。

### 添加自己的风格 🎨

在控制台里添加最简单：

1. 打开 PhotoClub 控制台。
2. 在风格列点击“添加风格”。
3. 输入你想要的照片效果，比如“夜晚便利店门口的日系胶片感”“夏日海边杂志封面风”“CCD 闪光灯自拍”。
4. 点击“创建风格”，系统会把你的描述整理成可复用 style。
5. 新风格会出现在风格列表里，直接选择人物和这个风格进行生成。
6. 第一次成功生成后，这个风格会自动使用最后一张结果作为本地缩略图。

### 提交新风格给仓库 📮

想把好用的风格分享给大家，按这个手顺：

1. 先用控制台“添加风格”创建并试跑，确认效果稳定、不是一次性需求。
2. 找到新生成的 `styles/<styleId>.md` 文件。
3. 只提交这个 `styles/<styleId>.md` 文件。
4. 不要提交 `output/`、`profiles/`、`input/`、`styles/previews/` 里的图片。
5. 不要提交本地生成历史、缩略图或私人照片。
6. 发起 PR，简单说明这个风格适合什么场景，例如“适合夜景街拍”“适合情侣胶片合照”“适合贴纸输出”。

风格文件应该只描述摄影风格、构图、光线、色彩、服装氛围和后期质感，不要固定具体人物、五官、年龄、性别或一次性要求。

### 适合谁 🌟

- 想批量尝试不同写真风格的人。
- 想给家人、朋友、情侣或虚拟角色做同框照片的人。
- 想做贴纸、头像、社交平台配图、小红书风格封面的人。
- 想用 7-Eleven 或常见相纸尺寸打印照片的人。
- 想自己维护风格库，而不是每次重新写 prompt 的人。

### 启动方式 🛠️

唯一前提：安装并登录 Codex 桌面版。

不需要自己准备 Node.js、npm、pnpm、Python、图片工具、系统包管理器，也不需要 API Key。

在 Codex 桌面版里打开这个项目，然后输入：

```text
启动 PhotoClub
```

系统会自动检查环境、安装本地依赖、启动服务，并用系统默认浏览器打开控制台。

## 日本語

### これは何？ ✨

PhotoClub はローカルで使える AI 写真館です。人物の多視点リファレンスを先に作り、その人物をいろいろな写真スタイルで生成できます。

単発のプロンプト遊びではなく、何度も使える写真制作フローとして使うことを目指しています。

1. まず人物設定を作り、顔の一貫性を保ちやすくします。
2. スタイル、プリントサイズ、縦横、枚数を選びます。
3. 生成して保存し、途中で止めても未完了分から再開できます。

### できること 💡

- 👤 人物設定：1 人 1 フォルダ。複数の参考写真から 1 枚の標準多視点リファレンスを作成。
- 📝 テキスト人物設定：写真がなくても、説明文から実在人物または架空人物を作成。
- 👨‍👩‍👧 複数人物の同時生成：人物を複数選び、同じ写真内に配置。
- 🎨 275+ スタイル：ポートレート、街撮り、フィルム、スタジオ、レトロ、サイバー、旅行、ステッカーなど。
- ➕ スタイル追加：好きなスタイル説明を入力すると、再利用できる style として保存。
- ✅ 一括生成：複数スタイルを選ぶと順番に実行。各スタイルごとに枚数指定できます。
- 🖼️ 生成履歴：キャンセル、上限到達、中断後も未完了分だけ続行。
- 🧾 プリントサイズ：7-Eleven L、2L、DSC、KG、A4、4x6、5x7、8x10、カスタムサイズに対応。
- 🧷 ステッカー：ステッカー島、塗り足し安全余白、7-Eleven 1L 向け出力に対応。
- 🌏 多言語 UI：中国語 / 日本語 / English をリアルタイム切替。
- 🔒 ローカルプライバシー：入力写真、人物設定、出力画像、スタイルプレビューは Git に保存されません。

### 使い方 🚀

1. 人物写真を `input/名前/` に入れます。同じ人物なら複数枚入れられます。
2. コンソールで「人物設定」を押し、入力フォルダを選びます。
3. 人物リストに多視点リファレンスが出たら、人物を選択します。
4. スタイルを 1 つ以上選びます。「未生成のみ」でまだ試していないスタイルだけを見ることもできます。
5. プリント形式、縦横、生成枚数を選びます。
6. 今回だけの追加要望を入力します。例：夏らしく、雑誌表紙風、カップル写真など。
7. 生成後、結果をクリックして拡大表示するか、出力フォルダを開きます。

### 自分のスタイルを追加する 🎨

コンソールから追加するのが一番簡単です。

1. PhotoClub コンソールを開きます。
2. スタイル列の「スタイル追加」を押します。
3. 作りたい写真の雰囲気を入力します。例：夜のコンビニ前の日本風フィルム、夏の海辺の雑誌表紙、CCD フラッシュ自撮り。
4. 「スタイル作成」を押すと、再利用できる style として整理されます。
5. 新しいスタイルが一覧に出たら、人物と一緒に選んで生成します。
6. 初回生成に成功すると、そのスタイルの最後の生成結果がローカル縮小プレビューとして使われます。

### 新しいスタイルを投稿する 📮

良いスタイルを共有したい場合は、この手順でお願いします。

1. まずコンソールの「スタイル追加」で作成し、実際に生成して安定しているか確認します。
2. 新しくできた `styles/<styleId>.md` を確認します。
3. 提出するのは `styles/<styleId>.md` だけです。
4. `output/`、`profiles/`、`input/`、`styles/previews/` の画像は提出しないでください。
5. ローカル履歴、プレビュー画像、個人写真は提出しないでください。
6. PR では「夜景街撮り向け」「カップルのフィルム写真向け」「ステッカー出力向け」など、使いどころを短く書いてください。

スタイルファイルには、写真表現、構図、光、色、服装の雰囲気、質感だけを書きます。特定人物、顔の特徴、年齢、性別、一度きりの要望は固定しないでください。

### 起動 🛠️

必要なのは Codex デスクトップ版のインストールとログインだけです。

Node.js、npm、pnpm、Python、画像ツール、システムパッケージマネージャー、API Key は不要です。

Codex デスクトップ版でこのプロジェクトを開き、次のように入力します。

```text
启动 PhotoClub
```

環境確認、依存関係の準備、サービス起動、ブラウザでの表示まで自動で行います。

## English

### What is this? ✨

PhotoClub is a local AI photo studio. It lets you create reusable character references first, then generate photos of those people in many different styles.

The goal is a repeatable photo workflow, not one-off prompt experiments:

1. Create a character profile for more stable identity.
2. Pick styles, print size, orientation, and quantity.
3. Generate, preview, save, and resume unfinished batches when needed.

### What it can do 💡

- 👤 Character profiles: one folder per person, multiple reference photos, one standard multiview reference.
- 📝 Text-to-profile: create real or fictional characters from a text description.
- 👨‍👩‍👧 Same-frame photos: select multiple people and generate them together.
- 🎨 275+ styles: portraits, street snaps, film looks, studio shots, retro, cyber, travel, stickers, and more.
- ➕ Add your own styles: type a style prompt in the UI and save it as a reusable style.
- ✅ Batch generation: select multiple styles and run them in order; quantity applies to each style.
- 🖼️ Generation history: resume unfinished work after cancellation, quota limits, or interruption.
- 🧾 Print sizes: 7-Eleven L, 2L, DSC, KG, A4, 4x6, 5x7, 8x10, and custom pixel sizes.
- 🧷 Sticker mode: sticker-island layouts, bleed-safe margins, and 7-Eleven 1L output.
- 🌏 Trilingual UI: Chinese / Japanese / English live switching.
- 🔒 Local privacy: input photos, profiles, outputs, and style previews are ignored by Git by default.

### How to use 🚀

1. Put photos into `input/name/`. Multiple photos can belong to the same person.
2. Open the console and create a character profile from that input folder.
3. Select one or more people.
4. Select one or more styles, or use “Only new” to browse styles you have not generated yet.
5. Pick print format, portrait/landscape, and quantity.
6. Add a one-time request such as “summer mood”, “magazine cover”, or “couple photo”.
7. Generate, preview the large image, or open the output folder.

### Add your own style 🎨

The easiest way is from the console:

1. Open the PhotoClub console.
2. Click “Add style” in the style column.
3. Type the photo look you want, such as “Japanese film look outside a convenience store at night”, “summer beach magazine cover”, or “CCD flash selfie”.
4. Click “Create style”. PhotoClub turns your description into a reusable style.
5. The new style appears in the style list. Select it with one or more people and generate.
6. After the first successful generation, the style uses the last generated result as its local thumbnail.

### Submit a new style 📮

To share a useful style with the repository:

1. Create it with “Add style” in the console and test it with real generation first.
2. Find the new `styles/<styleId>.md` file.
3. Submit only that `styles/<styleId>.md` file.
4. Do not submit images from `output/`, `profiles/`, `input/`, or `styles/previews/`.
5. Do not submit local history, thumbnails, or private photos.
6. Open a PR and briefly describe when to use the style, such as “good for night street photos”, “good for couple film photos”, or “good for sticker output”.

A style should describe photography, composition, lighting, color, wardrobe mood, and post-processing texture. Do not lock it to a specific person, facial features, age, gender, or one-time request.

### Start 🛠️

The only prerequisite is Codex Desktop installed and signed in.

You do not need to install Node.js, npm, pnpm, Python, image tools, system package managers, or an API key.

Open this project in Codex Desktop and enter:

```text
启动 PhotoClub
```

PhotoClub will check the environment, prepare local dependencies, start the service, and open the console in your default browser.

## Local Privacy Folders 🔒

- `input/`: reference photos
- `profiles/`: character multiview references
- `output/`: generated photos
- `styles/previews/`: local style thumbnails

These folders are for your own local files. Real photos, generated images, and preview thumbnails are ignored by Git by default.
