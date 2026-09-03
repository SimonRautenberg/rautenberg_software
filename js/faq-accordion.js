document.addEventListener('DOMContentLoaded', function () {
    var headers = document.querySelectorAll('.accordion-header');

    headers.forEach(function (header) {
        header.addEventListener('click', function () {
            var item = header.closest('.accordion-item');
            var panel = item.querySelector('.accordion-panel');
            var isActive = item.classList.contains('active');

            document.querySelectorAll('.accordion-item.active').forEach(function (openItem) {
                if (openItem !== item) {
                    openItem.classList.remove('active');
                    openItem.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
                    openItem.querySelector('.accordion-panel').style.maxHeight = null;
                }
            });

            if (isActive) {
                item.classList.remove('active');
                header.setAttribute('aria-expanded', 'false');
                panel.style.maxHeight = null;
            } else {
                item.classList.add('active');
                header.setAttribute('aria-expanded', 'true');
                panel.style.maxHeight = panel.scrollHeight + 'px';
            }
        });
    });
});
