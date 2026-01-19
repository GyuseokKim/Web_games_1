/* Mini Galaga (Phaser 3)
   - Arrow keys / A,D: move
   - Space: shoot
   - R: restart (when game over)
*/

const W = 420;
const H = 720;

const config = {
  type: Phaser.AUTO, // Canvas/WebGL auto
  width: W,
  height: H,
  parent: "game",
  backgroundColor: "#0b1020",
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scene: [MainScene]
};

new Phaser.Game(config);

function MainScene() {
  Phaser.Scene.call(this, { key: "MainScene" });
}
MainScene.prototype = Object.create(Phaser.Scene.prototype);
MainScene.prototype.constructor = MainScene;

MainScene.prototype.preload = function () {
  // No external assets: we generate simple textures at runtime in create()
};

MainScene.prototype.create = function () {
  this.gameOver = false;

  // --- Create simple textures (player/enemy/bullets) ---
  const g = this.add.graphics();

  // Player (triangle)
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

  // Enemy (diamond)
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

  // Player bullet
  g.clear();
  g.fillStyle(0xfde68a, 1);
  g.fillRect(0, 0, 4, 12);
  g.generateTexture("pBulletTex", 4, 12);

  // Enemy bullet
  g.clear();
  g.fillStyle(0xa7f3d0, 1);
  g.fillRect(0, 0, 4, 10);
  g.generateTexture("eBulletTex", 4, 10);

  // Star texture (for background)
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture("starTex", 2, 2);

  g.destroy();

  // --- Background stars ---
  this.stars = this.add.group();
  for (let i = 0; i < 90; i++) {
    const x = Phaser.Math.Between(0, W);
    const y = Phaser.Math.Between(0, H);
    const s = this.add.image(x, y, "starTex").setAlpha(Phaser.Math.FloatBetween(0.15, 0.9));
    s.speed = Phaser.Math.FloatBetween(30, 140);
    this.stars.add(s);
  }

  // --- Player ---
  this.player = this.physics.add.sprite(W / 2, H - 80, "playerTex");
  this.player.setCollideWorldBounds(true);
  this.player.setDragX(1800);
  this.player.setMaxVelocity(320, 0);

  // --- Input ---
  this.cursors = this.input.keyboard.createCursorKeys();
  this.keys = this.input.keyboard.addKeys({
    A: Phaser.Input.Keyboard.KeyCodes.A,
    D: Phaser.Input.Keyboard.KeyCodes.D,
    SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
    R: Phaser.Input.Keyboard.KeyCodes.R
  });

  // --- Bullets (object pools) ---
  this.playerBullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Image,
    maxSize: 50,
    runChildUpdate: false
  });

  this.enemyBullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Image,
    maxSize: 80,
    runChildUpdate: false
  });

  // --- Enemies & wave settings ---
  this.enemies = this.physics.add.group();
  this.wave = 1;
  this.score = 0;
  this.lives = 3;

  this.enemyDir = 1;         // +1 right, -1 left
  this.enemySpeed = 40;      // base horizontal speed
  this.enemyDrop = 26;       // drop on edge hit
  this.enemyFireRateMs = 850; // enemy shooting interval
  this.lastEnemyShotAt = 0;

  this.spawnWave(this.wave);

  // --- UI ---
  this.uiText = this.add.text(14, 14, "", {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "16px",
    color: "#e5e7eb"
  });

  this.bigText = this.add.text(W / 2, H / 2, "", {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "28px",
    color: "#ffffff",
    align: "center"
  }).setOrigin(0.5);

  // --- Colliders / Overlaps ---
  this.physics.add.overlap(this.playerBullets, this.enemies, this.onPlayerBulletHitEnemy, null, this);
  this.physics.add.overlap(this.enemyBullets, this.player, this.onEnemyBulletHitPlayer, null, this);
  this.physics.add.overlap(this.enemies, this.player, this.onEnemyTouchPlayer, null, this);

  // --- Fire control ---
  this.playerFireCooldownMs = 160;
  this.lastPlayerShotAt = 0;

  // --- Restart handler ---
  this.input.keyboard.on("keydown-R", () => {
    if (this.gameOver) this.scene.restart();
  });
};

MainScene.prototype.spawnWave = function (wave) {
  // Clear existing
  this.enemies.clear(true, true);

  // Formation: rows x cols
  const rows = Phaser.Math.Clamp(3 + wave, 3, 7);
  const cols = Phaser.Math.Clamp(6 + Math.floor(wave / 2), 6, 10);

  const startX = (W - (cols - 1) * 34) / 2;
  const startY = 90;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * 34;
      const y = startY + r * 34;
      const e = this.physics.add.sprite(x, y, "enemyTex");
      e.setImmovable(true);
      e.body.allowGravity = false;
      e.hp = 1;
      this.enemies.add(e);
    }
  }

  // Increase difficulty
  this.enemySpeed = 40 + wave * 10;
  this.enemyFireRateMs = Math.max(320, 850 - wave * 55);
};

MainScene.prototype.tryShootPlayer = function (timeNow) {
  if (timeNow - this.lastPlayerShotAt < this.playerFireCooldownMs) return;

  const b = this.playerBullets.get();
  if (!b) return;

  b.enableBody(true, this.player.x, this.player.y - 18, true, true);
  b.setTexture("pBulletTex");
  b.setVelocity(0, -520);
  b.setActive(true);
  b.setVisible(true);
  b.body.allowGravity = false;

  this.lastPlayerShotAt = timeNow;
};

MainScene.prototype.enemyShoot = function (timeNow) {
  if (timeNow - this.lastEnemyShotAt < this.enemyFireRateMs) return;
  if (this.enemies.countActive(true) === 0) return;

  // Pick a random alive enemy
  const alive = this.enemies.getChildren().filter(e => e.active);
  const shooter = Phaser.Utils.Array.GetRandom(alive);
  if (!shooter) return;

  const b = this.enemyBullets.get();
  if (!b) return;

  b.enableBody(true, shooter.x, shooter.y + 16, true, true);
  b.setTexture("eBulletTex");
  b.setVelocity(0, 320 + this.wave * 10);
  b.setActive(true);
  b.setVisible(true);
  b.body.allowGravity = false;

  this.lastEnemyShotAt = timeNow;
};

MainScene.prototype.onPlayerBulletHitEnemy = function (bullet, enemy) {
  bullet.disableBody(true, true);

  enemy.hp -= 1;
  this.flash(enemy);

  if (enemy.hp <= 0) {
    this.pop(enemy.x, enemy.y, 0xfca5a5);
    enemy.disableBody(true, true);
    this.score += 10;
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
  this.damagePlayer();
};

MainScene.prototype.onEnemyTouchPlayer = function () {
  // If any enemy touches player -> heavy damage
  this.damagePlayer(true);
};

MainScene.prototype.damagePlayer = function (heavy = false) {
  if (this.gameOver) return;

  this.pop(this.player.x, this.player.y, 0x7dd3fc);
  this.lives -= heavy ? 2 : 1;

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
};

MainScene.prototype.flash = function (sprite) {
  sprite.setTint(0xffffff);
  this.time.delayedCall(60, () => sprite.clearTint());
};

MainScene.prototype.pop = function (x, y, color) {
  // Simple particle-ish burst using small circles
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
  // stars
  this.stars.getChildren().forEach(s => {
    s.y += (s.speed * delta) / 1000;
    if (s.y > H + 4) {
      s.y = -4;
      s.x = Phaser.Math.Between(0, W);
    }
  });

  // UI
  this.uiText.setText(`Score: ${this.score}   Lives: ${this.lives}   Wave: ${this.wave}`);

  if (this.gameOver) return;

  // player move
  const left = this.cursors.left.isDown || this.keys.A.isDown;
  const right = this.cursors.right.isDown || this.keys.D.isDown;

  if (left) this.player.setAccelerationX(-1200);
  else if (right) this.player.setAccelerationX(1200);
  else this.player.setAccelerationX(0);

  // shooting
  const shoot = this.cursors.space.isDown || this.keys.SPACE.isDown;
  if (shoot) this.tryShootPlayer(time);

  // enemy formation movement
  const enemies = this.enemies.getChildren().filter(e => e.active);
  if (enemies.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of enemies) {
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x);
    }

    const hitLeft = minX <= 24;
    const hitRight = maxX >= W - 24;

    if (hitLeft || hitRight) {
      this.enemyDir *= -1;
      for (const e of enemies) e.y += this.enemyDrop;

      // If enemies got too low -> game over
      const lowest = Math.max(...enemies.map(e => e.y));
      if (lowest > H - 140) this.endGame();
    }

    const dx = (this.enemySpeed * this.enemyDir * delta) / 1000;
    for (const e of enemies) e.x += dx;
  }

  // enemy shooting
  this.enemyShoot(time);

  // recycle bullets offscreen
  this.playerBullets.getChildren().forEach(b => {
    if (b.active && b.y < -30) b.disableBody(true, true);
  });
  this.enemyBullets.getChildren().forEach(b => {
    if (b.active && b.y > H + 30) b.disableBody(true, true);
  });
};
