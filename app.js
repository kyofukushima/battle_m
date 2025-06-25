// ゲームデータ
const gameData = {
  player: {
    name: "人間",
    maxHP: 30,
    hp: 30,
    atk: 12,
    def: 8,
    lv: 1,
    exp: 0
  },
  boss: {
    name: "マエノ",
    maxHP: 100,
    hp: 100,
    atk: 15,
    def: 3,
    currentAttack: 0,
    state: 'normal', // normal, charging, awakened
    chargeCounter: 0,
    turnCounter: 0,
    dialogueTriggered: {
      hp75: false,
      hp50: false,
      hp30: false,
      hp10: false
    },
    images: {
      normal: "https://pplx-res.cloudinary.com/image/upload/v1750737901/gpt4o_images/pxmhkfnklzkjki8rbn4w.png",
      charging: "https://pplx-res.cloudinary.com/image/upload/v1750737965/gpt4o_images/qx2fn2bz9gceoilefioo.png",
      awakened: "https://pplx-res.cloudinary.com/image/upload/v1750738035/gpt4o_images/co67zspmj1saiputsxp3.png"
    },
    attackPatterns: {
      normal: [
        { name: "直線攻撃", duration: 3000, bullets: "straight", damage: 8 },
        { name: "円形攻撃", duration: 3500, bullets: "circle", damage: 10 }
      ],
      charging: [
        { name: "力溜め", duration: 2000, bullets: "charge", damage: 4 }
      ],
      awakened: [
        { name: "M字攻撃", duration: 7000, bullets: "m_attack", damage: 22 },
        { name: "螺旋嵐", duration: 8000, bullets: "spiral_storm", damage: 20 },
        { name: "十字砲撃", duration: 6500, bullets: "cross_pattern", damage: 25 },
        { name: "混沌乱舞", duration: 7500, bullets: "random_chaos", damage: 23 }
      ]
    }
  },
  battleCommands: [
    { name: "たたかう", action: "attack", description: "敵に攻撃する" },
    { name: "こうどう", action: "act", description: "戦わずに行動する" },
    { name: "アイテム", action: "item", description: "アイテムを使う" },
    { name: "みのがす", action: "mercy", description: "戦闘を終わらせる" }
  ],
  dialogues: {
    battleStart: "マエノが現れた！",
    playerTurn: "どうする？",
    bossAttack: "マエノの攻撃！",
    stateChange: {
      charging: "マエノが力を溜めている...！",
      awakened: "失礼いたします...本気を出させていただきます"
    },
    hpDialogues: {
      hp75: "まだまだ、これからですよ...",
      hp50: "なるほど、貴方も中々やりますね",
      hp30: "失礼いたします...本気を出させていただきます",
      hp10: "素晴らしい。これが貴方の実力ですか..."
    },
    victory: "勝利！経験値を得た！",
    defeat: "敗北...決意を忘れずに。"
  },
  items: [{ name: "回復薬", effect: "heal", value: 15, count: 3 }],
  colors: {
    background: "#000000",
    ui: "#FFFFFF",
    heart: "#FF0000",
    bullet: "#FFFFFF",
    bulletBlue: "#0099FF",
    bulletOrange: "#FF6600",
    text: "#FFFFFF",
    hp: "#FFFF00"
  }
};

// ゲーム状態
class GameState {
  constructor() {
    this.currentScreen = 'title';
    this.battlePhase = 'command'; // command, attack, dodge, end
    this.isPlayerTurn = true;
    this.bullets = [];
    this.heart = { x: 300, y: 150, size: 10 };
    this.keys = {};
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.canvas = null;
    this.ctx = null;
    this.animationId = null;
    this.dialogIndex = 0;
    this.currentDialog = '';
    this.isTyping = false;
    this.lastMoveTime = 0;
    this.wasMoving = false;
    this.attackGauge = { position: 0, direction: 1, active: false };
    this.battleBounds = { x: 50, y: 50, width: 500, height: 200 };
    this.intervals = [];
    this.enemyElement = null;
    this.stateEffectElement = null;
    this.stateTextElement = null;
    this.imagesLoaded = false;
    this.imageCache = {};
    
    // BGM管理
    this.bgm = {
      normal: null,
      awakened: null,
      current: null,
      volume: 0.5
    };
  }

  reset() {
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    // BGMを停止
    this.stopBGM();
    
    gameData.player.hp = gameData.player.maxHP;
    gameData.boss.hp = gameData.boss.maxHP;
    gameData.boss.currentAttack = 0;
    gameData.boss.state = 'normal';
    gameData.boss.chargeCounter = 0;
    gameData.boss.turnCounter = 0;
    gameData.boss.dialogueTriggered = {
      hp75: false,
      hp50: false,
      hp30: false,
      hp10: false
    };
    this.bullets = [];
    this.battlePhase = 'command';
    this.isPlayerTurn = true;
    this.heart = { x: 300, y: 150, size: 10 };
    this.updateUI();
    this.updateEnemyState();
  }

  updateUI() {
    // HP更新
    const playerHPPercent = (gameData.player.hp / gameData.player.maxHP) * 100;
    const bossHPPercent = (gameData.boss.hp / gameData.boss.maxHP) * 100;
    
    document.getElementById('player-hp-fill').style.width = playerHPPercent + '%';
    document.getElementById('boss-hp-fill').style.width = bossHPPercent + '%';
    document.getElementById('player-hp-text').textContent = `${gameData.player.hp}/${gameData.player.maxHP}`;
    document.getElementById('boss-hp-text').textContent = `${gameData.boss.hp}/${gameData.boss.maxHP}`;
  }

  updateEnemyState() {
    if (!this.enemyElement) {
      this.enemyElement = document.getElementById('enemy-image');
      this.stateEffectElement = document.getElementById('state-effect');
      this.stateTextElement = document.getElementById('enemy-state-text');
    }

    // 状態テキスト更新
    let stateText = '';
    let imageUrl = '';
    
    switch (gameData.boss.state) {
      case 'normal':
        stateText = '通常状態';
        imageUrl = gameData.boss.images.normal;
        break;
      case 'charging':
        stateText = '力溜め状態';
        imageUrl = gameData.boss.images.charging;
        break;
      case 'awakened':
        stateText = '覚醒状態';
        imageUrl = gameData.boss.images.awakened;
        break;
    }
    
    this.stateTextElement.textContent = stateText;

    // 画像設定と表示確保（改善版）
    if (this.enemyElement && imageUrl) {
      this.enemyElement.style.display = 'block';
      this.enemyElement.style.visibility = 'visible';
      
      // キャッシュされた画像があるかチェック
      if (this.imageCache[imageUrl]) {
        this.enemyElement.src = imageUrl;
        this.enemyElement.style.opacity = '1';
      } else {
        // 新しい画像を読み込み
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.onload = () => {
          this.imageCache[imageUrl] = true;
          this.enemyElement.src = imageUrl;
          this.enemyElement.style.opacity = '1';
          console.log(`Enemy image loaded successfully: ${gameData.boss.state}`);
        };
        
        tempImg.onerror = () => {
          console.error(`Failed to load enemy image: ${imageUrl}`);
          // フォールバック：テキスト表示
          this.enemyElement.style.display = 'none';
          this.stateTextElement.textContent += ' (画像読み込み中...)';
        };
        
        tempImg.src = imageUrl;
      }
    }

    // CSS クラス更新
    this.stateTextElement.className = '';
    this.enemyElement.className = 'enemy-sprite';
    this.stateEffectElement.className = 'state-effect';
    
    if (gameData.boss.state === 'charging') {
      this.stateTextElement.classList.add('charging');
      this.enemyElement.classList.add('charging');
      this.stateEffectElement.classList.add('charging');
    } else if (gameData.boss.state === 'awakened') {
      this.stateTextElement.classList.add('awakened');
      this.enemyElement.classList.add('awakened');
      this.stateEffectElement.classList.add('awakened');
    }
  }

  checkHPDialogue() {
    const hpPercent = (gameData.boss.hp / gameData.boss.maxHP) * 100;
    
    if (hpPercent <= 75 && hpPercent > 50 && !gameData.boss.dialogueTriggered.hp75) {
      gameData.boss.dialogueTriggered.hp75 = true;
      return gameData.dialogues.hpDialogues.hp75;
    }
    if (hpPercent <= 50 && hpPercent > 30 && !gameData.boss.dialogueTriggered.hp50) {
      gameData.boss.dialogueTriggered.hp50 = true;
      return gameData.dialogues.hpDialogues.hp50;
    }
    if (hpPercent <= 30 && hpPercent > 10 && !gameData.boss.dialogueTriggered.hp30) {
      gameData.boss.dialogueTriggered.hp30 = true;
      return gameData.dialogues.hpDialogues.hp30;
    }
    if (hpPercent <= 10 && !gameData.boss.dialogueTriggered.hp10) {
      gameData.boss.dialogueTriggered.hp10 = true;
      return gameData.dialogues.hpDialogues.hp10;
    }
    
    return null;
  }

  checkStateTransition() {
    const hpPercent = (gameData.boss.hp / gameData.boss.maxHP) * 100;
    
    // 覚醒状態への移行（HPが30%以下）
    if (hpPercent <= 30 && gameData.boss.state !== 'awakened') {
      gameData.boss.state = 'awakened';
      this.updateEnemyState();
      this.triggerScreenShake();
      // 覚醒BGMに切り替え
      this.playBGM('awakened');
      return 'awakened';
    }
    
    // 力溜め状態への移行（ランダム、通常状態時のみ）
    if (gameData.boss.state === 'normal' && Math.random() < 0.3) {
      gameData.boss.state = 'charging';
      gameData.boss.chargeCounter = 0;
      this.updateEnemyState();
      return 'charging';
    }
    
    // 力溜めから通常状態への復帰
    if (gameData.boss.state === 'charging') {
      gameData.boss.chargeCounter++;
      if (gameData.boss.chargeCounter >= 1) {
        gameData.boss.state = 'normal';
        this.updateEnemyState();
      }
    }
    
    return null;
  }

  triggerScreenShake() {
    document.querySelector('.game-container').classList.add('screen-shake');
    setTimeout(() => {
      document.querySelector('.game-container').classList.remove('screen-shake');
    }, 500);
  }

  resizeCanvas() {
    if (!this.canvas) return;
    
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const aspectRatio = 600 / 300;
    
    let width = Math.min(rect.width - 20, 600);
    let height = width / aspectRatio;
    
    if (height > rect.height - 20) {
      height = rect.height - 20;
      width = height * aspectRatio;
    }
    
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    // Update battle bounds based on canvas size
    const scaleX = width / 600;
    const scaleY = height / 300;
    this.battleBounds = {
      x: 50 * scaleX,
      y: 50 * scaleY,
      width: 500 * scaleX,
      height: 200 * scaleY
    };
  }

  preloadImages() {
    return new Promise((resolve) => {
      const imageUrls = Object.values(gameData.boss.images);
      let loadedCount = 0;

      const checkCompletion = () => {
        loadedCount++;
        if (loadedCount >= imageUrls.length) {
          this.imagesLoaded = true;
          console.log('All images preloaded successfully');
          resolve();
        }
      };

      // 各画像をプリロード
      imageUrls.forEach((url, index) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          this.imageCache[url] = true;
          console.log(`Image ${index + 1} loaded: ${url}`);
          checkCompletion();
        };
        
        img.onerror = () => {
          console.error(`Failed to preload image: ${url}`);
          checkCompletion();
        };
        
        img.src = url;
      });
    });
  }

  ensureEnemyImageVisible() {
    if (!this.enemyElement) return;
    
    // 強制的に画像を表示
    this.enemyElement.style.display = 'block';
    this.enemyElement.style.visibility = 'visible';
    this.enemyElement.style.opacity = '1';
    this.enemyElement.style.maxWidth = '200px';
    this.enemyElement.style.maxHeight = '150px';
    
    // 現在の状態に応じた画像を設定
    const currentImageUrl = gameData.boss.images[gameData.boss.state];
    if (currentImageUrl && this.enemyElement.src !== currentImageUrl) {
      this.enemyElement.src = currentImageUrl;
    }
  }
  
  // BGM関連メソッド
  initBGM() {
    // 通常BGMを初期化
    this.bgm.normal = new Audio('snd/maeno_normal.mp3');
    this.bgm.normal.loop = true;
    this.bgm.normal.volume = this.bgm.volume;
    
    // 覚醒BGMを初期化
    this.bgm.awakened = new Audio('snd/maeno_awakened.mp3');
    this.bgm.awakened.loop = true;
    this.bgm.awakened.volume = this.bgm.volume;
  }
  
  playBGM(type = 'normal') {
    // 現在のBGMを停止
    if (this.bgm.current) {
      this.bgm.current.pause();
      this.bgm.current.currentTime = 0;
    }
    
    // 新しいBGMを再生
    if (type === 'awakened' && this.bgm.awakened) {
      this.bgm.current = this.bgm.awakened;
      this.bgm.awakened.play().catch(err => console.log('BGM再生エラー:', err));
    } else if (this.bgm.normal) {
      this.bgm.current = this.bgm.normal;
      this.bgm.normal.play().catch(err => console.log('BGM再生エラー:', err));
    }
  }
  
  stopBGM() {
    if (this.bgm.current) {
      this.bgm.current.pause();
      this.bgm.current.currentTime = 0;
      this.bgm.current = null;
    }
  }
}

// 弾クラス
class Bullet {
  constructor(x, y, vx, vy, type = 'white') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type; // white, blue, orange
    this.size = 8;
    this.active = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    // 画面外で削除（余裕を持って削除）
    if (this.x < -50 || this.x > 650 || this.y < -50 || this.y > 350) {
      this.active = false;
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.type === 'blue' ? gameData.colors.bulletBlue : 
                   this.type === 'orange' ? gameData.colors.bulletOrange : 
                   gameData.colors.bullet;
    ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    
    // 弾の外枠
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
  }

  checkCollision(heart) {
    const dx = this.x - heart.x;
    const dy = this.y - heart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (this.size/2 + heart.size/2);
  }
}

// グローバル状態
const game = new GameState();

// 初期化
async function init() {
  // 画像のプリロード
  try {
    await game.preloadImages();
    console.log('Images preloaded successfully');
  } catch (error) {
    console.error('Error preloading images:', error);
  }

  // BGMを初期化
  game.initBGM();

  // Canvas初期化
  game.canvas = document.getElementById('battle-canvas');
  game.ctx = game.canvas.getContext('2d');
  
  setupEventListeners();
  showScreen('title');
  
  // Canvas初期化
  game.resizeCanvas();
  
  // モバイル判定
  if (game.isMobile) {
    document.getElementById('mobile-controls').style.display = 'block';
  }
  
  // リサイズイベント
  window.addEventListener('resize', () => game.resizeCanvas());
}

// イベントリスナー設定
function setupEventListeners() {
  // キーボードイベント
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  
  // タイトル画面
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('help-btn').addEventListener('click', () => showScreen('help'));
  document.getElementById('help-back-btn').addEventListener('click', () => showScreen('title'));
  
  // バトルヘルプボタン（修正）
  const battleHelpBtn = document.getElementById('battle-help-btn');
  if (battleHelpBtn) {
    battleHelpBtn.addEventListener('click', () => {
      showScreen('help');
    });
  }
  
  // コマンドボタン
  document.querySelectorAll('.command-btn').forEach(btn => {
    btn.addEventListener('click', handleCommand);
  });
  
  // 終了画面
  document.getElementById('retry-btn').addEventListener('click', startGame);
  document.getElementById('title-return-btn').addEventListener('click', () => showScreen('title'));
  
  // モバイルコントロール
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('touchstart', handleMobileControl);
    btn.addEventListener('touchend', handleMobileControlEnd);
    btn.addEventListener('mousedown', handleMobileControl);
    btn.addEventListener('mouseup', handleMobileControlEnd);
  });
  
  document.getElementById('mobile-action-btn').addEventListener('click', handleMobileAction);
  
  // 攻撃ゲージ
  document.addEventListener('click', handleAttackGauge);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') handleAttackGauge(e);
  });
  
  // ダイアログクリックでスキップ
  document.getElementById('dialog-area').addEventListener('click', skipDialog);
}

// 画面切り替え
function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenName + '-screen').classList.add('active');
  game.currentScreen = screenName;
  
  if (screenName === 'battle') {
    game.resizeCanvas();
    const battleHelpBtn = document.getElementById('battle-help-btn');
    if (battleHelpBtn) {
      battleHelpBtn.style.display = 'block';
    }
    // バトル画面に入った時に敵画像を確実に表示
    setTimeout(() => {
      game.ensureEnemyImageVisible();
    }, 100);
  } else {
    const battleHelpBtn = document.getElementById('battle-help-btn');
    if (battleHelpBtn) {
      battleHelpBtn.style.display = 'none';
    }
  }
}

// ゲーム開始
function startGame() {
  game.reset();
  showScreen('battle');
  startBattle();
}

// バトル開始
function startBattle() {
  game.battlePhase = 'intro';
  // 敵画像を確実に表示
  game.ensureEnemyImageVisible();
  // BGMを再生
  game.playBGM('normal');
  showDialog(gameData.dialogues.battleStart, () => {
    game.battlePhase = 'command';
    showCommands();
  });
}

// コマンド表示
function showCommands() {
  showDialog(gameData.dialogues.playerTurn);
  document.getElementById('command-area').style.display = 'grid';
  document.getElementById('dialog-area').style.display = 'flex';
}

// コマンド処理
function handleCommand(e) {
  const command = e.target.dataset.command;
  document.getElementById('command-area').style.display = 'none';
  
  switch (command) {
    case 'attack':
      startAttackPhase();
      break;
    case 'act':
      let message = "マエノを見つめた。";
      switch (gameData.boss.state) {
        case 'normal':
          message += "とても強そうだ。";
          break;
        case 'charging':
          message += "力を溜めている...今がチャンス！";
          break;
        case 'awakened':
          message += "怒りに燃えている！";
          break;
      }
      showDialog(message, () => enemyTurn());
      break;
    case 'item':
      useItem();
      break;
    case 'mercy':
      if (gameData.boss.hp < gameData.boss.maxHP * 0.3) {
        showDialog("マエノは去っていった...", () => endBattle(true));
      } else {
        showDialog("マエノはまだ戦う気だ。", () => enemyTurn());
      }
      break;
  }
}

// 攻撃フェーズ開始
function startAttackPhase() {
  game.battlePhase = 'attack';
  document.getElementById('attack-gauge-area').classList.remove('hidden');
  game.attackGauge.active = true;
  game.attackGauge.position = 0;
  game.attackGauge.direction = 1;
  animateAttackGauge();
}

// 攻撃ゲージアニメーション
function animateAttackGauge() {
  if (!game.attackGauge.active) return;
  
  game.attackGauge.position += game.attackGauge.direction * 2;
  
  if (game.attackGauge.position >= 100) {
    game.attackGauge.position = 100;
    game.attackGauge.direction = -1;
  } else if (game.attackGauge.position <= 0) {
    game.attackGauge.position = 0;
    game.attackGauge.direction = 1;
  }
  
  const indicator = document.getElementById('gauge-indicator');
  indicator.style.left = game.attackGauge.position + '%';
  
  requestAnimationFrame(animateAttackGauge);
}

// 攻撃ゲージクリック処理
function handleAttackGauge(e) {
  if (game.battlePhase !== 'attack' || !game.attackGauge.active) return;
  
  if (e) {
    e.preventDefault();
  }
  
  game.attackGauge.active = false;
  document.getElementById('attack-gauge-area').classList.add('hidden');
  
  // タイミング計算（30-70%が成功範囲に拡大）
  const accuracy = Math.abs(game.attackGauge.position - 50);
  let damage = gameData.player.atk;
  
  // 力溜め状態の敵には追加ダメージ
  if (gameData.boss.state === 'charging') {
    damage = Math.floor(damage * 2);
  }
  
  if (accuracy <= 15) {
    damage = Math.floor(damage * 1.5); // クリティカル
    showDialog(`クリティカルヒット！${damage} のダメージ！`, () => {
      dealDamage(damage);
    });
  } else if (accuracy <= 25) {
    showDialog(`${damage} のダメージ！`, () => {
      dealDamage(damage);
    });
  } else {
    damage = Math.floor(damage * 0.7); // ミス
    showDialog(`ミス！${damage} のダメージ...`, () => {
      dealDamage(damage);
    });
  }
}

// ダメージ処理
function dealDamage(damage) {
  gameData.boss.hp = Math.max(0, gameData.boss.hp - damage);
  game.updateUI();
  
  if (gameData.boss.hp <= 0) {
    // 勝利時の特別なセリフ
    showDialog("お見事でした...これが決意の力ですか。", () => {
      endBattle(true);
    });
    return;
  }
  
  // HPセリフチェック
  const hpDialogue = game.checkHPDialogue();
  if (hpDialogue) {
    showDialog(hpDialogue, () => {
      // 状態変化チェック
      const stateChange = game.checkStateTransition();
      
      if (stateChange) {
        const message = gameData.dialogues.stateChange[stateChange];
        if (message && message !== hpDialogue) {
          showDialog(message, () => enemyTurn());
        } else {
          enemyTurn();
        }
      } else {
        enemyTurn();
      }
    });
    return;
  }
  
  // 状態変化チェック
  const stateChange = game.checkStateTransition();
  
  if (stateChange) {
    const message = gameData.dialogues.stateChange[stateChange];
    if (message) {
      showDialog(message, () => enemyTurn());
    } else {
      enemyTurn();
    }
  } else {
    enemyTurn();
  }
}

// アイテム使用
function useItem() {
  const healItem = gameData.items.find(item => item.effect === 'heal');
  if (healItem && healItem.count > 0) {
    gameData.player.hp = Math.min(gameData.player.maxHP, gameData.player.hp + healItem.value);
    healItem.count--;
    game.updateUI();
    showDialog(`${healItem.name}を使った！HP が ${healItem.value} 回復した！`, () => enemyTurn());
  } else {
    showDialog("使えるアイテムがない。", () => enemyTurn());
  }
}

// 敵のターン
function enemyTurn() {
  game.battlePhase = 'dodge';
  game.isPlayerTurn = false;
  gameData.boss.turnCounter++;
  
  // 状態変化チェック
  const stateChange = game.checkStateTransition();
  if (stateChange && stateChange !== 'awakened') {
    const message = gameData.dialogues.stateChange[stateChange];
    if (message) {
      showDialog(message, () => {
        executeEnemyAttack();
      });
      return;
    }
  }
  
  executeEnemyAttack();
}

function executeEnemyAttack() {
  // 現在の状態に応じた攻撃パターンを選択
  let currentPatterns;
  switch(gameData.boss.state) {
    case 'normal':
      currentPatterns = gameData.boss.attackPatterns.normal;
      break;
    case 'charging':
      currentPatterns = gameData.boss.attackPatterns.charging;
      break;
    case 'awakened':
      currentPatterns = gameData.boss.attackPatterns.awakened;
      break;
    default:
      currentPatterns = gameData.boss.attackPatterns.normal;
  }
  
  const attack = currentPatterns[gameData.boss.currentAttack % currentPatterns.length];
  
  showDialog(`${gameData.dialogues.bossAttack}`, () => {
    startDodgePhase(attack);
  });
  
  gameData.boss.currentAttack++;
}

// 回避フェーズ開始
function startDodgePhase(attack) {
  document.getElementById('dialog-area').style.display = 'none';
  game.bullets = [];
  game.heart = { x: 300, y: 150, size: 10 };
  
  // 攻撃パターンに応じて弾を生成
  switch (attack.bullets) {
    case 'straight':
      createStraightBullets();
      break;
    case 'circle':
      createCircleBullets();
      break;
    case 'charge':
      createChargeBullets();
      break;
    case 'm_attack':
      createMAttack();
      break;
    case 'spiral_storm':
      createSpiralStorm();
      break;
    case 'cross_pattern':
      createCrossPattern();
      break;
    case 'random_chaos':
      createRandomChaos();
      break;
  }
  
  startGameLoop();
  
  // 攻撃終了タイマー
  setTimeout(() => {
    endDodgePhase();
  }, attack.duration);
}

// 直線弾攻撃
function createStraightBullets() {
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    // 上から降ってくる弾
    for (let i = 0; i < 2; i++) {
      const x = 180 + Math.random() * 240;
      game.bullets.push(new Bullet(x, 30, 0, 1.5 + Math.random() * 0.5, 'white'));
    }
    
    // 左右から来る弾
    if (Math.random() < 0.2) {
      const side = Math.random() < 0.5 ? 30 : 570;
      const y = 100 + Math.random() * 100;
      const vx = side < 300 ? 2 : -2;
      game.bullets.push(new Bullet(side, y, vx, 0, 'white'));
    }
    
  }, 500);
  
  game.intervals.push(interval);
}

// 円形弾攻撃
function createCircleBullets() {
  let angle = 0;
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    const centerX = 300;
    const centerY = 150;
    
    // 円形に弾を発射
    for (let i = 0; i < 4; i++) {
      const bulletAngle = angle + (i * Math.PI / 2);
      const vx = Math.cos(bulletAngle) * 1;
      const vy = Math.sin(bulletAngle) * 1;
      game.bullets.push(new Bullet(centerX, centerY, vx, vy, 'white'));
    }
    
    angle += Math.PI / 8;
  }, 600);
  
  game.intervals.push(interval);
}

// 力溜め攻撃（弾が非常に少ない）
function createChargeBullets() {
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    // 非常に少ない弾
    const x = 250 + Math.random() * 100;
    game.bullets.push(new Bullet(x, 30, 0, 1, 'white'));
    
  }, 1000);
  
  game.intervals.push(interval);
}

// M字攻撃パターン
function createMAttack() {
  const mShape = [
    // M字の左の縦線
    {x: 200, y: 50}, {x: 200, y: 80}, {x: 200, y: 110}, {x: 200, y: 140},
    // M字の右の縦線  
    {x: 400, y: 50}, {x: 400, y: 80}, {x: 400, y: 110}, {x: 400, y: 140},
    // M字の中央の山型
    {x: 250, y: 80}, {x: 280, y: 60}, {x: 300, y: 50}, {x: 320, y: 60}, {x: 350, y: 80}
  ];
  
  let index = 0;
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge' || index >= mShape.length) {
      clearInterval(interval);
      return;
    }
    
    const pos = mShape[index];
    // 覚醒状態なので弾の速度を1.5倍
    game.bullets.push(new Bullet(pos.x, pos.y, 0, 3, 'white'));
    
    // 追加で周囲にも弾を配置
    for (let i = 0; i < 2; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 40;
      game.bullets.push(new Bullet(pos.x + offsetX, pos.y + offsetY, 0, 2.5, 'white'));
    }
    
    index++;
  }, 300);
  
  game.intervals.push(interval);
  
  // 追加の高速弾幕
  const rapidInterval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(rapidInterval);
      return;
    }
    
    for (let i = 0; i < 4; i++) {
      const x = 120 + Math.random() * 360;
      game.bullets.push(new Bullet(x, 30, 0, 3.5, 'white'));
    }
  }, 800);
  
  game.intervals.push(rapidInterval);
}

// 螺旋嵐攻撃
function createSpiralStorm() {
  let angle = 0;
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    const centerX = 300;
    const centerY = 150;
    
    // 螺旋パターン
    for (let i = 0; i < 6; i++) {
      const spiralAngle = angle + (i * Math.PI / 3);
      const radius = 100 + Math.sin(angle * 0.5) * 50;
      const vx = Math.cos(spiralAngle) * 2.5;
      const vy = Math.sin(spiralAngle) * 2.5;
      game.bullets.push(new Bullet(centerX, centerY, vx, vy, 'white'));
    }
    
    // 混色弾も追加
    if (Math.random() < 0.4) {
      const x = 150 + Math.random() * 300;
      const bulletType = Math.random() < 0.5 ? 'blue' : 'orange';
      game.bullets.push(new Bullet(x, 30, 0, 3, bulletType));
    }
    
    angle += Math.PI / 6;
  }, 200);
  
  game.intervals.push(interval);
}

// 十字砲撃パターン
function createCrossPattern() {
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    const centerX = 300;
    const centerY = 150;
    
    // 十字方向に高速弾
    const directions = [
      {vx: 4, vy: 0},   // 右
      {vx: -4, vy: 0},  // 左
      {vx: 0, vy: 3},   // 下
      {vx: 0, vy: -3},  // 上
      {vx: 3, vy: 3},   // 右下
      {vx: -3, vy: 3},  // 左下
      {vx: 3, vy: -3},  // 右上
      {vx: -3, vy: -3}  // 左上
    ];
    
    directions.forEach(dir => {
      game.bullets.push(new Bullet(centerX, centerY, dir.vx, dir.vy, 'white'));
    });
    
    // 追加のランダム弾
    for (let i = 0; i < 5; i++) {
      const x = 100 + Math.random() * 400;
      game.bullets.push(new Bullet(x, 30, 0, 3.5, 'white'));
    }
    
  }, 600);
  
  game.intervals.push(interval);
}

// 混沌乱舞パターン
function createRandomChaos() {
  const interval = setInterval(() => {
    if (game.battlePhase !== 'dodge') {
      clearInterval(interval);
      return;
    }
    
    // ランダムな方向からの高速弾
    for (let i = 0; i < 8; i++) {
      const side = Math.random();
      let x, y, vx, vy;
      
      if (side < 0.25) { // 上から
        x = 100 + Math.random() * 400;
        y = 30;
        vx = (Math.random() - 0.5) * 2;
        vy = 3 + Math.random() * 2;
      } else if (side < 0.5) { // 下から
        x = 100 + Math.random() * 400;
        y = 270;
        vx = (Math.random() - 0.5) * 2;
        vy = -3 - Math.random() * 2;
      } else if (side < 0.75) { // 左から
        x = 30;
        y = 80 + Math.random() * 140;
        vx = 3 + Math.random() * 2;
        vy = (Math.random() - 0.5) * 2;
      } else { // 右から
        x = 570;
        y = 80 + Math.random() * 140;
        vx = -3 - Math.random() * 2;
        vy = (Math.random() - 0.5) * 2;
      }
      
      const bulletType = Math.random() < 0.7 ? 'white' : (Math.random() < 0.5 ? 'blue' : 'orange');
      game.bullets.push(new Bullet(x, y, vx, vy, bulletType));
    }
    
  }, 300);
  
  game.intervals.push(interval);
}

// ゲームループ開始
function startGameLoop() {
  if (game.animationId) {
    cancelAnimationFrame(game.animationId);
  }
  gameLoop();
}

// ゲームループ
function gameLoop() {
  if (game.battlePhase !== 'dodge') return;
  
  updateGame();
  drawGame();
  
  game.animationId = requestAnimationFrame(gameLoop);
}

// ゲーム更新
function updateGame() {
  // ハート移動
  updateHeart();
  
  // 弾更新
  game.bullets.forEach(bullet => bullet.update());
  game.bullets = game.bullets.filter(bullet => bullet.active);
  
  // 衝突判定
  checkCollisions();
}

// ハート更新
function updateHeart() {
  const speed = 3;
  let moved = false;
  
  // 境界内でのみ移動
  if (game.keys['ArrowUp'] || game.keys['KeyW']) {
    game.heart.y = Math.max(60, game.heart.y - speed);
    moved = true;
  }
  if (game.keys['ArrowDown'] || game.keys['KeyS']) {
    game.heart.y = Math.min(240, game.heart.y + speed);
    moved = true;
  }
  if (game.keys['ArrowLeft'] || game.keys['KeyA']) {
    game.heart.x = Math.max(60, game.heart.x - speed);
    moved = true;
  }
  if (game.keys['ArrowRight'] || game.keys['KeyD']) {
    game.heart.x = Math.min(540, game.heart.x + speed);
    moved = true;
  }
  
  // 動作状態を記録
  const now = Date.now();
  if (moved) {
    game.lastMoveTime = now;
    game.wasMoving = true;
  } else if (now - game.lastMoveTime > 200) {
    game.wasMoving = false;
  }
}

// 衝突判定
function checkCollisions() {
  game.bullets.forEach(bullet => {
    if (!bullet.active) return;
    
    if (bullet.checkCollision(game.heart)) {
      let takeDamage = false;
      
      switch (bullet.type) {
        case 'white':
          takeDamage = true;
          break;
        case 'blue':
          // 動いているとダメージ
          takeDamage = game.wasMoving;
          break;
        case 'orange':
          // 止まっているとダメージ
          takeDamage = !game.wasMoving;
          break;
      }
      
      if (takeDamage) {
        bullet.active = false;
        let currentPatterns;
        switch(gameData.boss.state) {
          case 'normal':
            currentPatterns = gameData.boss.attackPatterns.normal;
            break;
          case 'charging':
            currentPatterns = gameData.boss.attackPatterns.charging;
            break;
          case 'awakened':
            currentPatterns = gameData.boss.attackPatterns.awakened;
            break;
          default:
            currentPatterns = gameData.boss.attackPatterns.normal;
        }
        
        const currentAttackIndex = (gameData.boss.currentAttack - 1) % currentPatterns.length;
        const currentAttack = currentPatterns[currentAttackIndex];
        const damage = Math.max(1, currentAttack.damage - gameData.player.def);
        gameData.player.hp = Math.max(0, gameData.player.hp - damage);
        game.updateUI();
        
        // 画面震え効果
        game.canvas.classList.add('shake');
        setTimeout(() => game.canvas.classList.remove('shake'), 500);
      }
    }
  });
}

// ゲーム描画
function drawGame() {
  const ctx = game.ctx;
  
  // 背景をクリア
  ctx.fillStyle = gameData.colors.background;
  ctx.fillRect(0, 0, 600, 300);
  
  // バトルエリアの境界を描画
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, 500, 200);
  
  // 弾を描画
  game.bullets.forEach(bullet => bullet.draw(ctx));
  
  // ハートを描画
  ctx.fillStyle = gameData.colors.heart;
  ctx.fillRect(
    game.heart.x - game.heart.size/2, 
    game.heart.y - game.heart.size/2, 
    game.heart.size, 
    game.heart.size
  );
  
  // ハートの外枠
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    game.heart.x - game.heart.size/2, 
    game.heart.y - game.heart.size/2, 
    game.heart.size, 
    game.heart.size
  );
}

// 回避フェーズ終了
function endDodgePhase() {
  game.battlePhase = 'command';
  game.bullets = [];
  
  // すべてのインターバルをクリア
  game.intervals.forEach(interval => clearInterval(interval));
  game.intervals = [];
  
  if (game.animationId) {
    cancelAnimationFrame(game.animationId);
    game.animationId = null;
  }
  
  // 背景をクリア
  game.ctx.fillStyle = gameData.colors.background;
  game.ctx.fillRect(0, 0, 600, 300);
  
  if (gameData.player.hp <= 0) {
    // 敗北時の特別なセリフ
    showDialog("...決意を持ち続けてください。また、お会いしましょう。", () => {
      endBattle(false);
    });
  } else {
    game.isPlayerTurn = true;
    showCommands();
  }
}

// バトル終了
function endBattle(victory) {
  game.battlePhase = 'end';
  
  // すべてのインターバルをクリア
  game.intervals.forEach(interval => clearInterval(interval));
  game.intervals = [];
  
  if (game.animationId) {
    cancelAnimationFrame(game.animationId);
    game.animationId = null;
  }
  
  // BGMを停止
  game.stopBGM();
  
  const endTitle = document.getElementById('end-title');
  const endMessage = document.getElementById('end-message');
  
  if (victory) {
    endTitle.textContent = '勝利！';
    endMessage.textContent = gameData.dialogues.victory + ' もう一度挑戦しますか？';
    endTitle.style.color = '#ffff00';
  } else {
    endTitle.textContent = '敗北...';
    endMessage.textContent = gameData.dialogues.defeat + ' もう一度挑戦しますか？';
    endTitle.style.color = '#ff6666';
  }
  
  setTimeout(() => showScreen('end'), 1000);
}

// ダイアログ表示
function showDialog(text, callback = null) {
  const dialogElement = document.getElementById('dialog-text');
  dialogElement.textContent = '';
  game.currentDialog = text;
  game.dialogIndex = 0;
  game.isTyping = true;
  game.dialogCallback = callback;
  
  document.getElementById('dialog-area').style.display = 'flex';
  
  const typeInterval = setInterval(() => {
    if (game.dialogIndex < game.currentDialog.length) {
      dialogElement.textContent += game.currentDialog[game.dialogIndex];
      game.dialogIndex++;
    } else {
      clearInterval(typeInterval);
      game.isTyping = false;
      if (callback) {
        setTimeout(callback, 1000);
      }
    }
  }, 50);
}

// ダイアログスキップ
function skipDialog() {
  if (game.isTyping) {
    // タイピング中の場合、すぐに全文表示
    document.getElementById('dialog-text').textContent = game.currentDialog;
    game.isTyping = false;
    if (game.dialogCallback) {
      setTimeout(game.dialogCallback, 200);
    }
  }
}

// キーボードイベント
function handleKeyDown(e) {
  game.keys[e.code] = true;
  
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (game.isTyping) {
      skipDialog();
    }
  }
}

function handleKeyUp(e) {
  game.keys[e.code] = false;
}

// モバイルコントロール
function handleMobileControl(e) {
  e.preventDefault();
  const direction = e.target.dataset.direction;
  if (direction) {
    game.keys[`Arrow${direction.charAt(0).toUpperCase() + direction.slice(1)}`] = true;
  }
}

function handleMobileControlEnd(e) {
  e.preventDefault();
  const direction = e.target.dataset.direction;
  if (direction) {
    game.keys[`Arrow${direction.charAt(0).toUpperCase() + direction.slice(1)}`] = false;
  }
}

function handleMobileAction(e) {
  e.preventDefault();
  if (game.battlePhase === 'attack') {
    handleAttackGauge(e);
  } else if (game.isTyping) {
    skipDialog();
  }
}

// 初期化実行
document.addEventListener('DOMContentLoaded', init);