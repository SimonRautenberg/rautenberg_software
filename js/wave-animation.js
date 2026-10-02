/**
 * Sanfte, animierte Wellen in dem Blau der Seite.
 *  - data-wave="down": Übergangsband unter dem Header (.head)
 *  - data-wave="up":   Übergangsband über dem Footer (.foot)
 *  - data-wave="card": helle Doppelwelle am unteren Rand der blauen Karten
 * Es werden nur Wellen animiert, die gerade im Viewport sind.
 */
(function () {
    "use strict";

    var WAVE_COLOR = "#0066FF";
    var CARD_LAYERS = [
        { color: "rgba(255, 255, 255, 0.16)", baseline: 0.42, a1: 0.16, a2: 0.08, k1: 0.011, k2: 0.023, s1: 0.00050, s2: -0.00071, off: 0 },
        { color: "rgba(255, 255, 255, 0.28)", baseline: 0.62, a1: 0.12, a2: 0.06, k1: 0.014, k2: 0.019, s1: -0.00038, s2: 0.00057, off: 2.1 }
    ];

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

        function drawBand(t) {
            ctx.beginPath();
            var edge = mode === "down" ? 0 : height;
            ctx.moveTo(0, edge);
            for (var x = 0; x <= width + 8; x += 8) {
                ctx.lineTo(x, waveY(x, t));
            }
            ctx.lineTo(width, edge);
            ctx.closePath();
            ctx.fillStyle = WAVE_COLOR;
            ctx.fill();
        }

        function drawCard(t) {
            CARD_LAYERS.forEach(function (l) {
                ctx.beginPath();
                ctx.moveTo(0, height);
                for (var x = 0; x <= width + 6; x += 6) {
                    var y = height * l.baseline +
                        height * l.a1 * Math.sin(x * l.k1 + t * l.s1 + l.off) +
                        height * l.a2 * Math.sin(x * l.k2 + t * l.s2 + l.off * 1.7);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(width, height);
                ctx.closePath();
                ctx.fillStyle = l.color;
                ctx.fill();
            });
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
