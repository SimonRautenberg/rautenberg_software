/*
 * Karussell für Kartenreihen (Startseite, Sektion "Lösungen").
 * Die Spur scrollt nativ (Wischen, Trackpad, Tastatur); Pfeile und Punkte
 * blättern seitenweise. Ohne JavaScript bleibt die Spur horizontal scrollbar.
 */
document.addEventListener('DOMContentLoaded', function () {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
        var track = carousel.querySelector('.carousel-track');
        var prev = carousel.querySelector('[data-carousel-prev]');
        var next = carousel.querySelector('[data-carousel-next]');
        var dotsBox = carousel.querySelector('.carousel-dots');
        var cards = track.children;
        var dots = [];

        // Abstand von einer Karte zur nächsten, inklusive Lücke
        function stride() {
            return cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;
        }

        function perPage() {
            return Math.max(1, Math.round(track.clientWidth / stride()));
        }

        function pageCount() {
            return Math.ceil(cards.length / perPage());
        }

        function maxScroll() {
            return track.scrollWidth - track.clientWidth;
        }

        function currentPage() {
            if (track.scrollLeft >= maxScroll() - 2) {
                return pageCount() - 1;
            }
            return Math.round(track.scrollLeft / (perPage() * stride()));
        }

        function scrollToPage(page) {
            var left = Math.min(page * perPage() * stride(), maxScroll());
            track.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
        }

        // Punkte neu anlegen, wenn sich die Zahl der Seiten ändert (z. B. Handy quer)
        function buildDots() {
            var count = pageCount();
            if (dots.length === count) {
                return;
            }
            dotsBox.innerHTML = '';
            dots = [];
            for (var i = 0; i < count; i++) {
                var dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'carousel-dot';
                dot.setAttribute('aria-label', 'Seite ' + (i + 1) + ' von ' + count);
                dot.addEventListener('click', scrollToPage.bind(null, i));
                dotsBox.appendChild(dot);
                dots.push(dot);
            }
        }

        function update() {
            var page = currentPage();
            dots.forEach(function (dot, i) {
                if (i === page) {
                    dot.setAttribute('aria-current', 'true');
                } else {
                    dot.removeAttribute('aria-current');
                }
            });
            prev.disabled = track.scrollLeft <= 2;
            next.disabled = track.scrollLeft >= maxScroll() - 2;
        }

        prev.addEventListener('click', function () { scrollToPage(Math.max(0, currentPage() - 1)); });
        next.addEventListener('click', function () { scrollToPage(currentPage() + 1); });

        var ticking = false;
        track.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(function () {
                    update();
                    ticking = false;
                });
            }
        });
        window.addEventListener('resize', function () {
            buildDots();
            update();
        });

        carousel.classList.add('is-ready');
        buildDots();
        update();
    });
});
