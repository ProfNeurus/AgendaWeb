/**
 * JavaScript para la página de login
 * Manejo de autenticación y validación del formulario
 */

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const errorMessage = document.getElementById('errorMessage');
    const loginButton = document.getElementById('loginButton');

    // Verificar si ya hay sesión activa
    checkSession();

    // Toggle visibilidad de contraseña
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;

        // Cambiar icono
        const eyeIcon = togglePassword.querySelector('.eye-icon');
        if (type === 'text') {
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
            `;
        } else {
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            `;
        }
    });

    // Manejar submit del formulario
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // Validación básica
        if (!username || !password) {
            showError('Por favor completa todos los campos');
            return;
        }

        // Mostrar loader
        setLoading(true);
        hideError();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // Redireccionar al calendario
                window.location.href = '/calendar';
            } else {
                showError(data.message || 'Error al iniciar sesion');
            }
        } catch (error) {
            console.error('Error:', error);
            showError('Error de conexion. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    });

    // Funciones auxiliares
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'flex';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    function setLoading(loading) {
        loginButton.disabled = loading;
        const buttonText = loginButton.querySelector('.button-text');
        const buttonLoader = loginButton.querySelector('.button-loader');

        if (loading) {
            buttonText.style.display = 'none';
            buttonLoader.style.display = 'flex';
        } else {
            buttonText.style.display = 'inline';
            buttonLoader.style.display = 'none';
        }
    }

    async function checkSession() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();

            if (data.authenticated) {
                // Ya hay sesión activa, redireccionar
                window.location.href = '/calendar';
            }
        } catch (error) {
            // Sin sesión, mostrar login
        }
    }

    // Enter key en inputs
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});