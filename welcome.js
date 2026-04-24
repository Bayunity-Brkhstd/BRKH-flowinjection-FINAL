document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('welcome-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    if (modal) modal.style.display = 'flex';
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.opacity = '0';
            setTimeout(() => { modal.style.display = 'none'; }, 300);
        });
    }
});