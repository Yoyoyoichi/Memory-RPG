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

      // 完全にデバッグツールに同化する「お仕事システムメッセージ・エラーダンプ」を生成するプロンプト
      const prompt = `あなたはデータベース及びシステムログ管理用の人工知能アナライザーです。
オペレーターが「セクター 0x0${floor} (深度: ${floor * 100}m)」をマウントし、 unallocated メモリ空間から破損ファイルのサルベージを実行しています。
以下の条件に厳密に従い、システムが検出した「${count || 4} 個の破損メモリブロックのデコードログ（raw text stream）」と、このセクターを管理する「SYS_OBSERVERデーモン」のシステム割り込みログを、指定のJSON形式で出力してください。

【出力テキストの文体ルール (超重要)】
1. 情景やNPCのセリフ、日記といったゲーム的な表現は「絶対に」排除してください。
2. サルベージされたメッセージ(text)は、破損ディスクから抽出した「古いログの断片」という体裁で、SF的な諦念を含んだ、どこか詩的で指示に従うシステム自動記録ログ（例: ユーザーの操作ログ、記録された古い通信チャネルのログ、システム監査ログなど。文字数は50〜100字程度）として日本語で記述してください。
3. SYS_OBSERVERのセリフ(npcText)は、システムメッセージを模した、人為的な営みを冷徹に俯瞰するような短い無機質なプログラム出力（例: "Sync target defined. Analyzing human cognitive patterns..."）にしてください。

【JSONスキーマ】
{
  "message": "階層到達時のシステムメッセージ (例: Sector 0x0${floor}マウント成功。警告: メモリブロックの不連続性が検出されました。)",
  "npcName": "割り込みデーモン名 (例: SYS_DAEMON_V8, BUFFER_OBSERVER)",
  "npcText": "デーモンの割り込みメッセージ (例: Buffer check complete. Anomalous active pointer detected.)",
  "objects": [
    {
      "name": "メモリブロック識別名 (例: BLOCK_MEM_${floor}_A, CRITICAL_LOG_NODE_B)",
      "text": "サルベージされた破損テキストログ (日本語。例: '記録ログ [timestamp: 2048-12-10]: 通路の奥にはもう誰もいない。ただ、冷却ファンの回転音だけが鳴り響いている。データ復元はもう不要だ。')"
    }
  ]
}
※objectsの要素数は必ず ${count || 4} 個にしてください。`;

      // クライアント(React)から送られてきたモデル名を動的に使用し、なければデフォルトで gemini-flash-lite-latest を使用
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
