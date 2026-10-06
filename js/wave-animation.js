/**
 * Sanfte, animierte Wellen in dem Blau der Seite.
 *  - data-wave="down": Übergangsband unter dem Header (.head)
 *  - data-wave="up":   Übergangsband über dem Footer (.foot)
 *  - data-wave="card": helle Doppelwelle am unteren Rand der blauen Karten
 * Es werden nur Wellen animiert, die gerade im Viewport sind.
 */
(function () {
    "use strict";

    // Farben kommen aus den CSS-Variablen (--blue, --on-primary), damit Farbschemata greifen.
    var waveColor = "#0066FF";
    var cardColor = "#FFFFFF";
    var CARD_LAYERS = [
        { alpha: 0.16, baseline: 0.42, a1: 0.16, a2: 0.08, k1: 0.011, k2: 0.023, s1: 0.00050, s2: -0.00071, off: 0 },
        { alpha: 0.28, baseline: 0.62, a1: 0.12, a2: 0.06, k1: 0.014, k2: 0.019, s1: -0.00038, s2: 0.00057, off: 2.1 }
    ];

    // TEMP: Im gelben Schema werden die Wellen zu einem wandernden Zickzack.
    var zigzag = false;
    var ZIGZAG_BAND = { amp: 0.16, period: 64, speed: 0.02 };
    var ZIGZAG_CARD_LAYERS = [
        { amp: 0.14, period: 44, speed: 0.015 },
        { amp: 0.10, period: 60, speed: -0.012 }
    ];

    function readColors() {
        var root = document.documentElement;
        var style = getComputedStyle(root);
        waveColor = style.getPropertyValue("--blue").trim() || waveColor;
        cardColor = style.getPropertyValue("--on-primary").trim() || cardColor;
        zigzag = root.dataset.theme === "yellow";
    }

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var waves = [];

    function createWave(canvas) {
        var container = canvas.parentElement;
        var mode = canvas.dataset.wave;
        if (mode !== "up" && mode !== "card") {
            mode = "down";
        }
        var ctx = canvas.getContext("2d");
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var width = 0, height = 0;
        // Karten bekommen einen zufälligen Versatz, damit sie nicht im Gleichtakt schwingen.
        var seed = mode === "card" ? Math.random() * 20000 : 0;

        function resize() {
            width = container.clientWidth;
            height = container.clientHeight || 100;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function waveY(x, t) {
            var baseline = mode === "down" ? height * 0.55 : height * 0.45;
            var a1 = height * 0.12;
            var a2 = height * 0.06;
            var w = a1 * Math.sin(x * 0.008 + t * 0.00042) +
                    a2 * Math.sin(x * 0.017 - t * 0.00063 + 1.3);
            return baseline + w;
        }

        // Zickzack-Linie: Spitzen abwechselnd über/unter der Grundlinie, um "shift" verschoben.
        function zigzagPath(baseline, amp, period, shift) {
            var half = period / 2;
            var x = ((shift % period) + period) % period - period;
            for (var i = 0; x <= width + half; i++, x += half) {
                ctx.lineTo(x, baseline + (i % 2 ? amp : -amp));
            }
        }

        function drawBand(t) {
            ctx.beginPath();
            var edge = mode === "down" ? 0 : height;
            ctx.moveTo(0, edge);
            if (zigzag) {
                var baseline = mode === "down" ? height * 0.55 : height * 0.45;
                zigzagPath(baseline, height * ZIGZAG_BAND.amp, ZIGZAG_BAND.period, t * ZIGZAG_BAND.speed);
            } else {
                for (var x = 0; x <= width + 8; x += 8) {
                    ctx.lineTo(x, waveY(x, t));
                }
            }
            ctx.lineTo(width, edge);
            ctx.closePath();
            ctx.fillStyle = waveColor;
            ctx.fill();
        }

        function drawCard(t) {
            CARD_LAYERS.forEach(function (l, idx) {
                ctx.beginPath();
                ctx.moveTo(0, height);
                if (zigzag) {
                    var z = ZIGZAG_CARD_LAYERS[idx];
                    zigzagPath(height * l.baseline, height * z.amp, z.period, t * z.speed);
                } else {
                    for (var x = 0; x <= width + 6; x += 6) {
                        var y = height * l.baseline +
                            height * l.a1 * Math.sin(x * l.k1 + t * l.s1 + l.off) +
                            height * l.a2 * Math.sin(x * l.k2 + t * l.s2 + l.off * 1.7);
                        ctx.lineTo(x, y);
                    }
                }
                ctx.lineTo(width, height);
                ctx.closePath();
                ctx.fillStyle = cardColor;
                ctx.globalAlpha = l.alpha;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        return {
            canvas: canvas,
            visible: true,
            resize: resize,
            draw: function (t) {
                ctx.clearRect(0, 0, width, height);
                if (mode === "card") {
                    drawCard(t + seed);
                } else {
                    drawBand(t);
                }
            }
        };
    }

    function start() {
        var phase = 0;
        readColors();

        document.querySelectorAll(".wave-canvas").forEach(function (canvas) {
            var wave = createWave(canvas);
            wave.resize();
            wave.draw(0);
            waves.push(wave);
        });

        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                waves.forEach(function (w) {
                    w.resize();
                    w.draw(phase);
                });
            }, 150);
        });

        document.addEventListener("themechange", function () {
            readColors();
            waves.forEach(function (w) {
                w.draw(phase);
            });
        });

        if (reduceMotion) {
            return;
        }

        if ("IntersectionObserver" in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    waves.forEach(function (w) {
                        if (w.canvas === entry.target) {
                            w.visible = entry.isIntersecting;
                        }
                    });
                });
            }, { rootMargin: "50px" });
            waves.forEach(function (w) {
                observer.observe(w.canvas);
            });
        }

        var lastTime = null;

        function frame(now) {
            if (lastTime !== null) {
                // Große Sprünge (z. B. nach Tab-Wechsel) abfangen
                phase += Math.min(now - lastTime, 100);
            }
            lastTime = now;
            waves.forEach(function (w) {
                if (w.visible) {
                    w.draw(phase);
                }
            });
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
