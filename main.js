/* Mini Galaga+ (Phaser 3)
   Features:
   1) Dive attacks (enemy breaks formation, dives, then returns)
   2) Powerups: Shot+ (double/triple), Shield, Bomb
   3) Sprites + Sound: if assets exist use them; otherwise generate textures + WebAudio beeps/BGM
   4) Mobile touch: drag to move, auto-fire on mobile, on-screen Bomb button

   Controls (Desktop):
   - Arrow / A,D: move
   - Space: shoot
   - B: bomb
   - R: restart (when game over)

   Optional assets (place under /assets):
   - player.png, enemy.png, bullet_p.png, bullet_e.png, powerup.png, explosion.png (optional)
   - bgm.mp3 (or .ogg), shoot.wav, boom.wav, power.wav, hit.wav (optional)
*/

const W = 420;
const H = 720;

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: "game",
  backgroundColor: "#0b1020",
  physics: {
    default: "arcade",
    arcade: { debug: false }
  },
  scene: [MainScene]
};

new Phaser.Game(config);

function MainScene() { Phaser.Scene.call(this, { key: "MainScene" }); }
MainScene.prototype = Object.create(Phaser.Scene.prototype);
MainScene.prototype.constructor = MainScene;

MainScene.prototype.preload = function () {
  // Try to load optional external assets. If missing, we fall back to generated textures.
  // Note: Missing files would normally trigger load errors; Phaser continues running.
  this.load.setPath("./assets");
  this.load.image("playerSprite", "player.png");
  this.load.image("enemySprite", "enemy.png");
  this.load.image("pBulletSprite", "bullet_p.png");
  this.load.image("eBulletSprite", "bullet_e.png");
  this.load.image("powerupSprite", "powerup.png");
  this.load.image("explosionSprite", "explosion.png");

  this.load.audio("bgm", ["bgm.mp3", "bgm.ogg"]);
  this.load.audio("s_shoot", ["shoot.wav", "shoot.mp3", "shoot.ogg"]);
  this.load.audio("s_boom", ["boom.wav", "boom.mp3", "boom.ogg"]);
  this.load.audio("s_power", ["power.wav", "power.mp3", "power.ogg"]);
  this.load.audio("s_hit", ["hit.wav", "hit.mp3", "hit.ogg"]);
};

MainScene.prototype.create = function () {
  this.gameOver = false;

  // ---------- Helpers ----------
  this.isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;

  // WebAudio fallback (beeps + simple BGM)
  this.audioCtx = null;
  this.bgmOsc = null;
  this.bgmGain = null;
  this.ensureAudioCtx = () => {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
  };
  this.playBeep = (freq, durMs, type = "sine", gain = 0.05) => {
    try {
      this.ensureAudioCtx();
      if (!this.audioCtx) return;
      const ctx = this.audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      o.start(now);
      o.stop(now + durMs / 1000);
      // click-less envelope
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
    } catch {}
  };
  this.startBgmFallback = () => {
    try {
      this.ensureAudioCtx();
      if (!this.audioCtx || this.bgmOsc) return;
      const ctx = this.audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 110;
      g.gain.value = 0.015;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      this.bgmOsc = o;
      this.bgmGain = g;

      // gentle “chord-ish” movement
      this.time.addEvent({
        delay: 800,
        loop: true,
        callback: () => {
          if (!this.bgmOsc) return;
          const notes = [110, 123.47, 130.81, 146.83, 164.81];
          this.bgmOsc.frequency.setValueAtTime(
            Phaser.Utils.Array.GetRandom(notes),
            ctx.currentTime
          );
        }
      });
    } catch {}
  };
  this.stopBgmFallback = () => {
    try {
      if (this.bgmOsc) {
        this.bgmOsc.stop();
        this.bgmOsc.disconnect();
        this.bgmOsc = null;
      }
      if (this.bgmGain) {
        this.bgmGain.disconnect();
        this.bgmGain = null;
      }
    } catch {}
  };

  // Phaser Sound if loaded
  const hasPhaserAudio = (key) => this.cache.audio.exists(key);
  this.playSfx = (key, fallbackFreq) => {
    if (hasPhaserAudio(key)) {
      try { this.sound.play(key, { volume: 0.25 }); } catch {}
    } else {
      // fallback beep
      this.playBeep(fallbackFreq, 70, "square", 0.05);
    }
  };

  // ---------- Create fallback textures (if sprite assets missing) ----------
  const makeFallbackTextures = () => {
    const g = this.add.graphics();

    // Player
    if (!this.textures.exists("playerTex")) {
      g.clear();
      g.fillStyle(0x7dd3fc, 1);
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(24, 24);
      g.lineTo(12, 20);
      g.lineTo(0, 24);
      g.closePath();
      g.fillPath();
      g.generateTexture("playerTex", 24, 24);
    }

    // Enemy
    if (!this.textures.exists("enemyTex")) {
      g.clear();
      g.fillStyle(0xfca5a5, 1);
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(24, 12);
      g.lineTo(12, 24);
      g.lineTo(0, 12);
      g.closePath();
      g.fillPath();
      g.generateTexture("enemyTex", 24, 24);
    }

    // Player bullet
    if (!this.textures.exists("pBulletTex")) {
      g.clear();
      g.fillStyle(0xfde68a, 1);
      g.fillRect(0, 0, 4, 12);
      g.generateTexture("pBulletTex", 4, 12);
    }

    // Enemy bullet
    if (!this.textures.exists("eBulletTex")) {
      g.clear();
      g.fillStyle(0xa7f3d0, 1);
      g.fillRect(0, 0, 4, 10);
      g.generateTexture("eBulletTex", 4, 10);
    }

    // Powerup
    if (!this.textures.exists("powerupTex")) {
      g.clear();
      g.fillStyle(0xc4b5fd, 1);
      g.fillCircle(10, 10, 10);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(10, 10, 3);
      g.generateTexture("powerupTex", 20, 20);
    }

    // Explosion
    if (!this.textures.exists("explosionTex")) {
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 16);
      g.generateTexture("explosionTex", 32, 32);
    }

    // Star
    if (!this.textures.exists("starTex")) {
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 2, 2);
      g.generateTexture("starTex", 2, 2);
    }

    g.destroy();
  };
  makeFallbackTextures();

  // choose texture keys (sprite if available, else fallback)
  const tex = {
    player: this.textures.exists("playerSprite") ? "playerSprite" : "playerTex",
    enemy: this.textures.exists("enemySprite") ? "enemySprite" : "enemyTex",
    pBullet: this.textures.exists("pBulletSprite") ? "pBulletSprite" : "pBulletTex",
    eBullet: this.textures.exists("eBulletSprite") ? "eBulletSprite" : "eBulletTex",
    powerup: this.textures.exists("powerupSprite") ? "powerupSprite" : "powerupTex",
    explosion: this.textures.exists("explosionSprite") ? "explosionSprite" : "explosionTex",
    star: "starTex"
  };
  this.tex = tex;

  // ---------- Background stars ----------
  this.stars = this.add.group();
  for (let i = 0; i < 90; i++) {
    const x = Phaser.Math.Between(0, W);
    const y = Phaser.Math.Between(0, H);
    const s = this.add.image(x, y, tex.star)
      .setAlpha(Phaser.Math.FloatBetween(0.15, 0.9));
    s.speed = Phaser.Math.FloatBetween(30, 140);
    this.stars.add(s);
  }

  // ---------- Player ----------
  this.player = this.physics.add.sprite(W / 2, H - 80, tex.player);
  this.player.setCollideWorldBounds(true);
  this.player.setDragX(1800);
  this.player.setMaxVelocity(360, 0);
  this.player.body.allowGravity = false;

  // Player state (powerups)
  this.score = 0;
  this.lives = 3;
  this.wave = 1;

  this.shotLevel = 1;         // 1, 2, 3
  this.shotUntil = 0;         // time until shot level expires
  this.shieldUntil = 0;       // time until shield expires
  this.bombs = 1;

  // Visual shield ring
  this.shieldRing = this.add.graphics();
  this.shieldRing.setDepth(10);

  // ---------- Input ----------
  this.cursors = this.input.keyboard.createCursorKeys();
  this.keys = this.input.keyboard.addKeys({
    A: Phaser.Input.Keyboard.KeyCodes.A,
    D: Phaser.Input.Keyboard.KeyCodes.D,
    SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
    B: Phaser.Input.Keyboard.KeyCodes.B,
    R: Phaser.Input.Keyboard.KeyCodes.R
  });

  // Mobile/touch: drag to move
  this.isDragging = false;
  this.input.on("pointerdown", (p) => {
    // user gesture: allow audio
    try {
      if (this.sound && this.sound.context && this.sound.context.state === "suspended") {
        this.sound.context.resume();
      }
      this.ensureAudioCtx();
      if (this.audioCtx && this.audioCtx.state === "suspended") this.audioCtx.resume();
    } catch {}

    this.isDragging = true;
    this.dragOffsetX = this.player.x - p.x;
  });
  this.input.on("pointerup", () => { this.isDragging = false; });
  this.input.on("pointermove", (p) => {
    if (!this.isDragging) return;
    const x = Phaser.Math.Clamp(p.x + this.dragOffsetX, 20, W - 20);
    this.player.x = x;
    this.player.setVelocityX(0);
    this.player.setAccelerationX(0);
  });

  // ---------- Bullets & Powerups ----------
  this.playerBullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Image,
    maxSize: 80
  });
  this.enemyBullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Image,
    maxSize: 120
  });
  this.powerups = this.physics.add.group();

  // ---------- Enemies / formation ----------
  this.enemies = this.physics.add.group();
  this.formation = {
    offsetX: 0,
    dir: 1,
    speed: 40,
    drop: 26,
    leftBound: 24,
    rightBound: W - 24
  };

  this.enemyFireRateMs = 850;
  this.lastEnemyShotAt = 0;

  // dive attack timing
  this.lastDiveAt = 0;
  this.diveIntervalMs = 2200;

  // player fire
  this.playerFireCooldownMs = 160;
  this.lastPlayerShotAt = 0;

  // ---------- UI ----------
  this.uiText = this.add.text(14, 14, "", {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "15px",
    color: "#e5e7eb"
  });

  this.bigText = this.add.text(W / 2, H / 2, "", {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "28px",
    color: "#ffffff",
    align: "center"
  }).setOrigin(0.5);

  // Mobile bomb button
  this.bombBtn = this.add.rectangle(W - 60, H - 60, 90, 44, 0x111827, 0.85)
    .setStrokeStyle(2, 0x93c5fd, 0.8)
    .setDepth(20)
    .setInteractive({ useHandCursor: true });

  this.bombTxt = this.add.text(W - 60, H - 60, "BOMB", {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "14px",
    color: "#e5e7eb"
  }).setOrigin(0.5).setDepth(21);

  this.bombBtn.on("pointerdown", () => {
    this.useBomb();
  });

  // Hide bomb button on desktop (optional)
  if (!this.isMobile) {
    this.bombBtn.setVisible(false);
    this.bombTxt.setVisible(false);
  }

  // ---------- Collisions ----------
  this.physics.add.overlap(this.playerBullets, this.enemies, this.onPlayerBulletHitEnemy, null, this);
  this.physics.add.overlap(this.enemyBullets, this.player, this.onEnemyBulletHitPlayer, null, this);
  this.physics.add.overlap(this.enemies, this.player, this.onEnemyTouchPlayer, null, this);
  this.physics.add.overlap(this.player, this.powerups, this.onPlayerPickPowerup, null, this);

  // ---------- Spawn wave ----------
  this.spawnWave(this.wave);

  // ---------- Restart ----------
  this.input.keyboard.on("keydown-R", () => {
    if (this.gameOver) this.scene.restart();
  });

  // ---------- Music ----------
  // Prefer Phaser audio if available; else fallback oscillator BGM after first user gesture
  if (hasPhaserAudio("bgm")) {
    try {
      this.bgm = this.sound.add("bgm", { loop: true, volume: 0.18 });
      this.bgm.play();
    } catch {
      // ignore
    }
  } else {
    // start fallback BGM after first pointerdown (user gesture), but we can also attempt now
    // (some browsers suspend until gesture)
    this.startBgmFallback();
  }
};

MainScene.prototype.spawnWave = function (wave) {
  this.enemies.clear(true, true);

  this.formation.offsetX = 0;
  this.formation.dir = 1;

  const rows = Phaser.Math.Clamp(3 + wave, 3, 7);
  const cols = Phaser.Math.Clamp(6 + Math.floor(wave / 2), 6, 10);

  const spacing = 34;
  const startX = (W - (cols - 1) * spacing) / 2;
  const startY = 90;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = startX + c * spacing;
      const baseY = startY + r * spacing;

      const e = this.physics.add.sprite(baseX, baseY, this.tex.enemy);
      e.body.allowGravity = false;
      e.setImmovable(true);

      // formation coordinates (base) + state
      e.baseX = baseX;
      e.baseY = baseY;
      e.diving = false;
      e.returning = false;
      e.hp = 1;

      this.enemies.add(e);
    }
  }

  // Difficulty ramp
  this.formation.speed = 40 + wave * 10;
  this.enemyFireRateMs = Math.max(320, 850 - wave * 55);
  this.diveIntervalMs = Math.max(900, 2200 - wave * 120);

  // reward bombs periodically
  if (wave % 3 === 0) this.bombs += 1;
};

MainScene.prototype.tryShootPlayer = function (timeNow) {
  if (timeNow - this.lastPlayerShotAt < this.playerFireCooldownMs) return;

  // determine shot spread
  const level = this.shotLevel;
  const speeds = -560;
  const patterns = [];

  if (level === 1) patterns.push({ vx: 0, vy: speeds });
  if (level === 2) patterns.push({ vx: -90, vy: speeds }, { vx: 90, vy: speeds });
  if (level >= 3) patterns.push({ vx: -140, vy: speeds }, { vx: 0, vy: speeds }, { vx: 140, vy: speeds });

  for (const p of patterns) {
    const b = this.playerBullets.get();
    if (!b) break;

    b.enableBody(true, this.player.x, this.player.y - 18, true, true);
    b.setTexture(this.tex.pBullet);
    b.setVelocity(p.vx, p.vy);
    b.setActive(true);
    b.setVisible(true);
    b.body.allowGravity = false;
  }

  this.playSfx("s_shoot", 880);
  this.lastPlayerShotAt = timeNow;
};

MainScene.prototype.enemyShoot = function (timeNow) {
  if (timeNow - this.lastEnemyShotAt < this.enemyFireRateMs) return;
  if (this.enemies.countActive(true) === 0) return;

  // Prefer enemies closer to bottom (more threat)
  const alive = this.enemies.getChildren().filter(e => e.active);
  alive.sort((a, b) => b.y - a.y);
  const pick = Phaser.Utils.Array.GetRandom(alive.slice(0, Math.min(8, alive.length)));

  const shooter = pick;
  if (!shooter) return;

  const b = this.enemyBullets.get();
  if (!b) return;

  b.enableBody(true, shooter.x, shooter.y + 16, true, true);
  b.setTexture(this.tex.eBullet);

  // aim loosely toward player
  const dx = this.player.x - shooter.x;
  const vx = Phaser.Math.Clamp(dx * 0.8, -120, 120);
  const vy = 300 + this.wave * 12;

  b.setVelocity(vx, vy);
  b.setActive(true);
  b.setVisible(true);
  b.body.allowGravity = false;

  this.lastEnemyShotAt = timeNow;
};

MainScene.prototype.tryDiveAttack = function (timeNow) {
  if (timeNow - this.lastDiveAt < this.diveIntervalMs) return;
  if (this.enemies.countActive(true) === 0) return;

  const candidates = this.enemies.getChildren().filter(e => e.active && !e.diving && !e.returning);
  if (candidates.length === 0) return;

  // Prefer bottom-row-ish enemies
  candidates.sort((a, b) => b.baseY - a.baseY);
  const pickPool = candidates.slice(0, Math.min(6, candidates.length));
  const diver = Phaser.Utils.Array.GetRandom(pickPool);
  if (!diver) return;

  diver.diving = true;

  const startX = diver.x;
  const startY = diver.y;
  const targetY = Phaser.Math.Clamp(this.player.y - 40, 220, H - 220);
  const targetX = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-80, 80), 40, W - 40);

  // Dive down (sine wiggle)
  this.tweens.add({
    targets: diver,
    duration: 850,
    ease: "Sine.easeInOut",
    props: {
      x: { value: targetX, ease: "Sine.easeInOut" },
      y: { value: targetY, ease: "Sine.easeInOut" }
    },
    onUpdate: (tween, target) => {
      // wiggle (additive visual effect)
      target.x += Math.sin((tween.progress * Math.PI * 4)) * 1.2;
    },
    onComplete: () => {
      // shoot once during dive
      if (diver.active) {
        const b = this.enemyBullets.get();
        if (b) {
          b.enableBody(true, diver.x, diver.y + 16, true, true);
          b.setTexture(this.tex.eBullet);
          const dx = this.player.x - diver.x;
          b.setVelocity(Phaser.Math.Clamp(dx * 1.1, -200, 200), 360 + this.wave * 10);
          b.setActive(true);
          b.setVisible(true);
          b.body.allowGravity = false;
        }
      }

      // Return to formation base position (with current formation offset)
      diver.diving = false;
      diver.returning = true;

      this.tweens.add({
        targets: diver,
        duration: 850,
        ease: "Sine.easeInOut",
        x: diver.baseX + this.formation.offsetX,
        y: diver.baseY,
        onComplete: () => {
          diver.returning = false;
        }
      });
    }
  });

  this.lastDiveAt = timeNow;
};

MainScene.prototype.dropPowerup = function (x, y) {
  // chance to drop
  const chance = 0.13; // 13%
  if (Math.random() > chance) return;

  const types = ["SHOT", "SHIELD", "BOMB"];
  const type = Phaser.Utils.Array.GetRandom(types);

  const p = this.physics.add.sprite(x, y, this.tex.powerup);
  p.body.allowGravity = false;
  p.setVelocity(0, 90);
  p.type = type;

  // tiny label (optional)
  p.label = this.add.text(x, y - 18, type, {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "10px",
    color: "#e5e7eb"
  }).setOrigin(0.5);

  this.powerups.add(p);
};

MainScene.prototype.onPlayerPickPowerup = function (player, powerup) {
  const now = this.time.now;

  if (powerup.type === "SHOT") {
    this.shotLevel = Math.min(3, this.shotLevel + 1);
    this.shotUntil = now + 12000; // 12s
    this.playSfx("s_power", 660);
  } else if (powerup.type === "SHIELD") {
    this.shieldUntil = now + 10000; // 10s
    this.playSfx("s_power", 520);
  } else if (powerup.type === "BOMB") {
    this.bombs = Math.min(9, this.bombs + 1);
    this.playSfx("s_power", 420);
  }

  if (powerup.label) powerup.label.destroy();
  powerup.destroy();
};

MainScene.prototype.useBomb = function () {
  if (this.gameOver) return;
  if (this.bombs <= 0) return;

  this.bombs -= 1;

  // destroy all active enemies that are not already disabled
  const enemies = this.enemies.getChildren().filter(e => e.active);
  for (const e of enemies) {
    this.pop(e.x, e.y, 0xfde68a);
    e.disableBody(true, true);
    this.score += 6; // smaller than normal kill score
  }

  // clear enemy bullets
  this.enemyBullets.getChildren().forEach(b => {
    if (b.active) b.disableBody(true, true);
  });

  this.playSfx("s_boom", 180);
};

MainScene.prototype.onPlayerBulletHitEnemy = function (bullet, enemy) {
  bullet.disableBody(true, true);

  enemy.hp -= 1;
  this.flash(enemy);

  if (enemy.hp <= 0) {
    this.pop(enemy.x, enemy.y, 0xfca5a5);
    // maybe drop a powerup
    this.dropPowerup(enemy.x, enemy.y);

    enemy.disableBody(true, true);
    this.score += 10;
    this.playSfx("s_hit", 260);
  }

  // Wave clear?
  if (this.enemies.countActive(true) === 0) {
    this.wave += 1;
    this.pop(W / 2, 160, 0xfde68a);
    this.spawnWave(this.wave);
  }
};

MainScene.prototype.onEnemyBulletHitPlayer = function (player, bullet) {
  bullet.disableBody(true, true);

  // shield absorbs
  if (this.time.now < this.shieldUntil) {
    this.playBeep(1200, 40, "sine", 0.03);
    return;
  }
  this.damagePlayer(false);
};

MainScene.prototype.onEnemyTouchPlayer = function () {
  // If any enemy touches player -> heavy damage (unless shield)
  if (this.time.now < this.shieldUntil) return;
  this.damagePlayer(true);
};

MainScene.prototype.damagePlayer = function (heavy = false) {
  if (this.gameOver) return;

  this.pop(this.player.x, this.player.y, 0x7dd3fc);
  this.lives -= heavy ? 2 : 1;
  this.playSfx("s_hit", 220);

  // brief invulnerability blink
  this.player.setTint(0xffffff);
  this.tweens.add({
    targets: this.player,
    alpha: 0.2,
    duration: 80,
    yoyo: true,
    repeat: 8,
    onComplete: () => {
      this.player.setAlpha(1);
      this.player.clearTint();
    }
  });

  if (this.lives <= 0) {
    this.endGame();
  }
};

MainScene.prototype.endGame = function () {
  this.gameOver = true;
  this.player.setVelocity(0, 0);
  this.bigText.setText("GAME OVER\nPress R to Restart");

  // stop enemies moving/shooting
  this.enemies.getChildren().forEach(e => {
    if (e.active) e.body.moves = false;
  });

  // stop fallback bgm
  this.stopBgmFallback();
};

MainScene.prototype.flash = function (sprite) {
  sprite.setTint(0xffffff);
  this.time.delayedCall(60, () => sprite.clearTint());
};

MainScene.prototype.pop = function (x, y, color) {
  // If we have explosion sprite, do a quick sprite burst
  if (this.tex.explosion === "explosionSprite") {
    const ex = this.add.image(x, y, this.tex.explosion).setScale(0.6).setAlpha(0.95);
    this.tweens.add({
      targets: ex,
      scale: 1.2,
      alpha: 0,
      duration: 280,
      onComplete: () => ex.destroy()
    });
    return;
  }

  // Otherwise simple burst graphics
  const p = this.add.graphics();
  p.fillStyle(color, 1);

  for (let i = 0; i < 10; i++) {
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const rad = Phaser.Math.FloatBetween(6, 22);
    const dx = Math.cos(ang) * rad;
    const dy = Math.sin(ang) * rad;
    p.fillCircle(x + dx, y + dy, Phaser.Math.Between(1, 3));
  }

  this.tweens.add({
    targets: p,
    alpha: 0,
    duration: 260,
    onComplete: () => p.destroy()
  });
};

MainScene.prototype.update = function (time, delta) {
  // background stars
  this.stars.getChildren().forEach(s => {
    s.y += (s.speed * delta) / 1000;
    if (s.y > H + 4) {
      s.y = -4;
      s.x = Phaser.Math.Between(0, W);
    }
  });

  // powerup labels follow
  this.powerups.getChildren().forEach(p => {
    if (!p.active) return;
    if (p.label) {
      p.label.x = p.x;
      p.label.y = p.y - 18;
    }
    // clean up offscreen
    if (p.y > H + 40) {
      if (p.label) p.label.destroy();
      p.destroy();
    }
  });

  // Expire timed powerups
  if (time > this.shotUntil && this.shotLevel > 1) {
    this.shotLevel = 1;
  }
  // shield ring render
  this.shieldRing.clear();
  if (time < this.shieldUntil) {
    this.shieldRing.lineStyle(2, 0x93c5fd, 0.9);
    this.shieldRing.strokeCircle(this.player.x, this.player.y, 26);
    this.shieldRing.lineStyle(1, 0xffffff, 0.5);
    this.shieldRing.strokeCircle(this.player.x, this.player.y, 30);
  }

  // UI
  this.uiText.setText(
    `Score: ${this.score}   Lives: ${this.lives}   Wave: ${this.wave}\n` +
    `Shot: x${this.shotLevel}   Shield: ${time < this.shieldUntil ? "ON" : "OFF"}   Bomb: ${this.bombs}`
  );

  if (this.isMobile) {
    this.bombTxt.setText(`BOMB (${this.bombs})`);
  }

  if (this.gameOver) return;

  // Desktop movement (touch drag overrides by directly setting x)
  if (!this.isDragging) {
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    if (left) this.player.setAccelerationX(-1400);
    else if (right) this.player.setAccelerationX(1400);
    else this.player.setAccelerationX(0);
  }

  // Shooting
  const shootDesktop = this.cursors.space.isDown || this.keys.SPACE.isDown;
  const autoFireMobile = this.isMobile; // always auto-fire on mobile
  if (shootDesktop || autoFireMobile) {
    this.tryShootPlayer(time);
  }

  // Bomb
  if (this.keys.B.isDown) {
    this.useBomb();
  }

  // Enemy formation movement (only non-diving/returning)
  const enemies = this.enemies.getChildren().filter(e => e.active);
  if (enemies.length > 0) {
    // check bounds based on formation-attached enemies
    const attached = enemies.filter(e => !e.diving && !e.returning);
    if (attached.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const e of attached) {
        const x = e.baseX + this.formation.offsetX;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }

      const hitLeft = minX <= this.formation.leftBound;
      const hitRight = maxX >= this.formation.rightBound;

      if (hitLeft || hitRight) {
        this.formation.dir *= -1;

        // drop all formation-attached enemies
        for (const e of attached) e.baseY += this.formation.drop;

        // if too low -> game over
        const lowest = Math.max(...attached.map(e => e.baseY));
        if (lowest > H - 160) this.endGame();
      }

      this.formation.offsetX += (this.formation.speed * this.formation.dir * delta) / 1000;

      // apply positions to attached enemies
      for (const e of attached) {
        e.x = e.baseX + this.formation.offsetX;
        e.y = e.baseY;
      }
    } else {
      // If all are diving/returning, do nothing special.
    }
  }

  // Enemy shooting + dive attacks
  this.enemyShoot(time);
  this.tryDiveAttack(time);

  // recycle bullets offscreen
  this.playerBullets.getChildren().forEach(b => {
    if (b.active && b.y < -30) b.disableBody(true, true);
  });
  this.enemyBullets.getChildren().forEach(b => {
    if (b.active && b.y > H + 30) b.disableBody(true, true);
  });
};
