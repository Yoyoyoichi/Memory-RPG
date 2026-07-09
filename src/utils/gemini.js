// 確定した Cloudflare Workers のセキュア中継プロキシURL (クレジットカード不要・漏洩ゼロ)
const PROXY_URL = 'https://yellow-waterfall-8020.9170chet.workers.dev';

// 階層ストーリーの取得 (元のZombie RPG用 - 後方互換性維持のため中継経由に書き換え)
export async function generateFloorStory(floorNumber) {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        floor: floorNumber,
        seed: 'seed-' + floorNumber,
        count: 4
      })
    });
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Gemini API Error (generateFloorStory):", error);
    return { message: `Disconnected: ${error.message}` };
  }
}

// Memory RPG 用のストーリーとサルベージテキストの動的生成 (プロキシ通信に完全固定)
export async function generateMemoryFloorStory(floorNumber, seedString, salvageCount = 4) {
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
