/**
 * Farbschema-Ablauf als Teil der Customer Journey: Gelb und Rot lenken den Blick
 * gezielt auf die Kernbotschaften der Startseite (bewusst so gewollt, nicht entfernen).
 * Einmaliger Ablauf der Farbschemata nach dem Laden:
 * Desktop: blau → gelb nach 5 s → rot 15 s später → blau 1 min später (bleibt).
 * Beim Wechsel auf Gelb wird das Warndreieck (.warning-sign) mittig gescrollt (bzw. ganz nach oben,
 * falls es dafür zu weit oben liegt), das Scrollen 3 s gesperrt und danach zur
 * vorherigen Position zurückgescrollt.
 * Mobil (< 900px): blau → gelb, sobald das Bild #coding in der Bildschirmmitte ist;
 * dabei wird das Scrollen 1 s gesperrt. Danach rot nach 15 s und blau nach 1 min.
 * Beim Wechsel auf Rot wird (überall) die rote Karte mittig gescrollt, das Scrollen
 * 3 s gesperrt und danach zur vorherigen Position zurückgescrollt.
 * Jeder Wechsel wird von einer Glitch-Animation begleitet (html.is-glitching, siehe
 * style.css); die Farbe springt genau in deren Mitte. Die Dauer kommt aus der
 * CSS-Variable --glitch-duration.
 * Pro Sitzung (sessionStorage, endet mit dem Tab) wird gemerkt, ob schon gelb bzw.
 * rot gezeigt wurde: Nach Gelb kommt beim nächsten Laden statt Gelb direkt Rot,
 * nach Gelb und Rot bleibt alles blau.
 */
(function () {
    "use strict";

    // Verzögerung des ersten Wechsels (nur Desktop) und Abstände der Folgewechsel.
    var FIRST_DELAY = 5000;
    var FOLLOW_UP = [
        { after: 15000, theme: "red", focus: ".intro-promise" },
        { after: 60000, theme: "blue" }
    ];
    var SCROLL_LOCK = 1000;
    var FOCUS_LOCK = 3000;
    var SCROLL_DURATION = 700;

    var root = document.documentElement;
    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.matchMedia &&
        window.matchMedia("(max-width: 899px)").matches;

    // sessionStorage kann gesperrt sein (z. B. privater Modus); dann läuft alles wie ohne Merker.
    function getFlag(name) {
        try {
            return sessionStorage.getItem(name) === "true";
        } catch (e) {
            return false;
        }
    }

    function setFlag(name) {
        try {
            sessionStorage.setItem(name, "true");
        } catch (e) {}
    }

    function setTheme(theme) {
        if (theme === "yellow" || theme === "red") {
            setFlag(theme);
        }

        if (theme === "blue") {
            delete root.dataset.theme;
        } else {
            root.dataset.theme = theme;
        }

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = getComputedStyle(root).getPropertyValue("--blue").trim();
        }

        document.dispatchEvent(new Event("themechange"));
    }

    function glitchDuration() {
        var value = parseFloat(getComputedStyle(root).getPropertyValue("--glitch-duration"));
        return isNaN(value) ? 1200 : value;
    }

    function glitchHalf() {
        return reduceMotion ? 0 : glitchDuration() / 2;
    }

    // Startet den Glitch sofort; die Farbe springt nach der halben Glitch-Dauer.
    // Optional wird danach das Element "focus" mittig in den Viewport gescrollt.
    function glitchTo(theme, focus) {
        var half = glitchHalf();
        if (!reduceMotion) {
            root.classList.add("is-glitching");
            setTimeout(function () {
                root.classList.remove("is-glitching");
            }, half * 2);
        }
        setTimeout(function () {
            var target = focus && document.querySelector(focus);
            var returnTo = window.pageYOffset;
            setTheme(theme);
            if (target) {
                // Element mittig ausrichten, kurz festhalten, dann zur alten Position zurück.
                var rect = target.getBoundingClientRect();
                var centerTop = returnTo + rect.top + rect.height / 2 - window.innerHeight / 2;
                lockScroll(FOCUS_LOCK, function () {
                    animateScrollTo(returnTo);
                });
                animateScrollTo(centerTop);
            }
        }, half);
    }

    // Startet den Glitch so, dass der Farbwechsel genau auf "switchAt" fällt.
    function scheduleSwitch(switchAt, theme, focus) {
        setTimeout(function () {
            glitchTo(theme, focus);
        }, Math.max(switchAt - glitchHalf(), 0));
    }

    // Plant die Folgewechsel kumulativ ab "startAt" (ms ab jetzt).
    function scheduleFollowUp(startAt) {
        var at = startAt;
        followUp.forEach(function (step) {
            at += step.after;
            scheduleSwitch(at, step.theme, step.focus);
        });
    }

    function startTimed() {
        scheduleSwitch(FIRST_DELAY, firstStep.theme, firstStep.focus);
        scheduleFollowUp(FIRST_DELAY);
    }

    // Eigene Scroll-Animation: native "smooth"-Scrolls werden von den Overflow-Änderungen
    // (Scroll-Sperre, is-glitching) abgebrochen; window.scrollTo pro Frame funktioniert
    // auch bei overflow: hidden. Ziel wird auf den scrollbaren Bereich begrenzt (oben = 0).
    function animateScrollTo(top) {
        var max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
        var to = Math.min(Math.max(top, 0), max);
        var from = window.pageYOffset;
        var distance = to - from;
        if (reduceMotion || Math.abs(distance) < 1) {
            window.scrollTo(0, to);
            return;
        }
        var duration = SCROLL_DURATION;
        var start = null;

        function step(now) {
            if (start === null) {
                start = now;
            }
            var t = Math.min((now - start) / duration, 1);
            var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            window.scrollTo(0, from + distance * eased);
            if (t < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    function preventScroll(event) {
        event.preventDefault();
    }

    function lockScroll(duration, onUnlock) {
        var previousOverflow = root.style.overflow;
        root.style.overflow = "hidden";
        window.addEventListener("touchmove", preventScroll, { passive: false });
        window.addEventListener("wheel", preventScroll, { passive: false });

        setTimeout(function () {
            root.style.overflow = previousOverflow;
            window.removeEventListener("touchmove", preventScroll);
            window.removeEventListener("wheel", preventScroll);
            if (onUnlock) {
                onUnlock();
            }
        }, duration);
    }

    function startOnScroll(image) {
        var triggered = false;
        var ticking = false;

        function trigger() {
            triggered = true;
            window.removeEventListener("scroll", onScroll);

            // Rot statt Gelb: direkt zur roten Karte, ohne die Bild-Sperre
            // (zwei überlappende Scroll-Sperren würden die Seite gesperrt lassen).
            if (firstStep.theme !== "yellow") {
                glitchTo(firstStep.theme, firstStep.focus);
                scheduleFollowUp(glitchHalf());
                return;
            }

            // Bild exakt mittig ausrichten, dann kurz festhalten.
            var rect = image.getBoundingClientRect();
            var offset = rect.top + rect.height / 2 - window.innerHeight / 2;
            window.scrollTo(0, window.pageYOffset + offset);
            lockScroll(SCROLL_LOCK);

            glitchTo("yellow");
            scheduleFollowUp(glitchHalf());
        }

        function check() {
            ticking = false;
            if (triggered) {
                return;
            }
            var rect = image.getBoundingClientRect();
            if (rect.height > 0 && rect.top + rect.height / 2 <= window.innerHeight / 2) {
                trigger();
            }
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(check);
            }
        }

        window.addEventListener("scroll", onScroll, { passive: true });
        check();
    }

    var seenYellow = getFlag("yellow");
    var seenRed = getFlag("red");
    if (seenYellow && seenRed) {
        return;
    }

    // Erster Wechsel und Folgewechsel: normal gelb → rot → blau,
    // nach bereits gezeigtem Gelb direkt rot → blau.
    var firstStep = seenYellow ?
        { theme: "red", focus: FOLLOW_UP[0].focus } :
        { theme: "yellow", focus: ".warning-sign" };
    var followUp = seenYellow ? FOLLOW_UP.slice(1) : FOLLOW_UP;

    var codingImage = document.getElementById("coding");
    if (isMobile && codingImage) {
        startOnScroll(codingImage);
    } else {
        startTimed();
    }
})();
