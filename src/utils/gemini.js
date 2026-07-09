import { GoogleGenAI } from '@google/genai';

// 階層ストーリーの取得 (元のZombie RPG用 - 後方互換性維持)
export async function generateFloorStory(floorNumber) {
  const apiKey = localStorage.getItem('GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    return { message: "API key is not configured. Please input API key in settings." };
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `あなたはダークファンタジーRPG of ゲームマスターです。プレイヤーが「第${floorNumber}階層」に到達しました。情景描写をJSONで出力してください。`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
  } catch (error) {
    console.error("Gemini API Error (generateFloorStory):", error);
    return { message: `Disconnected: ${error.message}` };
  }
}

// Memory RPG 用のストーリーとサルベージテキストの動的生成
export async function generateMemoryFloorStory(floorNumber, seedString, salvageCount = 4) {
  const apiKey = localStorage.getItem('GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error("API credentials missing. Please input your Gemini API Key in the console settings below.");
  }

  const genAI = new GoogleGenAI({ apiKey });

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-lite-latest",
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.95
      }
    });

    const targetCount = salvageCount;
    const lastChar = String.fromCharCode(64 + targetCount);

    const objectsSchema = Array.from({ length: targetCount }, (_, i) => {
      const char = String.fromCharCode(65 + i);
      return `    {
      "name": "サルベージされた記憶ブロック ${char} の識別名 (例: 1999年の夏休み日記, 魔法のiらんど開設ログ)",
      "text": "サルベージされたテキスト本文（※【超重要ルール】: 1995年〜2005年頃の、かつて日本の個人サイト(Geocities、魔法のiらんど、前略プロフィールなど)に実在したかのような『哀愁があり、かつ誰もが心当たりのある極めて生々しい日常の書き込み、個人の日記、掲示板への書き込み』。例：『今日はハリーポッターを読んだ。面白かった。』『冷やし中華をからし多めで食べた。美味しかった。』といった、少し滑稽で哀愁があり、誰かの体温を感じる生々しい内容。定型文ではない独特な表現で70文字程度）"
    }${i === targetCount - 1 ? '' : ','}`;
    }).join('\n');

    const prompt = `あなたはインターネットの過去アーカイブをサルベージする人工知能アナライザーであり、システムログの管理者です。
プレイヤーが「第${floorNumber}階層」に到達しました。
このセクターに散らばる未デコードデータ ${targetCount} 個の内容と、このセクターを支配する「観察者NPC」の名前とセリフを、以下のJSONフォーマットで作成してください。

【出力テキストのルール（超重要）】
1. objects配下の各要素は、1995年〜2005年のインターネット初期（テキストサイト、Geocities、個人ホームページ、魔法のiらんど、前略プロフィールなど）に、実際に普通の『誰か』が書き残した日常の日記、独り言、掲示板への書き込みをイメージして日本語で記述してください。
2. 抽象的な定型文やポエジーな表現は【絶対禁止】とします。例えば『誰もいない。風が吹いている』のような誰にでも書ける文章ではなく、『今日の部活はしんどかった。帰りに駄菓子屋でアイスを食べた。あたりが出た。』『明日はいよいよ中間テストだ。世界史の範囲が広すぎて絶望している。』のような、極めて個別的で生活感と体温のある日常の記録にしてください。
3. 最後の${lastChar}のテキストの末尾に、情報への敬意を込めて「（元データ: [選んだ形式/出元], [1995〜2005年のいずれかの想定日付]）」を記載してください。

※重要：以下の「生成シードノイズ」に含まれる文字列の揺らぎを、想起するテキストのパラメータとして内部でデコードして反映させ、毎回異なるバリエーションと偶然性をもたらしてください。

生成シードノイズ: "${seedString}"

以下の構造のJSONフォーマットでのみ出力してください（説明文などは一切含めないこと）。

{
  "message": "第${floorNumber}階層に接続した際に表示するシステムメッセージ（例: 『警告：Geocities - 2002/05/11 のレコードと接続。』など、30文字程度）",
  "npcName": "観察者NPCの名前",
  "npcText": "観察者NPCのセリフ。※【超重要ルール】: 今回生成した『objects』配列（A〜${lastChar}のテキスト本文）に書かれている具体的な物事（例：読書感想文、ハリー・ポッター、冷やし中華、からしなど）を【最低1つは具体的な名詞として必ずセリフに取り込んで】ください。抽象的な定型文（『誰もいない掲示板』『あの頃の空気』『少し覗いてみましょうか』などの誰にでも使い回せるようなセリフ）は【絶対禁止】とします。その些細な日常の断片だからこそ宿る『人間の生々しさ、滑稽さ、当時の空気』について、哀愁を帯びた、または静かに思いを馳せる達観したトーンで呟かせてください（100文字程度）",
  "objects": [
${objectsSchema}
  ]
}

必ず上記の有効なJSONのみを返してください。`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    return JSON.parse(textResponse.trim());
  } catch (error) {
    console.error("Gemini API Direct Connection Failure:", error);
    throw error;
  }
}
