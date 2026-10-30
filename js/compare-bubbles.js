/**
 * Schwebende Kreise im Abschnitt "Webseite oder Web-Anwendung?" (index.html).
 * Die Kreise bewegen sich in einem gemeinsamen Feld über beide Karten (.compare-grid)
 * und prallen an dessen Rändern ab. Jede Karte hat eine eigene Canvas hinter dem Text
 * und zeichnet nur den Teil der Kreise, der in ihr liegt:
 *  - helle Karte (.compare-card):        Kreise in --blue
 *  - blaue Karte (.compare-card--app):  Kreise in --ice
 * So "springen" die Kreise über die Lücke zwischen den Karten und wechseln dabei die Farbe.
 * Desktop: Karten nebeneinander, mobil untereinander; beides ergibt sich aus dem Layout.
 * Ein Klick/Tipp in eine Karte erzeugt dort einen Kreis, der in Richtung der jeweils
 * anderen Karte "geschossen" wird, abbremst und dann mit den anderen weiterschwebt.
 * Geschossene Kreise sind auf MAX_SHOTS begrenzt; der älteste verschwindet zuerst.
 * Animiert wird nur, solange der Abschnitt im Viewport ist.
 */
(function () {
    "use strict";

    var grid = document.querySelector(".compare-grid");
    if (!grid) {
        return;
    }

    var COUNT = 7;
    var MIN_RADIUS = 10;
    var MAX_RADIUS = 34;
    var MIN_SPEED = 0.03;  // px pro ms
    var MAX_SPEED = 0.08;
    var ALPHA = 0.22;      // dezent, damit der Text lesbar bleibt
    var SHOT_SPEED = 1.2;  // Startgeschwindigkeit geschossener Kreise (px pro ms)
    var SHOT_DRAG = 0.002; // Abbremsen pro ms, bis wieder MAX_SPEED erreicht ist
    var SHOT_GROW = 200;   // ms, in denen ein neuer Kreis auf volle Größe wächst
    var MAX_SHOTS = 8;

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var root = document.documentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var fieldWidth = 0, fieldHeight = 0;
    var circles = [];
    var layers = [];

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    // Farben kommen aus den CSS-Variablen, damit die Farbschemata greifen.
    function readColors() {
        var style = getComputedStyle(root);
        layers.forEach(function (layer) {
            var name = layer.card.classList.contains("compare-card--app") ? "--ice" : "--blue";
            layer.color = style.getPropertyValue(name).trim() || layer.color;
        });
    }

    function createLayer(card) {
        var canvas = document.createElement("canvas");
        canvas.className = "compare-canvas";
        canvas.setAttribute("aria-hidden", "true");
        card.insertBefore(canvas, card.firstChild);
        return {
            card: card,
            canvas: canvas,
            ctx: canvas.getContext("2d"),
            color: "#0066FF",
            left: 0,
            top: 0
        };
    }

    // Kartenpositionen relativ zum Feld (.compare-grid) neu bestimmen.
    // Die Canvas füllt den Innenbereich der Karte (innerhalb des Rahmens); Größe und
    // Versatz müssen deshalb ohne Rahmen gerechnet werden, sonst wird die Canvas
    // vom Browser skaliert und an den Kanten entstehen dunkle Säume.
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        var gridRect = grid.getBoundingClientRect();
        fieldWidth = gridRect.width;
        fieldHeight = gridRect.height;
        layers.forEach(function (layer) {
            var card = layer.card;
            var rect = card.getBoundingClientRect();
            layer.left = rect.left - gridRect.left + card.clientLeft;
            layer.top = rect.top - gridRect.top + card.clientTop;
            layer.width = card.clientWidth;
            layer.height = card.clientHeight;
            layer.canvas.width = Math.round(layer.width * dpr);
            layer.canvas.height = Math.round(layer.height * dpr);
            layer.ctx.setTransform(
                layer.canvas.width / layer.width, 0,
                0, layer.canvas.height / layer.height,
                0, 0
            );
        });
        circles.forEach(function (c) {
            c.x = Math.min(Math.max(c.x, c.r), Math.max(fieldWidth - c.r, c.r));
            c.y = Math.min(Math.max(c.y, c.r), Math.max(fieldHeight - c.r, c.r));
        });
    }

    function createCircles() {
        for (var i = 0; i < COUNT; i++) {
            var r = random(MIN_RADIUS, MAX_RADIUS);
            var angle = random(0, Math.PI * 2);
            var speed = random(MIN_SPEED, MAX_SPEED);
            circles.push({
                r: r,
                x: random(r, Math.max(fieldWidth - r, r)),
                y: random(r, Math.max(fieldHeight - r, r)),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
    }

    // Neuer Kreis an der Klickposition, Ziel ist ein zufälliger Punkt in der anderen Karte.
    function shoot(event) {
        // Kein Schuss, wenn gerade Text markiert wurde.
        var selection = window.getSelection && window.getSelection();
        if (selection && !selection.isCollapsed) {
            return;
        }
        var source = event.currentTarget;
        var target = layers.filter(function (layer) {
            return layer.card !== source;
        })[0];
        if (!target) {
            return;
        }
        var gridRect = grid.getBoundingClientRect();
        var x = event.clientX - gridRect.left;
        var y = event.clientY - gridRect.top;
        var tx = target.left + random(0.2, 0.8) * target.width;
        var ty = target.top + random(0.2, 0.8) * target.height;
        var distance = Math.max(Math.hypot(tx - x, ty - y), 1);

        circles.push({
            r: 0,
            size: random(14, 26),
            age: 0,
            shot: true,
            x: x,
            y: y,
            vx: (tx - x) / distance * SHOT_SPEED,
            vy: (ty - y) / distance * SHOT_SPEED
        });

        var shots = circles.filter(function (c) { return c.shot; });
        if (shots.length > MAX_SHOTS) {
            circles.splice(circles.indexOf(shots[0]), 1);
        }
        start();
    }

    function move(dt) {
        circles.forEach(function (c) {
            if (c.shot) {
                // Wachsen lassen und bis auf normales Tempo abbremsen.
                c.age += dt;
                c.r = c.size * Math.min(c.age / SHOT_GROW, 1);
                var speed = Math.hypot(c.vx, c.vy);
                if (speed > MAX_SPEED) {
                    var factor = Math.max(Math.exp(-SHOT_DRAG * dt), MAX_SPEED / speed);
                    c.vx *= factor;
                    c.vy *= factor;
                }
            }
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            if (c.x < c.r) {
                c.x = c.r;
                c.vx = Math.abs(c.vx);
            } else if (c.x > fieldWidth - c.r) {
                c.x = fieldWidth - c.r;
                c.vx = -Math.abs(c.vx);
            }
            if (c.y < c.r) {
                c.y = c.r;
                c.vy = Math.abs(c.vy);
            } else if (c.y > fieldHeight - c.r) {
                c.y = fieldHeight - c.r;
                c.vy = -Math.abs(c.vy);
            }
        });
    }

    function draw() {
        layers.forEach(function (layer) {
            var ctx = layer.ctx;
            ctx.clearRect(0, 0, layer.width, layer.height);
            ctx.globalAlpha = ALPHA;
            ctx.fillStyle = layer.color;
            circles.forEach(function (c) {
                var x = c.x - layer.left;
                var y = c.y - layer.top;
                if (x + c.r < 0 || y + c.r < 0 || x - c.r > layer.width || y - c.r > layer.height) {
                    return;
                }
                ctx.beginPath();
                ctx.arc(x, y, c.r, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }

    var running = false;
    var last = null;

    function frame(now) {
        if (!running) {
            return;
        }
        if (last !== null) {
            // Nach Tab-Wechseln keine großen Sprünge machen.
            move(Math.min(now - last, 50));
        }
        last = now;
        draw();
        requestAnimationFrame(frame);
    }

    function start() {
        if (!running) {
            running = true;
            last = null;
            requestAnimationFrame(frame);
        }
    }

    function stop() {
        running = false;
    }

    function init() {
        var cards = grid.querySelectorAll(".compare-card");
        if (!cards.length) {
            return;
        }
        Array.prototype.forEach.call(cards, function (card) {
            layers.push(createLayer(card));
        });

        readColors();
        resize();
        createCircles();
        draw();

        // Nach dem Laden der Schriften können sich die Kartenhöhen noch ändern.
        window.addEventListener("load", function () {
            resize();
            draw();
        });

        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                resize();
                draw();
            }, 150);
        });

        document.addEventListener("themechange", function () {
            readColors();
            draw();
        });

        if (reduceMotion) {
            return;
        }

        layers.forEach(function (layer) {
            layer.card.classList.add("is-shooter");
            layer.card.addEventListener("click", shoot);
        });

        // Hinweis nur zeigen, wenn der Klick-Effekt auch aktiv ist.
        var hint = document.querySelector(".compare-hint");
        if (hint) {
            hint.hidden = false;
        }

        if ("IntersectionObserver" in window) {
            var observer = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) {
                    start();
                } else {
                    stop();
                }
            });
            observer.observe(grid);
        } else {
            start();
        }
    }

    init();
})();
