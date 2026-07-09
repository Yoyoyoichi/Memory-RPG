export default {
  async fetch(request, env, ctx) {
    // CORS プリフライト（OPTIONS）および通常リクエスト用の共通レスポンスヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // OPTIONS プリフライトリクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // POST リクエストのみ受け付ける
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      // フロントエンドからのリクエストボディを取得 (floor, seed, count)
      const { floor, seed, count } = await request.json();
      if (!floor) {
        return new Response(JSON.stringify({ error: 'Missing floor parameter.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Cloudflare Workers の設定（Environment Variables）から API キーを取得
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on Cloudflare Workers.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const prompt = `あなたは記憶の断片を回収するダークファンタジーRPGのゲームマスター(観測デモイン)です。
プレイヤーが「第${floor}階層 (電脳深度: ${floor * 100}m)」に到達しました。
このセクターに散らばる未デコードデータ ${count || 4} 個の内容と、このセクターを支配する「観察者NPC」の名前とセリフを、以下のJSONフォーマットで作成してください。

【制約ルール】
1. 情景や日記の内容は、世界の崩壊、失われた記憶、切ないSF的な雰囲気の日本語で表現してください。
2. 返すデータは、以下の構造を持つJSONオブジェクトである必要があります。Markdownなどの余計な装飾文字、バックティックス（\`\`\`json）は一切含めず、純粋な生のJSONテキストとして出力してください。

【JSONスキーマ】
{
  "message": "階層到達時のシステムログ用テキストメッセージ (例: Sector 0x0${floor} initialization completed. Warning: High system instability.)",
  "npcName": "観察者NPCの名前 (例: ARCHIVIST_K, OBSERVER_V1)",
  "npcText": "観察者が発する、世界や人間を俯瞰するような短いセリフ",
  "objects": [
    {
      "name": "オブジェクト名 (例: 破損した記録ログ1, 古びた暗号キー2)",
      "text": "サルベージされた日記・テキストの断片 (50文字〜100文字程度の切なく意味深なストーリー文章)"
    }
  ]
}
※objectsの要素数は必ず ${count || 4} 個にしてください。`;

      // 直接 Gemini API に fetch リクエストを送信 (CORSやキーを隠蔽)
      // 最もコストがよく、クォータ制限の広い gemini-2.0-flash-lite (または自動追従の latest)
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

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

      // JSONの整形
      let parsedJson;
      try {
        parsedJson = JSON.parse(textResponse.trim());
      } catch (parseErr) {
        // 余計な ```json 等が含まれていた場合のクリーニング
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
