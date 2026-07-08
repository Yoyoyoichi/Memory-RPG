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

  // 8. 回収オブジェクトを部屋の重心に1部屋最大1つずつ配置
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadError, setIsLoadError] = useState(false); 
  const [debugLog, setDebugLog] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0); 

  const apiKeyInfo = localStorage.getItem('GEMINI_API_KEY') 
    ? 'ACTIVE (LocalStorage)' 
    : (import.meta.env.VITE_GEMINI_API_KEY ? 'ACTIVE (ViteENV)' : 'NOT_FOUND (FallbackMode)');

  // 階層読み込み時の処理
  useEffect(() => {
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
  }, [floor, retryTrigger]);

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
      if (isLoading || isLoadError) return; 

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
  }, [player, dungeon, allFound, objects, isLoading, isLoadError]);

  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  if (!dungeon) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'monospace', color: '#6b7280' }}>Initializing database log connection...</div>;

  const currentRows = dungeon.length;
  const currentCols = dungeon[0].length;

  // プレイヤーを中心に縦横半径15マスの視野グリッドを切り出す
  const renderGrid = [];
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

  // Excelのカラム名A~AEを生成するヘルパー
  const generateColLabel = (index) => {
    let label = '';
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  const colCount = VIEWPORT_RADIUS * 2 + 1; // 31列

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
      color: '#323130',
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
      fontSize: '12.5px',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 1. Excel 緑のタイトルバー */}
      <div style={{
        backgroundColor: '#107c41',
        color: '#ffffff',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'between',
        padding: '0 12px',
        fontSize: '12px',
        fontWeight: 600,
        userSelect: 'none',
        flexShrink: 0
      }}>
        <span>Weekly_Report_Draft.xlsx - Excel</span>
        <div style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>☁️ Saved to Drive</div>
      </div>

      {/* 2. Ribbon tabs */}
      <div style={{
        backgroundColor: '#107c41',
        color: '#ffffff',
        display: 'flex',
        paddingLeft: '20px',
        fontSize: '12px',
        borderBottom: '1px solid #0b5930',
        flexShrink: 0,
        userSelect: 'none'
      }}>
        <div style={{ padding: '6px 12px', cursor: 'pointer', backgroundColor: '#ffffff', color: '#107c41', fontWeight: 'bold', borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }}>Home</div>
        <div style={{ padding: '6px 12px', cursor: 'pointer', opacity: 0.85 }}>Insert</div>
        <div style={{ padding: '6px 12px', cursor: 'pointer', opacity: 0.85 }}>Page Layout</div>
        <div style={{ padding: '6px 12px', cursor: 'pointer', opacity: 0.85 }}>Data</div>
        <div style={{ padding: '6px 12px', cursor: 'pointer', opacity: 0.85 }}>View</div>
      </div>

      {/* 3. Excel toolbar */}
      <div style={{
        backgroundColor: '#f3f2f1',
        borderBottom: '1px solid #d1d1d1',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        userSelect: 'none',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid #d1d1d1', paddingRight: '12px' }}>
          <button style={{ background: 'none', border: '1px solid transparent', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#323130', borderRadius: '2px', cursor: 'pointer' }} onClick={handleRetry}>
            🔄 Refresh Connection
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid #d1d1d1', paddingRight: '12px' }}>
          <select style={{ border: '1px solid #d1d1d1', background: '#ffffff', padding: '2px 6px', fontSize: '11px', outline: 'none' }} disabled>
            <option>Arial (Oshii-AI)</option>
          </select>
          <span style={{ fontSize: '11px', color: '#797775' }}>Size: 13.5px</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', color: '#107c41', fontWeight: 'bold' }}>⚡ Active Thread Running</span>
        </div>
      </div>

      {/* 4. Excel formula bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #d1d1d1',
        backgroundColor: '#ffffff',
        height: '28px',
        flexShrink: 0
      }}>
        <div style={{ padding: '0 10px', fontWeight: 'bold', color: '#797775', borderRight: '1px solid #d1d1d1', userSelect: 'none', height: '100%', display: 'flex', alignHover: 'center', alignItems: 'center', fontStyle: 'italic' }}>fx</div>
        <input 
          type="text" 
          readOnly
          style={{ flex: 1, border: 'none', height: '100%', padding: '0 10px', outline: 'none', fontFamily: "'Consolas', monospace', monospace", fontSize: '13px', color: '#595959' }} 
          value={`=RECOVERY_SECTOR(0x0${floor}, DEPTH=${floor*100}m, ACTIVE_COORDS=[${player.x},${player.y}], SYNC_PROGRESS=${objects.filter(o=>o.found).length}/${objects.length})`}
        />
      </div>

      {/* 5. Main Spreadsheet Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        backgroundColor: '#ffffff'
      }}>
        {/* 左側: マップグリッド (Excelシート再現) */}
        <div style={{
          flex: '0 0 auto',
          overflow: 'auto',
          backgroundColor: '#f3f2f1',
          borderRight: '2px solid #d1d1d1',
          boxSizing: 'border-box'
        }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ height: '22px' }}>
                {/* 左上角の空セル */}
                <th style={{ width: '40px', backgroundColor: '#f3f2f1', border: '1px solid #d1d1d1', zIndex: 2, position: 'sticky', top: 0, left: 0 }}></th>
                {Array.from({ length: colCount }).map((_, cIdx) => (
                  <th key={cIdx} style={{
                    width: '18px',
                    backgroundColor: '#f3f2f1',
                    color: '#323130',
                    fontWeight: 'normal',
                    textAlign: 'center',
                    fontSize: '11px',
                    border: '1px solid #d1d1d1',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    userSelect: 'none'
                  }}>
                    {generateColLabel(cIdx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderGrid.map((row, rIndex) => (
                <tr key={rIndex} style={{ height: '18px' }}>
                  {/* 行番号セル */}
                  <td style={{
                    width: '40px',
                    backgroundColor: '#f3f2f1',
                    color: '#595959',
                    textAlign: 'center',
                    fontSize: '11px',
                    border: '1px solid #d1d1d1',
                    position: 'sticky',
                    left: 0,
                    userSelect: 'none',
                    fontWeight: 'normal'
                  }}>
                    {rIndex + 1}
                  </td>
                  {row.map((cell, cIndex) => {
                    let char = cell.char;
                    let color = '#a19f9d'; 
                    let bg = '#ffffff'; 

                    if (cell.type === 'player') {
                      char = '@';
                      color = '#18181b';
                      bg = '#fff2cc'; // プレイヤー位置をExcel風イエローでハイライト
                    } else if (cell.type === 'floor') {
                      color = '#cbd5e1'; 
                      char = '.';
                    } else if (cell.type === 'stairs') {
                      color = '#b45309'; 
                      bg = '#ffe699'; // 階段マークを警告オレンジ背景に
                    } else if (cell.type === 'object') {
                      const found = objects.find(o => o.id === cell.id)?.found;
                      color = found ? '#107c41' : '#a80000'; 
                      bg = found ? '#e2f0d9' : '#fce4d6'; // 未取得は赤、既取得は緑でセル背景を分ける
                    } else if (cell.type === 'npc') {
                      color = '#5c2d91'; 
                      bg = '#e4e2e2'; 
                    } else if (cell.type === 'fog' || cell.type === 'void') {
                      char = '\u00A0';
                      bg = '#f3f2f1'; // 未開拓フォグはグレーの空セルにする
                    }

                    return (
                      <td 
                        key={cIndex} 
                        style={{
                          width: '18px',
                          height: '18px',
                          textAlign: 'center',
                          padding: 0,
                          fontSize: '13.5px',
                          fontFamily: 'monospace',
                          color,
                          backgroundColor: bg,
                          border: '1px solid #e1dfdd',
                          userSelect: 'none',
                          fontWeight: cell.type === 'player' || cell.type === 'object' || cell.type === 'npc' ? 'bold' : 'normal'
                        }}
                      >
                        {char}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 中央: SYSTEM TIMELINE ログ (幅 360px 固定) */}
        <div style={{
          flex: '0 0 380px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '2px solid #d1d1d1',
          boxSizing: 'border-box'
        }}>
          {/* テーブルヘッダー的な見出し */}
          <div style={{
            backgroundColor: '#f3f2f1',
            borderBottom: '1px solid #d1d1d1',
            padding: '6px 12px',
            fontWeight: 'bold',
            fontSize: '11px',
            color: '#595959',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            RECOVERY_LOG_BUFFER
          </div>
          
          {/* スクロールする中身 */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            backgroundColor: '#ffffff'
          }}>
            {isLoadError && (
              <div style={{ padding: '8px 10px', backgroundColor: '#fde7e9', border: '1px solid #e00b1c', borderRadius: '2px', color: '#a80000', fontSize: '11.5px', marginBottom: '10px' }}>
                <strong>CRITICAL CONNECTION DROPPED</strong><br />
                <button onClick={handleRetry} style={{ marginTop: '6px', padding: '3px 8px', fontSize: '10.5px', backgroundColor: '#a80000', color: '#ffffff', border: 'none', cursor: 'pointer' }}>
                  Force Reconnect
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '11.5px' }}>
              {systemLogs.map((log, idx) => {
                if (log.type === 'system') {
                  return (
                    <div key={idx} style={{ color: '#005a9e', borderLeft: '3px solid #0078d4', paddingLeft: '8px', lineHeight: '1.4' }}>
                      [SYS_DAEMON] {log.text}
                    </div>
                  );
                } else if (log.type === 'success') {
                  return (
                    <div key={idx} style={{ color: '#107c41', borderLeft: '3px solid #107c41', paddingLeft: '8px', lineHeight: '1.4', fontWeight: 'bold', backgroundColor: '#f3faf5', padding: '4px 6px' }}>
                      [SYS_OK] {log.text}
                    </div>
                  );
                } else if (log.type === 'error') {
                  return (
                    <div key={idx} style={{ color: '#a80000', borderLeft: '3px solid #a80000', paddingLeft: '8px', lineHeight: '1.4', backgroundColor: '#fde7e9', padding: '4px 6px' }}>
                      [SYS_ERR] {log.text}
                    </div>
                  );
                } else if (log.type === 'npc_dialog') {
                  return (
                    <div key={idx} style={{ padding: '6px 8px', backgroundColor: '#f3f2f1', borderLeft: '3px solid #5c2d91', fontSize: '12px', color: '#323130', lineHeight: '1.4' }}>
                      <strong style={{ color: '#5c2d91' }}>💬 [{log.name}]:</strong><br />
                      {log.text}
                    </div>
                  );
                } else {
                  return (
                    <div key={idx} style={{ padding: '6px 8px', backgroundColor: '#faf9f8', borderLeft: '3px solid #0078d4', fontSize: '12px', color: '#323130', lineHeight: '1.4' }}>
                      <strong style={{ color: '#0078d4' }}>[{log.name}] payload:</strong><br />
                      {log.text}
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </div>

        {/* 右側: デコードされたストリームバッファ (Excelテーブル風リスト) */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff'
        }}>
          {/* テーブルヘッダーの見出し */}
          <div style={{
            backgroundColor: '#f3f2f1',
            borderBottom: '1px solid #d1d1d1',
            padding: '6px 12px',
            fontWeight: 'bold',
            fontSize: '11px',
            color: '#595959',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            DECODED_DATA_SHEET
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '15px'
          }}>
            {recoveredTexts.length === 0 ? (
              <div style={{ color: '#797775', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                Unallocated memory space. Extract A-{String.fromCharCode(64 + objects.length)} nodes to decode raw logs.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '15%', backgroundColor: '#f3f2f1', border: '1px solid #d1d1d1', padding: '6px', fontWeight: 'bold' }}>BLOCK_ID</th>
                    <th style={{ width: '15%', backgroundColor: '#f3f2f1', border: '1px solid #d1d1d1', padding: '6px', fontWeight: 'bold' }}>OFFSET</th>
                    <th style={{ width: '70%', backgroundColor: '#f3f2f1', border: '1px solid #d1d1d1', padding: '6px', fontWeight: 'bold' }}>RAW_TEXT_STREAM</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveredTexts.map((item, index) => (
                    <tr key={index}>
                      <td style={{ border: '1px solid #e1dfdd', padding: '8px', fontWeight: 'bold', color: '#107c41', backgroundColor: '#f3faf5' }}>
                        {item.name}
                      </td>
                      <td style={{ border: '1px solid #e1dfdd', padding: '8px', textAlign: 'center', color: '#595959' }}>
                        {item.count}/{objects.length}
                      </td>
                      <td style={{ border: '1px solid #e1dfdd', padding: '8px', lineHeight: '1.45', whiteSpace: 'pre-wrap', color: '#323130' }}>
                        {item.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* 6. Excelの下部ステータスバー */}
      <div style={{
        height: '24px',
        backgroundColor: '#107c41',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        fontSize: '11px',
        justifyContent: 'space-between',
        userSelect: 'none',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '15px' }}>
          <span>Ready</span>
          <span>|</span>
          <span>Average: 0.0825</span>
          <span>|</span>
          <span>Sum: {objects.filter(o=>o.found).length}</span>
        </div>
        <div>
          <span>Sheet1</span>
        </div>
      </div>
    </div>
  );
}
