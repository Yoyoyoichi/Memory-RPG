import { GoogleGenAI } from '@google/genai';

// Google Cloud Functions の中継URL (設定されている場合は優先して使用)
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '';

// 階層ストーリーの取得 (元のZombie RPG用 - 後方互換性維持)
export async function generateFloorStory(floorNumber) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    return { message: "API key is not configured. Falling back to local offline mode." };
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
  // 1. Google Cloud Functions / Cloudflare Workers のプロキシURLが設定されている場合は、中継サーバーを使用
  if (PROXY_URL) {
    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          floor: floorNumber,
          seed: seedString,
          count: salvageCount
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Proxy Server Error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      return data;
    } catch (proxyError) {
      console.error("Proxy Connection Failed:", proxyError);
      throw new Error(`Proxy Connection Failed: ${proxyError.message || proxyError}`);
    }
  }

  // 2. プロキシURLが未設定、またはエラー時の直接通信フォールバック (従来通り)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('GEMINI_API_KEY') || '';
  if (!apiKey) {
    throw new Error("API credentials missing. Please set VITE_GEMINI_API_KEY in env, VITE_PROXY_URL, or localStorage.");
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

    const prompt = `あなたは記憶の断片を回収するダークファンタジーRPGのゲームマスター(観測デモイン)です。
プレイヤーが「第${floorNumber}階層 (電脳深度: ${floorNumber * 100}m)」に到達しました。
このセクターに散らばる未デコードデータ ${salvageCount} 個の内容と、このセクターを支配する「観察者NPC」の名前とセリフを、以下のJSONフォーマットで作成してください。

【制約ルール】
1. 情景や日記の内容は、世界の崩壊、失われた記憶、切ないSF的な雰囲気の日本語で表現してください。
2. 返すデータは、以下の構造を持つJSONオブジェクトである必要があります。Markdownなどの余計な装飾文字、バックティックス（\`\`\`json）は一切含めず、純粋な生のJSONテキストとして出力してください。

【JSONスキーマ】
{
  "message": "階層到達時のシステムログ用テキストメッセージ (例: Sector 0x0${floorNumber} initialization completed. Warning: High system instability.)",
  "npcName": "観察者NPCの名前 (例: ARCHIVIST_K, OBSERVER_V1)",
  "npcText": "観察者が発する、世界や人間を俯瞰するような短いセリフ",
  "objects": [
    {
      "name": "オブジェクト名 (例: 破損した記録ログ1, 古びた暗号キー2)",
      "text": "サルベージされた日記・テキストの断片 (50文字〜100文字程度の切なく意味深なストーリー文章)"
    }
  ]
}
※objectsの要素数は必ず ${salvageCount} 個にしてください。`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    return JSON.parse(textResponse.trim());
  } catch (error) {
    console.error("Gemini API Direct Connection Failure:", error);
    throw error;
  }
}
