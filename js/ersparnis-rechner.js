/**
 * Ersparnis-Rechner: Wie viel Geld spart eine Automatisierung über die Zeit?
 *  - Container: [data-savings-calc], darin fünf Slider (name = employees, wage,
 *    hours, cost, years), Kennzahlen [data-out], Diagramm .savings-chart und
 *    Tabelle .savings-table tbody.
 *  - Jährliche Ersparnis = Mitarbeiter × Stundenlohn × gesparte Stunden pro Woche × 46 Wochen.
 *  - Das Diagramm zeigt den Stand nach Abzug der einmaligen Kosten, Monat für Monat.
 * Farben kommen per CSS-Klasse aus den CSS-Variablen, damit die Farbschemata greifen.
 */
(function () {
    "use strict";

    // 52 Wochen abzüglich Urlaub und Feiertagen
    var WEEKS_PER_YEAR = 46;
    var SVG_NS = "http://www.w3.org/2000/svg";

    var euro = new Intl.NumberFormat("de-DE", {
        style: "currency", currency: "EUR", maximumFractionDigits: 0
    });
    var decimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

    function formatEuro(cents) {
        return euro.format(Math.round(cents / 100));
    }

    // Achsenwerte kurz halten: ab einer Million als "1,2 Mio. €"
    function formatAxis(cents) {
        var value = cents / 100 || 0; // kein "-0 €"
        if (Math.abs(value) >= 1000000) {
            return decimal.format(value / 1000000) + " Mio. €";
        }
        return euro.format(value);
    }

    function plural(n, one, many) {
        return n + " " + (n === 1 ? one : many);
    }

    // Dativ, passend zu "nach …": "1 Jahr und 3 Monaten", "5 Monaten"
    function formatDuration(months) {
        var years = Math.floor(months / 12);
        var rest = months % 12;
        var parts = [];
        if (years > 0) {
            parts.push(plural(years, "Jahr", "Jahren"));
        }
        if (rest > 0 || years === 0) {
            parts.push(plural(rest, "Monat", "Monaten"));
        }
        return parts.join(" und ");
    }

    // "Schöne" Rasterabstände: 1, 2 oder 5 mal einer Zehnerpotenz
    function niceStep(range, targetTicks) {
        var raw = range / targetTicks;
        var magnitude = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var norm = raw / magnitude;
        var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
        return step * magnitude;
    }

    function readValues(inputs) {
        var v = {};
        Object.keys(inputs).forEach(function (name) {
            v[name] = parseFloat(inputs[name].value);
        });
        return v;
    }

    // Alle Beträge in Cent, damit halbe Stunden keine Rundungsfehler erzeugen
    function calculate(v) {
        var annual = v.employees * v.wage * 100 * v.hours * WEEKS_PER_YEAR;
        var cost = v.cost * 100;
        var months = v.years * 12;
        var paybackExact = cost * 12 / annual;
        return {
            annual: annual,
            cost: cost,
            months: months,
            years: v.years,
            paybackExact: paybackExact,
            paysBack: paybackExact <= months,
            valueAt: function (m) {
                return Math.round(annual * m / 12) - cost;
            }
        };
    }

    var FORMATS = {
        employees: function (v) { return String(v); },
        wage: function (v) { return v + " €"; },
        hours: function (v) { return decimal.format(v) + " Std."; },
        cost: function (v) { return euro.format(v); },
        years: function (v) { return plural(v, "Jahr", "Jahre"); }
    };

    function paybackText(r) {
        if (r.cost === 0) {
            return "sofort";
        }
        if (!r.paysBack) {
            return "nicht innerhalb von " + plural(r.years, "Jahr", "Jahren");
        }
        return formatDuration(Math.ceil(r.paybackExact));
    }

    function createCalculator(root, index) {
        var inputs = {};
        root.querySelectorAll("input[type=range]").forEach(function (input) {
            inputs[input.name] = input;
        });
        var outputs = {};
        root.querySelectorAll("[data-out]").forEach(function (el) {
            outputs[el.getAttribute("data-out")] = el;
        });
        var chart = root.querySelector(".savings-chart");
        var tableBody = root.querySelector(".savings-table tbody");

        var svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("tabindex", "0");
        svg.setAttribute("role", "img");
        chart.appendChild(svg);

        var tooltip = document.createElement("div");
        tooltip.className = "savings-tooltip";
        tooltip.setAttribute("aria-live", "polite");
        tooltip.hidden = true;
        chart.appendChild(tooltip);

        var clipId = "savings-clip-" + index;
        var result = null;
        var layout = null;
        var activeMonth = null;

        function updateControls() {
            Object.keys(inputs).forEach(function (name) {
                var input = inputs[name];
                var min = parseFloat(input.min);
                var max = parseFloat(input.max);
                var pct = (parseFloat(input.value) - min) / (max - min) * 100;
                input.style.setProperty("--fill", pct + "%");
                var out = root.querySelector('output[for="' + input.id + '"]');
                if (out) {
                    out.textContent = FORMATS[name](parseFloat(input.value));
                }
            });
        }

        function updateFigures(r) {
            var total = r.valueAt(r.months);
            var period = plural(r.years, "Jahr", "Jahren");
            outputs.total.textContent = formatEuro(total);
            outputs["total-label"].textContent = total < 0
                ? "Nach " + period + " noch im Minus"
                : "Nach " + period + " gespart";
            outputs.annual.textContent = formatEuro(r.annual);
            outputs.payback.textContent = paybackText(r);
            svg.setAttribute("aria-label", "Diagramm der Ersparnis: nach " + period + " " +
                formatEuro(total) + " nach Abzug der Kosten, amortisiert " +
                (r.cost === 0 ? "sofort" : r.paysBack ? "nach " + paybackText(r) : paybackText(r)) + ".");
        }

        function updateTable(r) {
            var rows = "";
            for (var y = 1; y <= r.years; y++) {
                var gross = Math.round(r.annual * y);
                rows += "<tr><th scope=\"row\">" + plural(y, "Jahr", "Jahre") + "</th>" +
                    "<td>" + formatEuro(gross) + "</td>" +
                    "<td>" + formatEuro(gross - r.cost) + "</td></tr>";
            }
            tableBody.innerHTML = rows;
        }

        function xTicks(r, narrow, plotW) {
            var ticks = [];
            if (r.years === 1) {
                [0, 3, 6, 9, 12].forEach(function (m) {
                    ticks.push({ m: m, label: m === 0 ? "Heute" : m === 12 ? "1 Jahr" : m + " Mon." });
                });
                return ticks;
            }
            // Nur so viele Jahre beschriften, dass sich die Texte nicht berühren
            var yearWidth = plotW / r.years;
            var minGap = narrow ? 42 : 72;
            var every = Math.ceil(minGap / yearWidth);
            function label(y) {
                return y === 0 ? "Heute" : narrow ? y + " J." : plural(y, "Jahr", "Jahre");
            }
            for (var y = 0; y <= r.years; y += every) {
                ticks.push({ m: y * 12, label: label(y) });
            }
            // Das Ende des Zeitraums immer beschriften, notfalls statt des vorletzten Werts
            var last = ticks[ticks.length - 1];
            if (last.m !== r.months) {
                if ((r.months - last.m) / 12 * yearWidth < minGap) {
                    ticks.pop();
                }
                ticks.push({ m: r.months, label: label(r.years) });
            }
            return ticks;
        }

        function render() {
            var r = result;
            var width = chart.clientWidth;
            if (!width) {
                return;
            }
            var narrow = width < 560;
            var height = narrow ? 240 : 320;
            // Rechts Platz für die mittig gesetzte letzte Achsenbeschriftung
            var m = { top: 20, right: narrow ? 22 : 34, bottom: 34, left: narrow ? 74 : 86 };
            var plotW = width - m.left - m.right;
            var plotH = height - m.top - m.bottom;

            var minVal = Math.min(0, -r.cost);
            var maxVal = Math.max(0, r.valueAt(r.months));
            var step = niceStep(maxVal - minVal || 1, narrow ? 4 : 5);
            var yMin = Math.floor(minVal / step) * step;
            var yMax = Math.ceil(maxVal / step) * step;
            if (yMax === yMin) {
                yMax = yMin + step;
            }

            function x(month) {
                return m.left + month / r.months * plotW;
            }
            function y(val) {
                return m.top + (yMax - val) / (yMax - yMin) * plotH;
            }
            layout = { x: x, y: y, m: m, plotW: plotW, width: width };

            var s = "";
            // Raster und Y-Achse
            s += '<g class="sc-axis">';
            for (var v = yMin; v <= yMax + step / 2; v += step) {
                var gy = y(v);
                s += '<line class="sc-grid" x1="' + m.left + '" x2="' + (m.left + plotW) +
                    '" y1="' + gy + '" y2="' + gy + '"/>';
                s += '<text x="' + (m.left - 10) + '" y="' + gy + '" dy="0.35em" text-anchor="end">' +
                    formatAxis(v) + "</text>";
            }
            // X-Achse
            var ticks = xTicks(r, narrow, plotW);
            ticks.forEach(function (t) {
                s += '<text x="' + x(t.m) + '" y="' + (height - 10) + '" text-anchor="middle">' +
                    t.label + "</text>";
            });
            s += "</g>";

            // Fläche: über null in Blau, darunter (Investitionsphase) gedämpft
            var y0 = y(0);
            var x1 = x(0), x2 = x(r.months);
            var v1 = y(r.valueAt(0)), v2 = y(r.valueAt(r.months));
            var area = "M" + x1 + "," + y0 + "L" + x1 + "," + v1 + "L" + x2 + "," + v2 + "L" + x2 + "," + y0 + "Z";
            s += "<defs>" +
                '<clipPath id="' + clipId + '-pos"><rect x="0" y="0" width="' + width + '" height="' + y0 + '"/></clipPath>' +
                '<clipPath id="' + clipId + '-neg"><rect x="0" y="' + y0 + '" width="' + width + '" height="' + height + '"/></clipPath>' +
                "</defs>";
            s += '<path class="sc-area-pos" clip-path="url(#' + clipId + '-pos)" d="' + area + '"/>';
            s += '<path class="sc-area-neg" clip-path="url(#' + clipId + '-neg)" d="' + area + '"/>';
            s += '<line class="sc-zero" x1="' + m.left + '" x2="' + (m.left + plotW) +
                '" y1="' + y0 + '" y2="' + y0 + '"/>';
            s += '<path class="sc-line" d="M' + x1 + "," + v1 + "L" + x2 + "," + v2 + '"/>';

            // Amortisationspunkt mit direkter Beschriftung
            if (r.cost > 0 && r.paysBack) {
                var px = x(r.paybackExact);
                var right = px > m.left + plotW * 0.6;
                s += '<circle class="sc-marker" cx="' + px + '" cy="' + y0 + '" r="5"/>';
                s += '<text class="sc-marker-label" x="' + (px + (right ? -10 : 10)) + '" y="' + (y0 + 20) +
                    '" text-anchor="' + (right ? "end" : "start") + '">Amortisiert nach ' +
                    formatDuration(Math.ceil(r.paybackExact)) + "</text>";
            }

            // Fadenkreuz für Hover und Tastatur
            s += '<g class="sc-cross" visibility="hidden">' +
                '<line y1="' + m.top + '" y2="' + (m.top + plotH) + '"/>' +
                '<circle r="5"/></g>';
            s += '<rect class="sc-hit" x="' + m.left + '" y="' + m.top + '" width="' + plotW +
                '" height="' + plotH + '"/>';

            svg.setAttribute("viewBox", "0 0 " + width + " " + height);
            svg.setAttribute("width", width);
            svg.setAttribute("height", height);
            svg.innerHTML = s;

            if (activeMonth !== null) {
                showMonth(Math.min(activeMonth, r.months));
            }
        }

        function showMonth(month) {
            activeMonth = month;
            var value = result.valueAt(month);
            var cx = layout.x(month);
            var cy = layout.y(value);
            var cross = svg.querySelector(".sc-cross");
            var line = cross.querySelector("line");
            line.setAttribute("x1", cx);
            line.setAttribute("x2", cx);
            var dot = cross.querySelector("circle");
            dot.setAttribute("cx", cx);
            dot.setAttribute("cy", cy);
            cross.setAttribute("visibility", "visible");

            var when = month === 0 ? "Heute" : "Nach " + formatDuration(month);
            var what = value < 0
                ? "Stand: " + formatEuro(value) + " (Kosten noch nicht wieder drin)"
                : formatEuro(value) + " gespart";
            tooltip.innerHTML = "<strong>" + when + "</strong><br>" + what;
            tooltip.hidden = false;

            // Tooltip neben dem Punkt, an den Rändern nach innen klappen
            var tipW = tooltip.offsetWidth;
            var left = cx + 14;
            if (left + tipW > layout.width) {
                left = cx - 14 - tipW;
            }
            tooltip.style.left = Math.max(0, left) + "px";
            tooltip.style.top = Math.max(0, cy - tooltip.offsetHeight - 10) + "px";
        }

        function hide() {
            activeMonth = null;
            tooltip.hidden = true;
            var cross = svg.querySelector(".sc-cross");
            if (cross) {
                cross.setAttribute("visibility", "hidden");
            }
        }

        function monthFromPointer(event) {
            var rect = svg.getBoundingClientRect();
            var px = (event.clientX - rect.left) * (layout.width / rect.width);
            var month = Math.round((px - layout.m.left) / layout.plotW * result.months);
            return Math.max(0, Math.min(result.months, month));
        }

        svg.addEventListener("pointermove", function (event) {
            showMonth(monthFromPointer(event));
        });
        svg.addEventListener("pointerdown", function (event) {
            showMonth(monthFromPointer(event));
        });
        svg.addEventListener("pointerleave", function (event) {
            // Auf Touch-Geräten bleibt der Tooltip stehen, bis woanders getippt wird
            if (event.pointerType === "mouse") {
                hide();
            }
        });
        svg.addEventListener("focus", function () {
            showMonth(activeMonth === null ? result.months : activeMonth);
        });
        svg.addEventListener("blur", hide);
        svg.addEventListener("keydown", function (event) {
            var month = activeMonth === null ? result.months : activeMonth;
            var keys = {
                ArrowLeft: month - 1, ArrowRight: month + 1,
                PageDown: month - 12, PageUp: month + 12,
                Home: 0, End: result.months
            };
            if (event.key === "Escape") {
                hide();
                return;
            }
            if (!(event.key in keys)) {
                return;
            }
            event.preventDefault();
            showMonth(Math.max(0, Math.min(result.months, keys[event.key])));
        });

        function update() {
            result = calculate(readValues(inputs));
            updateControls();
            updateFigures(result);
            updateTable(result);
            render();
        }

        Object.keys(inputs).forEach(function (name) {
            inputs[name].addEventListener("input", update);
        });

        var lastWidth = 0;
        function onResize() {
            if (chart.clientWidth !== lastWidth) {
                lastWidth = chart.clientWidth;
                render();
            }
        }
        if ("ResizeObserver" in window) {
            new ResizeObserver(onResize).observe(chart);
        } else {
            var resizeTimer;
            window.addEventListener("resize", function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(onResize, 150);
            });
        }

        update();
    }

    function start() {
        document.querySelectorAll("[data-savings-calc]").forEach(createCalculator);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
