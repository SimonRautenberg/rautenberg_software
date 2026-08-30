/**
 * Sanfte, animierte Wellen für die Übergangsbänder im Header (.head) und
 * Footer (.foot). Ersetzt das statische wave.svg durch eine langsame
 * Wellenbewegung in dem Blau, das bereits auf der Seite verwendet wird.
 * Der Mittelteil (main) wird nicht angefasst und bleibt vollkommen statisch.
 */
(function () {
    "use strict";

    var WAVE_COLOR = "#0066FF";

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function initWave(canvas) {
        var container = canvas.parentElement;
        var direction = canvas.dataset.wave === "up" ? "up" : "down";
        var ctx = canvas.getContext("2d");
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var width = 0, height = 0;
        var phase = 0;
        var lastTime = performance.now();

        function resize() {
            width = container.clientWidth;
            height = container.clientHeight || 100;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function waveY(x, t) {
            var baseline = direction === "down" ? height * 0.55 : height * 0.45;
            var a1 = height * 0.12;
            var a2 = height * 0.06;
            var w = a1 * Math.sin(x * 0.008 + t * 0.00042) +
                    a2 * Math.sin(x * 0.017 - t * 0.00063 + 1.3);
            return baseline + w;
        }

        function buildWavePath(t) {
            ctx.beginPath();
            if (direction === "down") {
                ctx.moveTo(0, 0);
                for (var x = 0; x <= width; x += 8) {
                    ctx.lineTo(x, waveY(x, t));
                }
                ctx.lineTo(width, 0);
                ctx.closePath();
            } else {
                ctx.moveTo(0, height);
                for (var x2 = 0; x2 <= width; x2 += 8) {
                    ctx.lineTo(x2, waveY(x2, t));
                }
                ctx.lineTo(width, height);
                ctx.closePath();
            }
        }

        function drawWave(t) {
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            buildWavePath(t);
            ctx.clip();
            ctx.fillStyle = WAVE_COLOR;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        function frame(now) {
            var dt = now - lastTime;
            lastTime = now;
            phase += dt;

            drawWave(phase);

            if (!reduceMotion) {
                requestAnimationFrame(frame);
            }
        }

        var resizeTimer;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                resize();
                if (reduceMotion) {
                    drawWave(phase);
                }
            }, 150);
        });

        resize();

        if (reduceMotion) {
            drawWave(0);
        } else {
            requestAnimationFrame(function (t) {
                lastTime = t;
                requestAnimationFrame(frame);
            });
        }
    }

    function start() {
        var canvases = document.querySelectorAll(".wave-canvas");
        canvases.forEach(function (canvas) {
            initWave(canvas);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
