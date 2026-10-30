/**
 * Minispiel auf der Startseite: Mit einem Katapult (links) wird eine Kugel auf eine
 * Pyramide aus Bauklötzen (rechts) geschossen. Gezeichnet wird alles im SVG .game-svg,
 * die Physik übernimmt Matter.js (js/vendor/matter.min.js, wird erst geladen, wenn das
 * Spiel in die Nähe des Viewports kommt).
 * Bedienung: In der Greifzone (.game-grab) klicken/tippen und ziehen spannt das Katapult,
 * Loslassen schießt. Pro Runde gibt es SHOTS Kugeln; die Reserve liegt neben dem Katapult.
 * Nach jedem Schuss wird gewartet, bis alles zur Ruhe gekommen ist (oder MAX_ROUND um ist):
 * Ist die Pyramide eingestürzt oder sind alle Kugeln verschossen, wird das Ergebnis
 * angezeigt und das Spiel nach RESET_DELAY in den Ursprungszustand versetzt; sonst wird
 * die nächste Kugel geladen. Verschossene Kugeln bleiben im Spielfeld liegen.
 * Die Spielwelt ist auf schmalen Bildschirmen schmaler (WORLD_NARROW), damit Klötze
 * und Kugel auf dem Handy nicht winzig werden. Mittig zwischen Katapult und Pyramide
 * steht immer eine Mauer, über die im Bogen geschossen werden muss.
 */
(function () {
    "use strict";

    var section = document.querySelector(".game");
    if (!section) {
        return;
    }

    var MATTER_SRC = "js/vendor/matter.min.js";
    var SVG_NS = "http://www.w3.org/2000/svg";

    var WORLD_WIDE = 800;
    var WORLD_NARROW = 480;
    var NARROW_BELOW = 600;      // px Containerbreite
    var HEIGHT = 300;
    var GROUND = 270;
    var CATAPULT_X = 110;
    var BLOCK = 30;
    var ROWS = 5;                // Grundreihe mit 5 Klötzen → 15 Klötze
    var PYRAMID_MARGIN = 50;     // Abstand der Pyramide zum rechten Rand
    var BLOCK_DENSITY = 0.0002;  // leicht, damit die Klötze weit fliegen
    var BALL_DENSITY = 0.01;     // schwer, damit die Kugel ordentlich Wucht hat
    var BLOCK_BOUNCE = 0.6;      // Sprungkraft (0 = gar nicht, 1 = verlustfrei)
    var BALL_RADIUS = 9;
    var WALL_WIDTH = 14;
    var WALL_HEIGHT = 120;       // höher als das Katapult: flache Schüsse prallen ab
    var WALL_BOUNCE = 0.5;
    var MAX_PULL = 80;
    var POWER = 0.2;             // Abschussgeschwindigkeit pro Einheit Auszug
    var MIN_PULL = 10;           // kürzer gezogen = kein Schuss
    var SHOTS = 3;               // Kugeln pro Runde
    var AMMO_GAP = 22;           // Abstand der Reservekugeln neben dem Katapult

    var STEP = 1000 / 60;
    var STILL_SPEED = 0.15;
    var STILL_TIME = 700;
    var MIN_ROUND = 1000;
    var MAX_ROUND = 8000;
    var RESET_DELAY = 2000;

    var TEXT_READY = "Ziehen Sie die Kugel nach hinten und lassen Sie los. Sie haben " + SHOTS + " Kugeln.";
    var TEXT_COLLAPSED = "Eingestürzt! Geschafft mit Kugel {n} von " + SHOTS + ".";
    var TEXT_HIT = "Getroffen, aber die Spitze steht noch.";
    var TEXT_MISS = "Daneben.";
    var TEXT_LEFT_ONE = "Noch 1 Kugel.";
    var TEXT_LEFT_MANY = "Noch {n} Kugeln.";
    var TEXT_OUT = "Alle Kugeln verschossen, die Spitze steht noch. Gleich geht es von vorn los.";

    var svg = section.querySelector(".game-svg");
    var ground = section.querySelector(".game-ground");
    var wallEl = section.querySelector(".game-wall");
    var catapult = section.querySelector(".game-catapult");
    var bandBack = section.querySelector('[data-band="back"]');
    var bandFront = section.querySelector('[data-band="front"]');
    var ballEl = section.querySelector(".game-ball");
    var ammoEl = section.querySelector(".game-ammo");
    var shotsEl = section.querySelector(".game-shots");
    var blocksEl = section.querySelector(".game-blocks");
    var grab = section.querySelector(".game-grab");
    var statusEl = section.querySelector(".game-status");

    var M = null;                // Matter, sobald geladen
    var engine = null;
    var width = WORLD_WIDE;
    var tipBack, tipFront, rest;
    var wallX = 0;               // Mitte der Mauer
    var blocks = [];             // { body, el, x0, y0 }
    var balls = [];              // verschossene Kugeln: { body, el }
    var ballPos = null;          // Position der Kugel im Katapult
    var shotsLeft = SHOTS;
    var movedAtShot = 0;         // verrutschte Klötze beim Abschuss (für "Getroffen"/"Daneben")
    var state = "loading";       // loading | ready | aiming | flying | done
    var roundTime = 0, stillTime = 0;
    var running = false, visible = false, last = null, accumulator = 0;
    var resetTimer = null;

    function setStatus(text) {
        statusEl.textContent = text;
    }

    // Weltbreite passend zum Container wählen und alle festen Teile ausrichten.
    function layout() {
        width = section.clientWidth < NARROW_BELOW ? WORLD_NARROW : WORLD_WIDE;
        svg.setAttribute("viewBox", "0 0 " + width + " " + HEIGHT);
        ground.setAttribute("x2", width);
        catapult.setAttribute("transform", "translate(" + CATAPULT_X + " " + GROUND + ")");
        tipBack = { x: CATAPULT_X - 12, y: GROUND - 80 };
        tipFront = { x: CATAPULT_X + 12, y: GROUND - 80 };
        rest = { x: CATAPULT_X, y: GROUND - 78 };

        // Mauer immer mittig zwischen Katapult und Pyramide.
        var pyramidLeft = width - PYRAMID_MARGIN - ROWS * BLOCK;
        wallX = (CATAPULT_X + pyramidLeft) / 2;
        wallEl.setAttribute("x", wallX - WALL_WIDTH / 2);
        wallEl.setAttribute("y", GROUND - WALL_HEIGHT);
        wallEl.setAttribute("width", WALL_WIDTH);
        wallEl.setAttribute("height", WALL_HEIGHT);
    }

    // Startpositionen der Klötze: Reihe r hat ROWS - r Klötze, mittig versetzt.
    function pyramidSlots() {
        var slots = [];
        var left = width - PYRAMID_MARGIN - ROWS * BLOCK;
        for (var r = 0; r < ROWS; r++) {
            for (var i = 0; i < ROWS - r; i++) {
                slots.push({
                    x: left + r * BLOCK / 2 + i * BLOCK + BLOCK / 2,
                    y: GROUND - BLOCK / 2 - r * BLOCK
                });
            }
        }
        return slots;
    }

    function drawBlock(el, x, y, angle) {
        el.setAttribute("transform",
            "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") rotate(" + (angle * 180 / Math.PI).toFixed(2) + ")");
    }

    function createCircle(parent, x, y) {
        var el = document.createElementNS(SVG_NS, "circle");
        el.setAttribute("class", "game-ball");
        el.setAttribute("r", BALL_RADIUS);
        el.setAttribute("cx", x);
        el.setAttribute("cy", y);
        parent.appendChild(el);
        return el;
    }

    // Reservekugeln neben dem Katapult (ohne die Kugel, die gerade im Katapult liegt).
    function drawAmmo() {
        ammoEl.textContent = "";
        var reserve = state === "ready" || state === "aiming" ? shotsLeft - 1 : shotsLeft;
        for (var i = 0; i < reserve; i++) {
            createCircle(ammoEl, CATAPULT_X - 35 - i * AMMO_GAP, GROUND - BALL_RADIUS - 1.5);
        }
    }

    // Kugel im Katapult und Gummibänder; ohne geladene Kugel hängen die Bänder entspannt.
    function drawSling(pos) {
        var loaded = state === "ready" || state === "aiming" || state === "loading";
        ballEl.style.visibility = loaded ? "" : "hidden";
        ballEl.setAttribute("cx", pos.x.toFixed(2));
        ballEl.setAttribute("cy", pos.y.toFixed(2));
        var band = state === "aiming" ? pos : rest;
        bandBack.setAttribute("x1", tipBack.x);
        bandBack.setAttribute("y1", tipBack.y);
        bandBack.setAttribute("x2", band.x.toFixed(2));
        bandBack.setAttribute("y2", band.y.toFixed(2));
        bandFront.setAttribute("x1", tipFront.x);
        bandFront.setAttribute("y1", tipFront.y);
        bandFront.setAttribute("x2", band.x.toFixed(2));
        bandFront.setAttribute("y2", band.y.toFixed(2));
    }

    // Ursprungszustand: Pyramide neu aufbauen, Kugel ins Katapult.
    function reset() {
        clearTimeout(resetTimer);
        layout();
        blocksEl.textContent = "";
        blocks = [];
        if (engine) {
            M.Composite.clear(engine.world, false);
            M.Composite.add(engine.world, M.Bodies.rectangle(width / 2, GROUND + 25, width * 3, 50, {
                isStatic: true,
                friction: 1
            }));
            M.Composite.add(engine.world, M.Bodies.rectangle(
                wallX, GROUND - WALL_HEIGHT / 2, WALL_WIDTH, WALL_HEIGHT,
                { isStatic: true, restitution: WALL_BOUNCE, friction: 0.3 }
            ));
        }
        pyramidSlots().forEach(function (slot) {
            var el = document.createElementNS(SVG_NS, "rect");
            el.setAttribute("class", "game-block");
            el.setAttribute("x", -BLOCK / 2);
            el.setAttribute("y", -BLOCK / 2);
            el.setAttribute("width", BLOCK);
            el.setAttribute("height", BLOCK);
            el.setAttribute("rx", 2);
            blocksEl.appendChild(el);
            drawBlock(el, slot.x, slot.y, 0);
            var body = null;
            if (engine) {
                body = M.Bodies.rectangle(slot.x, slot.y, BLOCK, BLOCK, {
                    friction: 0.9,
                    frictionStatic: 2,
                    restitution: BLOCK_BOUNCE,
                    density: BLOCK_DENSITY
                });
                M.Composite.add(engine.world, body);
            }
            blocks.push({ body: body, el: el, x0: slot.x, y0: slot.y });
        });
        shotsEl.textContent = "";
        balls = [];
        shotsLeft = SHOTS;
        loadBall();
        if (engine) {
            setStatus(TEXT_READY);
        }
    }

    // Nächste Kugel ins Katapult legen.
    function loadBall() {
        ballPos = { x: rest.x, y: rest.y };
        if (engine) {
            state = "ready";
        }
        drawSling(ballPos);
        drawAmmo();
    }

    // Bildschirmkoordinaten in SVG-Weltkoordinaten umrechnen.
    function toWorld(event) {
        var point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse());
    }

    function aimAt(event) {
        var p = toWorld(event);
        var dx = p.x - rest.x;
        var dy = p.y - rest.y;
        var length = Math.hypot(dx, dy);
        if (length > MAX_PULL) {
            dx *= MAX_PULL / length;
            dy *= MAX_PULL / length;
        }
        ballPos = { x: rest.x + dx, y: rest.y + dy };
        drawSling(ballPos);
    }

    function onDown(event) {
        if (state !== "ready") {
            return;
        }
        event.preventDefault();
        grab.setPointerCapture(event.pointerId);
        grab.classList.add("is-dragging");
        state = "aiming";
        aimAt(event);
    }

    function onMove(event) {
        if (state === "aiming") {
            aimAt(event);
        }
    }

    function onUp() {
        if (state !== "aiming") {
            return;
        }
        grab.classList.remove("is-dragging");
        var dx = rest.x - ballPos.x;
        var dy = rest.y - ballPos.y;
        if (Math.hypot(dx, dy) < MIN_PULL) {
            state = "ready";
            ballPos = { x: rest.x, y: rest.y };
            drawSling(ballPos);
            return;
        }
        var ball = M.Bodies.circle(ballPos.x, ballPos.y, BALL_RADIUS, {
            density: BALL_DENSITY,
            restitution: 0.2,
            friction: 0.2
        });
        M.Composite.add(engine.world, ball);
        M.Body.setVelocity(ball, { x: dx * POWER, y: dy * POWER });
        balls.push({ body: ball, el: createCircle(shotsEl, ballPos.x, ballPos.y) });
        shotsLeft--;
        movedAtShot = movedBlocks();
        state = "flying";
        roundTime = 0;
        stillTime = 0;
        setStatus("");
        drawSling(ballPos);
        drawAmmo();
        start();
    }

    function isOut(body) {
        var p = body.position;
        return p.x < -100 || p.x > width + 100 || p.y > HEIGHT + 100;
    }

    // Zählt verrutschte Klötze (gemessen an der Ausgangsstellung der Runde).
    function movedBlocks() {
        var moved = 0;
        blocks.forEach(function (b) {
            var p = b.body.position;
            if (Math.hypot(p.x - b.x0, p.y - b.y0) > BLOCK / 2 || Math.abs(b.body.angle) > 0.4) {
                moved++;
            }
        });
        return moved;
    }

    // Eingestürzt erst, wenn die oberste Box heruntergefallen ist, also mindestens eine
    // halbe Box tiefer liegt als zu Beginn. Verrutschte Klötze allein zählen nicht.
    function collapsed() {
        var top = blocks[blocks.length - 1];
        return top.body.position.y - top.y0 > BLOCK / 2;
    }

    // Nach jedem Schuss: gewonnen, nächste Kugel oder alle Kugeln verschossen.
    function finishShot(movedBefore) {
        var moved = movedBlocks();
        if (collapsed()) {
            state = "done";
            setStatus(TEXT_COLLAPSED.replace("{n}", SHOTS - shotsLeft));
            resetTimer = setTimeout(reset, RESET_DELAY);
            return;
        }
        if (shotsLeft === 0) {
            state = "done";
            setStatus(TEXT_OUT);
            resetTimer = setTimeout(reset, RESET_DELAY);
            return;
        }
        var result = moved > movedBefore ? TEXT_HIT : TEXT_MISS;
        var left = shotsLeft === 1 ? TEXT_LEFT_ONE : TEXT_LEFT_MANY.replace("{n}", shotsLeft);
        setStatus(result + " " + left);
        loadBall();
    }

    function update(dt) {
        // Schlafende Körper ignorieren die Schwerkraft. Solange ein Schuss läuft, werden
        // deshalb alle wachgehalten; sonst bliebe z. B. die Spitze in der Luft hängen,
        // wenn der Turm unter ihr wegbricht, ohne dass sie selbst getroffen wird.
        if (state === "flying") {
            blocks.concat(balls).forEach(function (b) {
                if (b.body.isSleeping) {
                    M.Sleeping.set(b.body, false);
                }
            });
        }
        M.Engine.update(engine, dt);
        if (state !== "flying") {
            return;
        }
        roundTime += dt;
        var maxSpeed = 0;
        blocks.forEach(function (b) {
            maxSpeed = Math.max(maxSpeed, b.body.speed);
        });
        balls.forEach(function (b) {
            if (!isOut(b.body)) {
                maxSpeed = Math.max(maxSpeed, b.body.speed);
            }
        });
        stillTime = maxSpeed < STILL_SPEED ? stillTime + dt : 0;
        if ((roundTime > MIN_ROUND && stillTime > STILL_TIME) || roundTime > MAX_ROUND) {
            finishShot(movedAtShot);
        }
    }

    function render() {
        blocks.forEach(function (b) {
            drawBlock(b.el, b.body.position.x, b.body.position.y, b.body.angle);
        });
        balls.forEach(function (b) {
            b.el.setAttribute("cx", b.body.position.x.toFixed(2));
            b.el.setAttribute("cy", b.body.position.y.toFixed(2));
        });
    }

    function frame(now) {
        if (!running) {
            return;
        }
        if (last !== null) {
            // Feste Schrittweite; nach Tab-Wechseln höchstens wenige Schritte nachholen.
            accumulator += Math.min(now - last, 100);
            while (accumulator >= STEP) {
                update(STEP);
                accumulator -= STEP;
            }
        }
        last = now;
        render();
        requestAnimationFrame(frame);
    }

    function start() {
        if (!running && engine && visible) {
            running = true;
            last = null;
            accumulator = 0;
            requestAnimationFrame(frame);
        }
    }

    function stop() {
        running = false;
    }

    function initPhysics() {
        M = window.Matter;
        // Ruhezustand an, damit die ruhende Pyramide nicht langsam wegkriecht.
        // Während eines Schusses hält update() alle Körper wach (siehe dort).
        engine = M.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
        reset();

        grab.addEventListener("pointerdown", onDown);
        grab.addEventListener("pointermove", onMove);
        grab.addEventListener("pointerup", onUp);
        grab.addEventListener("pointercancel", onUp);

        // Neu aufbauen, wenn sich die Weltbreite durch Größenänderung ändert.
        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                var next = section.clientWidth < NARROW_BELOW ? WORLD_NARROW : WORLD_WIDE;
                if (next !== width && state !== "aiming") {
                    reset();
                }
            }, 150);
        });

        start();
    }

    function loadPhysics() {
        if (window.Matter) {
            initPhysics();
            return;
        }
        var script = document.createElement("script");
        script.src = MATTER_SRC;
        script.onload = initPhysics;
        document.head.appendChild(script);
    }

    // Ohne Physik schon einmal die ruhende Pyramide zeigen.
    reset();

    if ("IntersectionObserver" in window) {
        var loading = false;
        var observer = new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible && !loading) {
                loading = true;
                loadPhysics();
            }
            if (visible) {
                start();
            } else {
                stop();
            }
        }, { rootMargin: "200px 0px" });
        observer.observe(section);
    } else {
        visible = true;
        loadPhysics();
    }
})();
