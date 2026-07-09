export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      const { floor, seed, count, model } = await request.json();
      if (!floor) {
        return new Response(JSON.stringify({ error: 'Missing floor parameter.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 階層オブジェクト数（A〜H等）の定義
      const targetCount = count || 4;
      const lastChar = String.fromCharCode(64 + targetCount);

      const objectsSchema = Array.from({ length: targetCount }, (_, i) => {
        const char = String.fromCharCode(65 + i);
        return `    {
      "name": "サルベージされた記憶ブロック ${char} の識別名 (例: 1999年の夏休み日記, 魔法のiらんど開設ログ)",
      "text": "サルベージされたテキスト本文（※【超重要ルール】: 1995年〜2005年頃の、かつて日本の個人サイト(Geocities、魔法のiらんど、前略プロフィールなど)に実在したかのような『哀愁があり、かつ誰もが心当たりのある極めて生々しい日常の書き込み、個人の日記、掲示板への書き込み』。例：『今日はハリーポッターを読んだ。面白かった。』『冷やし中華をからし多めで食べた。美味しかった。』といった、少し滑稽で哀愁があり、誰かの体温を感じる生々しい内容。定型文ではない独特な表現で70文字程度）"
    }${i === targetCount - 1 ? '' : ','}`;
      }).join('\n');

      // 履歴から完全にサルベージされたオリジナルの指示プロンプト
      const prompt = `あなたはインターネットの過去アーカイブをサルベージする人工知能アナライザーであり、システムログの管理者です。
プレイヤーが「第${floor}階層」に到達しました。
このセクターに散らばる未デコードデータ ${targetCount} 個の内容と、このセクターを支配する「観察者NPC」の名前とセリフを、以下のJSONフォーマットで作成してください。

【出力テキストのルール（超重要）】
1. objects配下の各要素は、1995年〜2005年のインターネット初期（テキストサイト、Geocities、個人ホームページ、魔法のiらんど、前略プロフィールなど）に、実際に普通の『誰か』が書き残した日常の日記、独り言、掲示板への書き込みをイメージして日本語で記述してください。
2. 抽象的な定型文やポエジーな表現は【絶対禁止】とします。例えば『誰もいない。風が吹いている』のような誰にでも書ける文章ではなく、『今日の部活はしんどかった。帰りに駄菓子屋でアイスを食べた。あたりが出た。』『明日はいよいよ中間テストだ。世界史の範囲が広すぎて絶望している。』のような、極めて個別的で生活感と体温のある日常の記録にしてください。
3. 最後の${lastChar}のテキストの末尾に、情報への敬意を込めて「（元データ: [選んだ形式/出元], [1995〜2005年のいずれかの想定日付]）」を記載してください。

※重要：以下の「生成シードノイズ」に含まれる文字列の揺らぎを、想起するテキストのパラメータとして内部でデコードして反映させ、毎回異なるバリエーションと偶然性をもたらしてください。

生成シードノイズ: "${seed}"

以下の構造のJSONフォーマットでのみ出力してください（説明文などは一切含めないこと）。

{
  "message": "第${floor}階層に接続した際に表示するシステムメッセージ（例: 『警告：Geocities - 2002/05/11 のレコードと接続。』など、30文字程度）",
  "npcName": "観察者NPCの名前",
  "npcText": "観察者NPCのセリフ。※【超重要ルール】: 今回生成した『objects』配列（A〜${lastChar}のテキスト本文）に書かれている具体的な物事（例：読書感想文、ハリー・ポッター、冷やし中華、からしなど）を【最低1つは具体的な名詞として必ずセリフに取り込んで】ください。抽象的な定型文（『誰もいない掲示板』『あの頃の空気』『少し覗いてみましょうか』などの誰にでも使い回せるようなセリフ）は【絶対禁止】とします。その些細な日常の断片だからこそ宿る『人間の生々しさ、滑稽さ、当時の空気』について、哀愁を帯びた、または静かに思いを馳せる達観したトーンで呟かせてください（100文字程度）",
  "objects": [
${objectsSchema}
  ]
}

必ず上記の有効なJSONのみを返してください。`;

      const activeModel = model || 'gemini-flash-lite-latest';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.95
          }
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return new Response(JSON.stringify({ error: `Gemini API returned error: ${errorText}` }), {
          status: geminiResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const geminiData = await geminiResponse.json();
      const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      let parsedJson;
      try {
        parsedJson = JSON.parse(textResponse.trim());
      } catch (parseErr) {
        const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(cleanText);
      }

      return new Response(JSON.stringify(parsedJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
