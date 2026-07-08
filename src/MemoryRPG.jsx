import React, { useState, useEffect } from 'react';
import { generateMemoryFloorStory } from './utils/gemini';

// 視野制限の半径 (プレイヤー周囲15マスの viewport)
const VIEWPORT_RADIUS = 15;

// Learning RPG 本物のダンジョン生成アルゴリズム (階層に応じて徐々に部屋数とサルベージ数が滑らかに増えていく仕様)
const generateSimpleDungeon = (floor, storyObjects, npcData) => {
  const COLS = Math.min(100, 30 + (floor - 1) * 10);
  const ROWS = Math.min(100, 30 + (floor - 1) * 10);
  
  const grid = [];
  
  // マップを壁で初期化
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push({ char: '#', type: 'wall' });
    }
    grid.push(row);
  }

  // サルベージオブジェクトの必要数
  const defaultStoryObjects = [
    { id: 'A', name: '未デコードデータA', text: 'セクターA of データ復元を実行中... 接続が不完全です。' },
    { id: 'B', name: '未デコードデータB', text: 'セクターB of データ復元を実行中... 接続が不完全です。' },
    { id: 'C', name: '未デコードデータC', text: 'セクターC of データ復元を実行中... 接続が不完全です。' },
    { id: 'D', name: '未デコードデータD', text: 'セクターD of データ復元を実行中... 接続が不完全です。' }
  ];
  const rawObjects = storyObjects || defaultStoryObjects;
  const salvageCount = rawObjects.length;

  // 目標部屋数 = スタート部屋(1) + NPC部屋(1) + サルベージ部屋数
  const targetRooms = salvageCount + 2;

  const rooms = [];
  const minSize = 5;

  // 部屋のランダム生成
  let attempts = 0;
  const maxAttempts = targetRooms * 60;
  while (rooms.length < targetRooms && attempts < maxAttempts) {
    attempts++;
    const currentMaxSize = Math.random() < 0.2 ? 12 : 8;
    const w = Math.floor(Math.random() * (currentMaxSize - minSize + 1)) + minSize;
    const h = Math.floor(Math.random() * (currentMaxSize - minSize + 1)) + minSize;
    const x = Math.floor(Math.random() * (COLS - w - 2)) + 1;
    const y = Math.floor(Math.random() * (ROWS - h - 2)) + 1;

    let overlap = false;
    for (const r of rooms) {
      if (x - 1 <= r.x + r.w && x + w + 1 >= r.x && y - 1 <= r.y + r.h && y + h + 1 >= r.y) {
        overlap = true;
        break;
      }
    }

    if (!overlap) {
      rooms.push({ 
        x, y, w, h, 
        cx: Math.floor(x + w / 2), 
        cy: Math.floor(y + h / 2) 
      });
      
      // 部屋の床を削る
      for (let r = y; r < y + h; r++) {
        for (let c = x; c < x + w; c++) {
          grid[r][c] = { char: '.', type: 'floor' };
        }
      }
    }
  }

  // 目標部屋数に満たない場合の等間隔フォールバック生成
  if (rooms.length < targetRooms) {
    rooms.length = 0;
    const colsCount = Math.ceil(Math.sqrt(targetRooms));
    const rowsCount = Math.ceil(targetRooms / colsCount);
    const cellW = Math.floor(COLS / colsCount);
    const cellH = Math.floor(ROWS / rowsCount);

    for (let i = 0; i < targetRooms; i++) {
      const cellX = i % colsCount;
      const cellY = Math.floor(i / colsCount);
      const rx = cellX * cellW + 2;
      const ry = cellY * cellH + 2;
      const rw = Math.min(6, cellW - 4);
      const rh = Math.min(5, cellH - 4);
      
      rooms.push({
        x: rx, y: ry, w: rw, h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2)
      });

      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          grid[y][x] = { char: '.', type: 'floor' };
        }
      }
    }
  }

  // 通路の接続
  for (let i = 1; i < rooms.length; i++) {
    const r1 = rooms[i - 1];
    const r2 = rooms[i];

    const startX = Math.min(r1.cx, r2.cx);
    const endX = Math.max(r1.cx, r2.cx);
    for (let cx = startX; cx <= endX; cx++) {
      grid[r1.cy][cx] = { char: '.', type: 'floor' };
    }

    const startY = Math.min(r1.cy, r2.cy);
    const endY = Math.max(r1.cy, r2.cy);
    for (let cy = startY; cy <= endY; cy++) {
      grid[cy][r2.cx] = { char: '.', type: 'floor' };
    }
  }

  // プレイヤー開始位置
  const startPos = { x: rooms[0].cx, y: rooms[0].cy };

  // 階段の設置
  const lastRoom = rooms[rooms.length - 1];
  grid[lastRoom.cy][lastRoom.cx] = { char: '>', type: 'stairs' };
  const stairsPos = { x: lastRoom.cx, y: lastRoom.cy };

  // 配置用の部屋リストを抽出 (プレイヤー開始部屋[0]を除外)
  const availableRooms = rooms.slice(1);
  
  // シャッフル
  for (let i = availableRooms.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableRooms[i], availableRooms[j]] = [availableRooms[j], availableRooms[i]];
  }

  let roomIndex = 0;

  // 7. 観察者NPC (N) を1部屋に1つのルールで配置
  const npcRoom = availableRooms[roomIndex];
  roomIndex++;
  
  const npcObj = npcData && npcRoom ? {
    char: 'N',
    type: 'npc',
    name: npcData.name || '観測者',
    text: npcData.text || '……。',
    x: npcRoom.cx,
    y: npcRoom.cy
  } : null;

  if (npcObj) {
    if (npcObj.x === stairsPos.x && npcObj.y === stairsPos.y) {
      npcObj.x = npcObj.x + 1;
    }
    grid[npcObj.y][npcObj.x] = { char: 'N', type: 'npc', id: 'N' };
  }

  // 8. 回収オブジェクトを部屋の重心に1部屋最大 1つずつ配置
  const objects = [];
  const chars = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  
  for (let i = 0; i < salvageCount; i++) {
    const targetRoom = availableRooms[roomIndex];
    roomIndex++;

    if (!targetRoom) break;

    const objX = targetRoom.cx;
    let objY = targetRoom.cy;

    if (objX === stairsPos.x && objY === stairsPos.y) {
      objY = objY + 1;
    }

    objects.push({
      ...rawObjects[i],
      id: chars[i] || '?',
      char: chars[i] || '?',
      x: objX,
      y: objY,
      found: false
    });
  }

  objects.forEach(obj => {
    if (grid[obj.y][obj.x].type !== 'stairs' && grid[obj.y][obj.x].type !== 'npc') {
      grid[obj.y][obj.x] = { char: obj.char, type: 'object', id: obj.id };
    }
  });

  return { grid, startPos, stairsPos, objects, npc: npcObj, rooms, cols: COLS, rows: ROWS };
};

export default function MemoryRPG() {
  const [floor, setFloor] = useState(1);
  const [dungeon, setDungeon] = useState(null);
  const [rooms, setRooms] = useState([]); 
  const [player, setPlayer] = useState({ x: 0, y: 0 });
  const [objects, setObjects] = useState([]);
  const [observerNpc, setObserverNpc] = useState(null); 
  const [exploredTiles, setExploredTiles] = useState({}); 
  const [allFound, setAllFound] = useState(false);
  const [systemLogs, setSystemLogs] = useState([]); 
  const [recoveredTexts, setRecoveredTexts] = useState([]); 
  const [isLoading, setIsLoading] = useState(false); // 初期表示はローディングせず待機
  const [isLoadError, setIsLoadError] = useState(false); 
  const [debugLog, setDebugLog] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isConnectionStarted, setIsConnectionStarted] = useState(false); // 通信開始ボタン制御フラグ

  const apiKeyInfo = localStorage.getItem('GEMINI_API_KEY') 
    ? 'ACTIVE (LocalStorage)' 
    : (import.meta.env.VITE_GEMINI_API_KEY ? 'ACTIVE (ViteENV)' : 'NOT_FOUND (FallbackMode)');

  // 階層読み込み時の処理
  useEffect(() => {
    // 接続開始フラグが有効になるまでは通信を一切行わない
    if (!isConnectionStarted) return;

    let active = true;
    const fetchStoryAndBuildDungeon = async () => {
      setIsLoading(true);
      setIsLoadError(false);
      setDebugLog('');
      setObjects([]); 
      setObserverNpc(null); 
      try {
        const seedStr = 'seed-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();

        // 階層に応じて、サルベージ個数を滑らかに「じょじょに」増やす
        const salvageCount = Math.min(12, 4 + (floor - 1));

        const storyData = await generateMemoryFloorStory(floor, seedStr, salvageCount);
        if (!active) return;

        if (storyData.message && storyData.message.includes('エラー')) {
          setDebugLog(`API Error response: ${storyData.message}`);
        }

        const npcData = (storyData.npcName && storyData.npcText) ? {
          name: storyData.npcName,
          text: storyData.npcText
        } : {
          name: '観測者',
          text: '……このセクターのログにも、かつて呼吸していた誰かの体温が混ざっているな。'
        };

        const data = generateSimpleDungeon(floor, storyData.objects, npcData);
        setDungeon(data.grid);
        setRooms(data.rooms);
        setPlayer(data.startPos);
        setObjects(data.objects);
        setObserverNpc(data.npc);
        setExploredTiles({}); 
        setAllFound(false);
        setRecoveredTexts([]); 
        
        setSystemLogs([
          { type: 'system', text: storyData.message || `Connected to Sector 0x0${floor}.` }
        ]);
      } catch (err) {
        if (active) {
          setIsLoadError(true);
          setDebugLog(`Dungeon generation failure: ${err.message || err}`);
          const dummyData = generateSimpleDungeon(floor, null, null);
          setDungeon(dummyData.grid);
          setRooms(dummyData.rooms);
          setPlayer(dummyData.startPos);
          setObjects(dummyData.objects);
          setObserverNpc(dummyData.npc);
          setExploredTiles({});

          setSystemLogs([
            { type: 'error', text: `Failed to decode data stream buffer: ${err.message || err}` }
          ]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    fetchStoryAndBuildDungeon();

    return () => {
      active = false;
    };
  }, [floor, retryTrigger, isConnectionStarted]);

  // すべて見つかったか監視
  useEffect(() => {
    if (objects.length > 0 && objects.every(o => o.found)) {
      setAllFound(true);
      setSystemLogs(prev => [
        { type: 'success', text: 'Sync Ready: All allocated nodes matched. Accessing sector exit [>] allowed.' },
        ...prev
      ]);
    }
  }, [objects]);

  // Fog of War (視界開示処理)
  useEffect(() => {
    if (!dungeon || dungeon.length === 0 || rooms.length === 0) return;

    const currentRows = dungeon.length;
    const currentCols = dungeon[0].length;

    setExploredTiles(prev => {
      const next = { ...prev };
      let changed = false;

      const mark = (x, y) => {
        const key = `${x},${y}`;
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      };

      // プレイヤーの周囲5x5を視界開示
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const tx = player.x + c;
          const ty = player.y + r;
          if (tx >= 0 && tx < currentCols && ty >= 0 && ty < currentRows) {
            mark(tx, ty);
          }
        }
      }

      // プレイヤーが部屋の中にいるなら、その部屋全体を視界開示
      for (const room of rooms) {
        if (player.x >= room.x && player.x < room.x + room.w &&
            player.y >= room.y && player.y < room.y + room.h) {
          for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
            for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
              if (rx >= 0 && rx < currentCols && ry >= 0 && ry < currentRows) {
                mark(rx, ry);
              }
            }
          }
        }
      }

      return changed ? next : prev;
    });
  }, [player.x, player.y, dungeon, rooms]);

  const movePlayer = (dx, dy) => {
    if (!dungeon || isLoading || isLoadError) return;
    
    const newX = player.x + dx;
    const newY = player.y + dy;

    if (newY < 0 || newY >= dungeon.length || newX < 0 || newX >= dungeon[0].length) return;

    const tile = dungeon[newY][newX];
    if (tile.type === 'wall') return;

    setPlayer({ x: newX, y: newY });

    // オブジェクトに接触
    if (tile.type === 'object') {
      const objId = tile.id;
      const targetObj = objects.find(o => o.id === objId);
      
      if (targetObj) {
        if (targetObj.found) {
          setSystemLogs(prev => [
            { type: 'system', text: `Node [${targetObj.name}] is already synchronized.` },
            ...prev
          ]);
        } else {
          const foundCount = objects.filter(o => o.found).length;
          
          // A~Zの順番で厳密にデータ回収を行う順序チェック
          const chars = Array.from({ length: objects.length }, (_, i) => String.fromCharCode(65 + i));
          const expectedId = chars[foundCount];
          
          if (objId === expectedId) {
            setObjects(prev => prev.map(obj => {
              if (obj.id === objId) {
                return { ...obj, found: true };
              }
              return obj;
            }));
            
            setSystemLogs(prev => [
              { type: 'diary_reveal', name: `BLOCK_${targetObj.id}`, text: targetObj.text },
              { type: 'system', text: `Synchronized memory block [${targetObj.name}] (Offset ${foundCount + 1}/${objects.length}).` },
              ...prev
            ]);

            setRecoveredTexts(prev => [
              ...prev,
              { name: `BLOCK_${targetObj.id}`, text: targetObj.text, count: foundCount + 1 }
            ]);
          } else {
            const correctNextName = objects[foundCount] ? objects[foundCount].name : expectedId;
            setSystemLogs(prev => [
              { type: 'error', text: `Sync Error: Stream discontinuity detected. Expected block [${expectedId}] before accessing [${objId}].` },
              ...prev
            ]);
          }
        }
      }
    }

    // 観察者NPCに接触
    if (tile.type === 'npc' && observerNpc) {
      setSystemLogs(prev => [
        { type: 'npc_dialog', name: `OBSERVER: ${observerNpc.name}`, text: observerNpc.text },
        ...prev
      ]);
    }

    // 階段に到達
    if (tile.type === 'stairs') {
      if (!allFound) {
        setSystemLogs(prev => [
          { type: 'error', text: `Sync Error: Sector synchronization incomplete. Please scan all unallocated memory nodes first.` },
          ...prev
        ]);
      } else {
        setFloor(prev => prev + 1);
      }
    }
  };

  // キーボードイベントハンドラ
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isLoading || isLoadError || !isConnectionStarted) return; 

      const keysToPrevent = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
      if (keysToPrevent.includes(e.key)) {
        e.preventDefault(); 
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') movePlayer(0, -1);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') movePlayer(0, 1);
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') movePlayer(-1, 0);
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') movePlayer(1, 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, dungeon, allFound, objects, isLoading, isLoadError, isConnectionStarted]);

  // 階層読み込み完了後にウィンドウへフォーカスを強制するエフェクト (キーボード入力がすぐに効くように保証)
  useEffect(() => {
    if (isConnectionStarted && !isLoading && !isLoadError) {
      window.focus();
    }
  }, [isLoading, isConnectionStarted, isLoadError]);

  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  const handleStartConnection = () => {
    setIsConnectionStarted(true);
    window.focus(); // ボタンクリック直後にフォーカスをウィンドウへ奪う
  };

  const currentRows = dungeon ? dungeon.length : 0;
  const currentCols = dungeon ? dungeon[0].length : 0;

  // プレイヤーを中心に縦横半径15マスの視野グリッドを切り出す
  const renderGrid = [];
  if (dungeon) {
    for (let r = player.y - VIEWPORT_RADIUS; r <= player.y + VIEWPORT_RADIUS; r++) {
      const row = [];
      for (let c = player.x - VIEWPORT_RADIUS; c <= player.x + VIEWPORT_RADIUS; c++) {
        if (r < 0 || r >= currentRows || c < 0 || c >= currentCols) {
          row.push({ char: ' ', type: 'void' });
          continue;
        }

        const isExplored = exploredTiles[`${c},${r}`];
        if (!isExplored) {
          row.push({ char: ' ', type: 'fog' });
          continue;
        }

        let tile = dungeon[r][c];
        if (player.x === c && player.y === r) {
          row.push({ char: '@', type: 'player' });
        } else {
          row.push(tile);
        }
      }
      renderGrid.push(row);
    }
  }

  // HTMLコード壁の表示用文字を生成するためのジェネレータ
  const htmlWallString = '<div class="wall-node">';
  let wallCharPointer = 0;
  const getNextWallChar = () => {
    const char = htmlWallString[wallCharPointer];
    wallCharPointer = (wallCharPointer + 1) % htmlWallString.length;
    return char;
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      top: 0,
      left: 0,
      backgroundColor: '#ffffff',
      color: '#202124',
      fontFamily: "Consolas, 'Courier New', monospace, sans-serif",
      fontSize: '12px',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 1. DevTools ヘッダー通知バー */}
      <div style={{
        backgroundColor: '#f1f3f4',
        borderBottom: '1px solid #dadce0',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '11px',
        color: '#5f6368',
        gap: '15px',
        userSelect: 'none',
        flexShrink: 0
      }}>
        <span>💡 DevTools is now available in Japanese.</span>
        <button style={{ backgroundColor: '#ffffff', border: '1px solid #dadce0', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: '#1a73e8' }}>Don't show again</button>
        <button style={{ backgroundColor: '#1a73e8', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: '#ffffff' }} onClick={handleRetry}>Switch to Japanese</button>
      </div>

      {/* 2. DevTools メインタブバー */}
      <div style={{
        backgroundColor: '#f1f3f4',
        borderBottom: '1px solid #dadce0',
        display: 'flex',
        paddingLeft: '10px',
        fontSize: '11px',
        flexShrink: 0,
        userSelect: 'none',
        height: '28px',
        alignItems: 'center'
      }}>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '2px solid #1a73e8', color: '#1a73e8', fontWeight: 'bold' }}>Elements</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Console</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Sources</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Network</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Performance</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Memory</div>
        <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#5f6368' }}>Application</div>
        
        {/* ステータス警告バッジ */}
        <div style={{ marginLeft: 'auto', paddingRight: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#d93025', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>⚠️ 1</span>
          <span style={{ color: '#5f6368' }}>Settings ⚙️</span>
        </div>
      </div>

      {/* 3. メイン検証エリア (左右分割) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden'
      }}>
        
        {/* 左側: Elements パネル (HTML DOMツリーに擬態したマップ) */}
        <div style={{
          flex: '0 0 540px',
          overflow: 'auto',
          borderRight: '1px solid #dadce0',
          backgroundColor: '#ffffff',
          boxSizing: 'border-box',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* HTML ルート宣言のダミー */}
          <div style={{ color: '#5f6368', marginBottom: '4px' }}>&lt;!DOCTYPE html&gt;</div>
          <div style={{ color: '#881280', marginBottom: '2px' }}>&lt;<span style={{ color: '#1a73e8' }}>html</span>&gt;</div>
          <div style={{ color: '#881280', paddingLeft: '15px', marginBottom: '2px' }}>&lt;<span style={{ color: '#1a73e8' }}>head</span>&gt;&lt;/<span style={{ color: '#1a73e8' }}>head</span>&gt;</div>
          <div style={{ color: '#881280', paddingLeft: '15px', marginBottom: '5px' }}>&lt;<span style={{ color: '#1a73e8' }}>body</span>&gt;</div>

          {/* 31x31 マップエリアの表示分岐 */}
          {!isConnectionStarted ? (
            // 通信開始前のプレースホルダー（開始ボタンを表示）
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '430px',
              border: '1px dashed #dadce0',
              margin: '0 15px',
              backgroundColor: '#fafafa',
              borderRadius: '4px',
              padding: '20px',
              textAlign: 'center'
            }}>
              <div style={{ color: '#5f6368', fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' }}>[ CONNECT DISCONNECTED ]</div>
              <div style={{ color: '#797775', fontSize: '11.5px', marginBottom: '25px', lineHeight: '1.45' }}>
                Memory log synchronizer interface is ready.<br />
                Press start button to connect and mount active DOM tree sectors.
              </div>
              <button 
                onClick={handleStartConnection} 
                style={{
                  backgroundColor: '#1a73e8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 18px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  fontFamily: 'monospace'
                }}
              >
                [ Start Recovery Console ]
              </button>
            </div>
          ) : isLoading ? (
            // ローディング画面
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '430px',
              color: '#5f6368',
              gap: '12px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>[ SYSTEM: ACCESSING ARCHIVE... ]</div>
              <div style={{ fontSize: '11px' }}>Locating physical disk sectors. Please wait.</div>
            </div>
          ) : (
            // 31x31 マップを DOMツリー（グリッド状の要素）に擬態して描画
            <div style={{
              paddingLeft: '30px',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Consolas, monospace',
              fontSize: '11px',
              lineHeight: '1.1'
            }}>
              {renderGrid.map((row, rIndex) => (
                <div key={rIndex} style={{ display: 'flex', height: '14px' }}>
                  {row.map((cell, cIndex) => {
                    let char = '';
                    let color = '#881280'; 
                    let bg = 'transparent';

                    if (cell.type === 'player') {
                      char = '== $0';
                      color = '#ffffff';
                      bg = '#1a73e8'; // アクティブ要素の青ハイライト
                    } else if (cell.type === 'floor') {
                      char = '·'; // 床ドットはごく薄い点（コードのインデントを表現）
                      color = '#cbd5e1';
                    } else if (cell.type === 'stairs') {
                      char = '&lt;a&gt;'; // 階段はリンクタグ
                      color = '#1155cc';
                    } else if (cell.type === 'object') {
                      const found = objects.find(o => o.id === cell.id)?.found;
                      char = found ? `&lt;!--${cell.id}--&gt;` : cell.id; // 元のA, B, C記号
                      color = found ? '#1e7e34' : '#c53929';
                    } else if (cell.type === 'npc') {
                      char = 'N'; // 元のN記号
                      color = '#7c3aed';
                    } else if (cell.type === 'wall') {
                      const rawChar = getNextWallChar();
                      char = rawChar === '<' ? '&lt;' : rawChar === '>' ? '&gt;' : rawChar;
                      
                      // HTMLタグの配色（ブラケット・タグ名は紫、属性名は青、値はオレンジ）
                      if (rawChar === '<' || rawChar === '>' || rawChar === '/' || htmlWallString.substring(wallCharPointer - 1, wallCharPointer + 3).includes('div')) {
                        color = '#881280'; 
                      } else if (htmlWallString.substring(wallCharPointer - 1, wallCharPointer + 5).includes('class')) {
                        color = '#1a73e8'; 
                      } else {
                        color = '#c80000'; 
                      }
                    } else if (cell.type === 'fog' || cell.type === 'void') {
                      char = '\u00A0'; 
                    }

                    return (
                      <span
                        key={cIndex}
                        dangerouslySetInnerHTML={{ __html: char }}
                        style={{
                          width: '16px',
                          height: '14px',
                          textAlign: 'center',
                          display: 'inline-block',
                          fontSize: '10px',
                          color,
                          backgroundColor: bg,
                          overflow: 'hidden',
                          textOverflow: 'clip',
                          whiteSpace: 'nowrap',
                          fontWeight: cell.type === 'player' || cell.type === 'object' ? 'bold' : 'normal',
                          cursor: 'default',
                          userSelect: 'none'
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div style={{ color: '#881280', paddingLeft: '15px', marginTop: '5px' }}>&lt;/<span style={{ color: '#1a73e8' }}>body</span>&gt;</div>
          <div style={{ color: '#881280' }}>&lt;/<span style={{ color: '#1a73e8' }}>html</span>&gt;</div>
        </div>

        {/* 右側: Styles パネル (進行ログをCSSルールに擬態) */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#ffffff',
          boxSizing: 'border-box'
        }}>
          {/* サブヘッダータブ */}
          <div style={{
            backgroundColor: '#f1f3f4',
            borderBottom: '1px solid #dadce0',
            display: 'flex',
            fontSize: '11px',
            height: '24px',
            alignItems: 'center',
            paddingLeft: '5px',
            userSelect: 'none'
          }}>
            <div style={{ padding: '0 8px', color: '#202124', borderBottom: '1px solid #202124', fontWeight: 'bold' }}>Styles</div>
            <div style={{ padding: '0 8px', color: '#5f6368' }}>Computed</div>
            <div style={{ padding: '0 8px', color: '#5f6368' }}>Layout</div>
            <div style={{ padding: '0 8px', color: '#5f6368' }}>Event Listeners</div>
          </div>

          {/* CSSルール構造の中にタイムラインログを埋め込む */}
          <div style={{ padding: '10px', fontSize: '11px', lineHeight: '1.4' }}>
            {/* ダミーのセレクタ */}
            <div style={{ color: '#202124', fontWeight: 'bold', marginBottom: '4px' }}>element.style &#123;</div>
            <div style={{ paddingLeft: '15px', color: '#5f6368', marginBottom: '8px' }}>
              sector-id: <span style={{ color: '#c2850c' }}>0x0{floor}</span>;<br />
              offset-depth: <span style={{ color: '#c2850c' }}>{floor * 100}m</span>;
            </div>
            <div style={{ color: '#202124', fontWeight: 'bold' }}>&#125;</div>

            {/* タイムラインログをCSSクラス風に展開 */}
            <div style={{ marginTop: '15px' }}>
              <div style={{ color: '#202124', fontWeight: 'bold', marginBottom: '4px' }}>.recovery-timeline-buffer &#123;</div>
              <div style={{ paddingLeft: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {systemLogs.map((log, idx) => {
                  let logColor = '#005a9e';
                  let key = `sys-log-${idx}`;
                  if (log.type === 'success') logColor = '#1e7e34';
                  if (log.type === 'error') logColor = '#c53929';
                  if (log.type === 'npc_dialog') logColor = '#5c2d91';

                  return (
                    <div key={idx} style={{ color: '#5f6368' }}>
                      {key}: <span style={{ color: logColor }}>"{log.text}"</span>;
                    </div>
                  );
                })}
              </div>
              <div style={{ color: '#202124', fontWeight: 'bold', marginTop: '4px' }}>&#125;</div>
            </div>

            {/* ダミーのCSSクラス */}
            <div style={{ marginTop: '15px', borderTop: '1px solid #dadce0', paddingTop: '10px' }}>
              <div style={{ color: '#202124', fontWeight: 'bold' }}>.inspector-engine-diagnostics &#123;</div>
              <div style={{ paddingLeft: '15px', color: '#5f6368' }}>
                api-license: <span style={{ color: '#1a73e8' }}>"{apiKeyInfo}"</span>;<br />
                connection-state: <span style={{ color: isLoadError ? '#c53929' : '#1e7e34', fontWeight: 'bold' }}>"{isLoadError ? 'FAILURE' : 'SECURE_STABLE'}"</span>;
              </div>
              <div style={{ color: '#202124', fontWeight: 'bold' }}>&#125;</div>
            </div>
          </div>
        </div>

      </div>

      {/* 4. 下部: Console パネル (回収された日記ログをJSのコンソール出力に擬態) */}
      <div style={{
        height: '220px',
        borderTop: '1px solid #dadce0',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box'
      }}>
        {/* コンソール用のツールバー */}
        <div style={{
          backgroundColor: '#f1f3f4',
          borderBottom: '1px solid #dadce0',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '11px',
          color: '#5f6368',
          gap: '12px',
          userSelect: 'none'
        }}>
          <div style={{ fontWeight: 'bold', color: '#202124' }}>Console</div>
          <div>🚫 Clear</div>
          <div style={{ borderLeft: '1px solid #dadce0', paddingLeft: '12px' }}>
            Filter: <input type="text" readOnly placeholder="Expression" style={{ border: '1px solid #dadce0', padding: '1px 5px', fontSize: '10.5px', outline: 'none', width: '80px' }} />
          </div>
          <div style={{ marginLeft: 'auto' }}>Default levels 🔽</div>
        </div>

        {/* コンソールログ出力エリア (回収された日記本文) */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 15px',
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: '11.5px',
          lineHeight: '1.45',
          backgroundColor: '#ffffff'
        }}>
          {!isConnectionStarted ? (
            <div style={{ color: '#797775', fontStyle: 'italic' }}>
              &gt; Console system is idle. Awaiting recovery interface activation...
            </div>
          ) : recoveredTexts.length === 0 ? (
            <div style={{ color: '#797775', fontStyle: 'italic' }}>
              &gt; No active stream buffers. Decode unallocated memory nodes (A-{String.fromCharCode(64 + objects.length)}) to print log payloads.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recoveredTexts.map((item, index) => {
                const now = new Date();
                const timeStr = now.toTimeString().split(' ')[0];
                return (
                  <div key={index} style={{
                    borderBottom: '1px solid #f1f3f4',
                    padding: '4px 0',
                    display: 'flex',
                    alignItems: 'flex-start'
                  }}>
                    {/* タイムスタンプとメッセージ */}
                    <div style={{ flex: 1, color: '#323130' }}>
                      <span style={{ color: '#5f6368', marginRight: '8px' }}>[{timeStr}]</span>
                      <span style={{ color: '#1a73e8', fontWeight: 'bold', marginRight: '6px' }}>[{item.name}]</span>
                      <span style={{ color: '#5f6368', marginRight: '8px' }}>(Offset {item.count}/{objects.length}):</span>
                      <span style={{ color: '#202124', whiteSpace: 'pre-wrap' }}>{item.text}</span>
                    </div>
                    {/* JSファイルからの出力であるかのようなダミーのリンク */}
                    <div style={{ color: '#1a73e8', textDecoration: 'underline', cursor: 'pointer', fontSize: '10px', marginLeft: '15px' }}>
                      gemini_engine.js:{162 + index}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* コンソール入力プロンプトのダミー */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px', color: '#1a73e8' }}>
            <span style={{ marginRight: '6px', fontWeight: 'bold' }}>&gt;</span>
            <input 
              type="text" 
              readOnly 
              placeholder="ctrl + i to turn on code suggestions. Don't show again" 
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '11px', color: '#797775', fontStyle: 'italic', padding: 0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
