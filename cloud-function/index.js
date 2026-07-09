const { GoogleGenAI } = require('@google/genai');

// Google Cloud Functions のエントリーポイント (HTTP トリガー)
exports.geminiProxy = async (req, res) => {
  // CORS (オリジン間リソース共有) の許可設定 (Vite アプリや GitHub Pages からのアクセスを許可)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS プリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { floor, seed, count } = req.body;
    if (!floor) {
      res.status(400).json({ error: 'Missing required parameter: floor' });
      return;
    }

    // Google Cloud Functions の環境変数から API キーを取得 (絶対にコード上にキーを書かない)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    // 最新の @google/genai SDK の初期化
    const ai = new GoogleGenAI({ apiKey });
    
    // 最もコストがよく、クォータ制限の広い gemini-2.0-flash-lite (または自動追従の latest)
    const model = 'gemini-2.0-flash-lite';
    
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

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.95
      }
    });

    const textResponse = response.text || '';
    
    // JSONの解析チェック
    let parsedJson;
    try {
      parsedJson = JSON.parse(textResponse.trim());
    } catch (parseErr) {
      // JSONパースに失敗した場合のクリーニングフォールバック
      const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedJson = JSON.parse(cleanText);
    }

    res.status(200).json(parsedJson);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
