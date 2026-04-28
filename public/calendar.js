/**
 * JavaScript para la página del calendario
 * Manejo de tareas y visualización del calendario
 */

// Estado global
let currentDate = new Date();
let selectedDate = null;
let tasks = [];
let userName = '';
let currentView = 'week'; // 'month', 'week', 'day' - semanales por defecto
const THEME_STORAGE_KEY = 'agenda-theme';

// Notificaciones
const notifiedTasks = new Set();

// Detectar si es móvil
const isMobile = () => window.innerWidth <= 768;
const isSmallMobile = () => window.innerWidth <= 480;

// Vista inicial según dispositivo
if (isMobile()) {
    currentView = 'day'; // En móvil, iniciar con vista diaria por defecto
}

// Elementos DOM
const calendarDays = document.getElementById('calendarDays');
const currentMonthEl = document.getElementById('currentMonth');
const tasksList = document.getElementById('tasksList');
const selectedDateTitle = document.getElementById('selectedDateTitle');
const userNameEl = document.getElementById('userName');
const taskModal = document.getElementById('taskModal');
const taskDetailContent = document.getElementById('taskDetailContent');

// Stats elements
const totalTasksEl = document.getElementById('totalTasks');
const completedTasksEl = document.getElementById('completedTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const weekTasksEl = document.getElementById('weekTasks');

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    // Verificar sesión
    checkSession();

    // Event listeners para navegación
    document.getElementById('prevMonth').addEventListener('click', () => navigate(-1));
    document.getElementById('nextMonth').addEventListener('click', () => navigate(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('closeModal').addEventListener('click', closeModal);

    // Event listeners para vistas
    document.getElementById('viewMonth').addEventListener('click', () => switchView('month'));
    document.getElementById('viewWeek').addEventListener('click', () => switchView('week'));
    document.getElementById('viewDay').addEventListener('click', () => switchView('day'));

    // Cerrar modal al hacer clic fuera
    taskModal.addEventListener('click', function(e) {
        if (e.target === taskModal) {
            closeModal();
        }
    });

    // Escuchar cambios de tamaño de pantalla
    window.addEventListener('resize', handleResize);
    handleResize(); // Aplicar inicialmente

    // Inicializar notificaciones
    requestNotificationPermission();
    
    // Verificar notificaciones cada minuto
    setInterval(checkNotifications, 60000);
    
    // Recargar tareas automáticamente cada 5 minutos para tener datos frescos
    setInterval(loadTasks, 300000);
});

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = (savedTheme === 'dark' || savedTheme === 'light')
        ? savedTheme
        : (prefersDark ? 'dark' : 'light');

    applyTheme(initialTheme);

    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeToggleButton(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}

function updateThemeToggleButton(theme) {
    const themeToggleBtn = document.getElementById('themeToggle');
    if (!themeToggleBtn) return;

    const themeIcon = themeToggleBtn.querySelector('.theme-icon');
    const themeText = themeToggleBtn.querySelector('.theme-toggle-text');
    const isDark = theme === 'dark';

    if (themeIcon) {
        themeIcon.textContent = isDark ? '☀️' : '🌙';
    }

    if (themeText) {
        themeText.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
    }

    themeToggleBtn.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

// Manejar cambios de tamaño de pantalla
function handleResize() {
    const mobile = isMobile();
    const smallMobile = isSmallMobile();

    // Ajustar alturas según el dispositivo
    const weekBody = document.getElementById('weekBody');
    const dayBody = document.getElementById('dayBody');
    const tasksList = document.getElementById('tasksList');

    if (weekBody) {
        weekBody.style.maxHeight = mobile ? '50vh' : '600px';
    }
    if (dayBody) {
        dayBody.style.maxHeight = mobile ? '55vh' : '550px';
    }
    if (tasksList) {
        tasksList.style.maxHeight = mobile ? '250px' : '400px';
    }

    // Si cambiamos a móvil y estamos en vista mensual, cambiar a diaria para mejor UX
    if (mobile && currentView === 'month' && !window.viewSwitched) {
        window.viewSwitched = true;
        switchView('day');
    }
}

// Verificar sesión activa
async function checkSession() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        userName = data.user.name;
        userNameEl.textContent = userName;

        // Cargar tareas
        await loadTasks();
        render();

    } catch (error) {
        console.error('Error verificando sesion:', error);
        window.location.href = '/';
    }
}

// Cargar tareas desde el servidor
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();

        if (data.success) {
            tasks = data.tasks || [];
            preprocessOverlaps(tasks);
            updateStats();
        } else {
            console.error('Error cargando tareas:', data.message);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Pre-procesar tareas para calcular superposiciones en la grilla y asignarle a cada tarea una columna 
function preprocessOverlaps(allTasks) {
    const tasksByDay = {};
    allTasks.forEach(task => {
        if (!task.FechaPrometido) return;
        const start = new Date(task.FechaPrometido);
        const dayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
        if (!tasksByDay[dayKey]) tasksByDay[dayKey] = [];
        tasksByDay[dayKey].push(task);
    });

    Object.values(tasksByDay).forEach(dailyTasks => {
        dailyTasks.sort((a, b) => new Date(a.FechaPrometido).getTime() - new Date(b.FechaPrometido).getTime());

        let groups = [];
        dailyTasks.forEach(task => {
            const start = new Date(task.FechaPrometido).getTime();
            const end = getTaskEndTime(task);
            const endTime = end ? end.getTime() : start + 3600000; // max 1 hr default
            
            task._startCache = start;
            task._endCache = endTime;

            let addedToGroup = false;
            if (groups.length > 0) {
                let lastGroup = groups[groups.length - 1];
                let groupEnd = Math.max(...lastGroup.map(t => t._endCache));
                // Si la tarea comienza antes que termine el grupo actual, es del mismo grupo (superposición)
                if (start < groupEnd) {
                    lastGroup.push(task);
                    addedToGroup = true;
                }
            }

            if (!addedToGroup) {
                groups.push([task]);
            }
        });

        groups.forEach(group => {
            let columns = [];
            group.forEach(task => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    let lastInCol = columns[i][columns[i].length - 1];
                    if (task._startCache >= lastInCol._endCache) {
                        columns[i].push(task);
                        task._colIndex = i;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    task._colIndex = columns.length;
                    columns.push([task]);
                }
            });

            let maxCols = columns.length;
            group.forEach(task => {
                task._maxCols = maxCols;
            });
        });
    });
}

// Actualizar estadísticas
function updateStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getWeekStart(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);

    const total = tasks.length;
    const completed = tasks.filter(t => t.ID_Estado && (t.ID_Estado === 'CER' || t.ID_Estado === 'TRE')).length;
    const pending = tasks.filter(t => !t.ID_Estado || t.ID_Estado === 'PEN').length;
    const thisWeek = tasks.filter(t => {
        const taskDate = new Date(t.FechaPrometido);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate >= weekStart && taskDate <= weekEnd;
    }).length;

    if (totalTasksEl) totalTasksEl.textContent = total;
    if (completedTasksEl) completedTasksEl.textContent = completed;
    if (pendingTasksEl) pendingTasksEl.textContent = pending;
    if (weekTasksEl) weekTasksEl.textContent = thisWeek;
}

// Cambiar vista
function switchView(view) {
    currentView = view;

    // Actualizar botones activos
    document.querySelectorAll('.view-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');

    // Ocultar todas las vistas
    document.getElementById('monthView').style.display = 'none';
    document.getElementById('weekView').style.display = 'none';
    document.getElementById('dayView').style.display = 'none';

    // Mostrar la vista correcta
    if (view === 'month') {
        document.getElementById('monthView').style.display = 'block';
    } else if (view === 'week') {
        document.getElementById('weekView').style.display = 'block';
    } else if (view === 'day') {
        document.getElementById('dayView').style.display = 'block';
    }

    render();
}

// Navegar según la vista actual
function navigate(direction) {
    if (currentView === 'month') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (currentView === 'week') {
        currentDate.setDate(currentDate.getDate() + (direction * 6));
    } else if (currentView === 'day') {
        currentDate.setDate(currentDate.getDate() + direction);
        selectedDate = new Date(currentDate);
    }
    render();
}

// Renderizar según vista actual
function render() {
    if (currentView === 'month') {
        renderMonthView();
    } else if (currentView === 'week') {
        renderWeekView();
    } else {
        renderDayView();
    }
    updateTitle();
}

// Actualizar título según la vista
function updateTitle() {
    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (currentView === 'month') {
        currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (currentView === 'week') {
        const weekStart = getWeekStart(currentDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 5);
        currentMonthEl.textContent = `${weekStart.getDate()} - ${weekEnd.getDate()} de ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    } else {
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
        currentMonthEl.textContent = `${dayNames[currentDate.getDay()]}, ${currentDate.getDate()} de ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
}

// Ir a hoy
function goToToday() {
    currentDate = new Date();
    selectedDate = new Date();
    selectedDate.setHours(0, 0, 0, 0);
    render();
    if (currentView !== 'day') {
        renderTasksForDate(selectedDate);
    }
}

// Renderizar vista mensual
function renderMonthView() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((lastDay.getDate() + startingDay) / 7) * 7;

    calendarDays.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < totalCells; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        let currentDay;
        let isOtherMonth = false;

        if (i < startingDay) {
            currentDay = new Date(year, month - 1, prevMonthLastDay - startingDay + i + 1);
            isOtherMonth = true;
        } else if (i >= startingDay + lastDay.getDate()) {
            currentDay = new Date(year, month + 1, i - startingDay - lastDay.getDate() + 1);
            isOtherMonth = true;
        } else {
            currentDay = new Date(year, month, i - startingDay + 1);
        }

        currentDay.setHours(0, 0, 0, 0);

        if (isOtherMonth) dayEl.classList.add('other-month');
        if (currentDay.getTime() === today.getTime()) dayEl.classList.add('today');
        if (selectedDate && currentDay.getTime() === selectedDate.getTime()) dayEl.classList.add('selected');

        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = currentDay.getDate();
        dayEl.appendChild(dayNumber);

        const dayTasks = getTasksForDate(currentDay);
        if (dayTasks.length > 0) {
            const tasksContainer = document.createElement('div');
            tasksContainer.className = 'day-tasks';

            const maxVisible = 3;
            dayTasks.slice(0, maxVisible).forEach(task => {
                const taskDot = document.createElement('div');
                taskDot.className = 'task-dot ' + getTaskColorClass(task);
                taskDot.textContent = task.ClienteNombre.substring(0, 15) + (task.ClienteNombre.length > 15 ? '...' : '');
                taskDot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showTaskDetail(task);
                });
                tasksContainer.appendChild(taskDot);
            });

            if (dayTasks.length > maxVisible) {
                const moreEl = document.createElement('div');
                moreEl.className = 'more-tasks';
                moreEl.textContent = `+${dayTasks.length - maxVisible} mas`;
                tasksContainer.appendChild(moreEl);
            }

            dayEl.appendChild(tasksContainer);
        }

        dayEl.addEventListener('click', () => selectDate(currentDay));
        calendarDays.appendChild(dayEl);
    }
}

// Renderizar vista semanal con horarios
function renderWeekView() {
    const weekStart = getWeekStart(currentDate);
    const dayNames = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generar header con días
    const weekHeader = document.getElementById('weekHeader');
    weekHeader.innerHTML = '<div class="week-header-cell time-cell"></div>';

    for (let i = 0; i < 6; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        day.setHours(0, 0, 0, 0);

        const isToday = day.getTime() === today.getTime();
        const cell = document.createElement('div');
        cell.className = 'week-header-cell' + (isToday ? ' today-header' : '');
        cell.innerHTML = `
            <div>${dayNames[i]}</div>
            <div style="font-size: 0.9rem; margin-top: 2px;">${day.getDate()} ${monthNames[day.getMonth()]}</div>
        `;
        weekHeader.appendChild(cell);
    }

    // Generar body con horas (8:00 a 24:00)
    const weekBody = document.getElementById('weekBody');
    weekBody.innerHTML = '';

    for (let hour = 8; hour <= 24; hour++) {
        const row = document.createElement('div');
        row.className = 'week-row';

        // Celda de hora
        const timeCell = document.createElement('div');
        timeCell.className = 'time-cell';
        const displayHour = hour === 24 ? 0 : hour;
        timeCell.textContent = `${displayHour.toString().padStart(2, '0')}:00`;
        row.appendChild(timeCell);

        // Celdas de días
        for (let i = 0; i < 6; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            day.setHours(0, 0, 0, 0);

            const dayCell = document.createElement('div');
            dayCell.className = 'day-cell';

            if (day.getTime() === today.getTime()) {
                dayCell.classList.add('today');
            }
            if (selectedDate && day.getTime() === selectedDate.getTime()) {
                dayCell.classList.add('selected');
            }

            // Buscar tareas para este día
            const dayTasks = getTasksForDate(day);
            const startingTasks = dayTasks.filter(task => taskStartsAtHour(task, hour));

            startingTasks.forEach((task, index) => {
                const taskEl = document.createElement('div');
                taskEl.className = 'time-task ' + getTaskColorClass(task);

                // Calcular duración para altura
                const duration = getTaskDurationHours(task);
                const slotHeight = 50; // Altura de cada slot de hora

                // Posicionamiento absoluto para no romper el grid y soporte de minutos
                taskEl.style.position = 'absolute';
                taskEl.style.zIndex = '10';

                const taskDate = new Date(task.FechaPrometido);
                const topOffset = (taskDate.getMinutes() / 60) * slotHeight;
                taskEl.style.top = `${topOffset}px`;

                // Dividir el ancho para tareas superpuestas según pre-procesamiento
                const maxCols = task._maxCols || 1;
                const colIndex = task._colIndex || 0;
                const widthPercent = 100 / maxCols;
                const isOverlapped = maxCols > 1;
                if (isOverlapped) {
                    taskEl.classList.add('compact-task');
                }
                taskEl.style.width = `calc(${widthPercent}% - 2px)`;
                taskEl.style.left = `calc(${colIndex * widthPercent}%)`;

                taskEl.style.height = `${Math.max(20, duration * slotHeight - 2)}px`;

                // Mostrar hora de inicio y fin
                const endTime = getTaskEndTime(task);
                const startHour = new Date(task.FechaPrometido).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const endHourStr = endTime ? endTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
                const clientName = escapeHtml(task.ClienteNombre || 'Sin cliente');
                if (isOverlapped) {
                    taskEl.innerHTML = `
                        <div class="task-title">${clientName}</div>
                    `;
                } else {
                    taskEl.innerHTML = `
                        <div class="task-title">${escapeHtml(task.ClienteNombre.substring(0, 12) + (task.ClienteNombre.length > 12 ? '...' : ''))}</div>
                        <div class="task-time">${startHour} - ${endHourStr}</div>
                    `;
                }
                taskEl.title = `${task.ClienteNombre} (${startHour} - ${endHourStr})`;
                taskEl.addEventListener('click', () => showTaskDetail(task));
                dayCell.appendChild(taskEl);
            });

            dayCell.addEventListener('click', () => selectDate(day));
            row.appendChild(dayCell);
        }

        weekBody.appendChild(row);
    }
}

// Renderizar vista diaria con horarios
function renderDayView() {
    const currentDay = new Date(currentDate);
    currentDay.setHours(0, 0, 0, 0);

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Actualizar título
    document.getElementById('dayViewTitle').textContent =
        `${dayNames[currentDay.getDay()]}, ${currentDay.getDate()} de ${monthNames[currentDay.getMonth()]} ${currentDay.getFullYear()}`;

    const dayBody = document.getElementById('dayBody');
    dayBody.innerHTML = '';

    for (let hour = 8; hour <= 24; hour++) {
        const row = document.createElement('div');
        row.className = 'day-row';

        // Celda de hora
        const timeCell = document.createElement('div');
        timeCell.className = 'time-cell';
        const displayHour = hour === 24 ? 0 : hour;
        timeCell.textContent = `${displayHour.toString().padStart(2, '0')}:00`;
        row.appendChild(timeCell);

        // Área de tareas
        const taskArea = document.createElement('div');
        taskArea.className = 'day-task-area';

        // Buscar tareas para este día
        const dayTasks = getTasksForDate(currentDay);
        const startingTasks = dayTasks.filter(task => taskStartsAtHour(task, hour));

        if (startingTasks.length === 0) {
            const emptyCell = document.createElement('div');
            emptyCell.style.cssText = 'height: 42px; border-bottom: 1px dashed var(--border-color);';
            taskArea.appendChild(emptyCell);
        }

        startingTasks.forEach((task, index) => {
            const taskEl = document.createElement('div');
            taskEl.className = 'day-time-task ' + getTaskColorClass(task);

            // Calcular duración para altura
            const duration = getTaskDurationHours(task);
            const slotHeight = 50; // Altura base

            // Posicionamiento absoluto
            taskEl.style.position = 'absolute';
            taskEl.style.zIndex = '10';

            const taskDate = new Date(task.FechaPrometido);
            const topOffset = (taskDate.getMinutes() / 60) * slotHeight;
            taskEl.style.top = `${topOffset}px`;

            // Dividir ancho superpuestas
            const maxCols = task._maxCols || 1;
            const colIndex = task._colIndex || 0;
            const widthPercent = 100 / maxCols;
            const isOverlapped = maxCols > 1;
            if (isOverlapped) {
                taskEl.classList.add('compact-task');
            }
            taskEl.style.width = `calc(${widthPercent}% - 8px)`;
            taskEl.style.left = `calc(${colIndex * widthPercent}% + 4px)`;

            taskEl.style.height = `${Math.max(20, duration * slotHeight - 4)}px`;

            // Mostrar hora de inicio y fin
            const endTime = getTaskEndTime(task);
            const startHour = new Date(task.FechaPrometido).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const endHourStr = endTime ? endTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
            if (isOverlapped) {
                taskEl.innerHTML = `
                    <div class="task-title">${escapeHtml(task.ClienteNombre || 'Sin cliente')}</div>
                `;
            } else {
                taskEl.innerHTML = `
                    <div class="task-title">${escapeHtml(task.ClienteNombre || 'Sin cliente')}</div>
                    <div class="task-time">${startHour} - ${endHourStr}</div>
                    <div class="task-info">${escapeHtml(task.Solicitante || 'Sin solicitante')}</div>
                `;
            }
            taskEl.title = `${task.ClienteNombre} (${startHour} - ${endHourStr})`;

            taskEl.addEventListener('click', () => showTaskDetail(task));
            taskArea.appendChild(taskEl);
        });

        row.appendChild(taskArea);
        dayBody.appendChild(row);
    }
}

// Calcular hora de fin de una tarea (basada en HorasEstimadas o FechaFinalizacion según el estado)
function getTaskEndTime(task) {
    if (!task.FechaPrometido) return null;

    if (task.ID_Estado === 'TRE' || task.ID_Estado === 'CER') {
        if (task.FechaFinalizacion) {
            return new Date(task.FechaFinalizacion);
        }
    }

    const startDate = new Date(task.FechaPrometido);
    const horasEstimadas = parseFloat(task.HorasEstimadas) || parseFloat(task.HorasEstimada) || 1; // Default 1 hora

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + Math.floor(horasEstimadas));
    endDate.setMinutes(endDate.getMinutes() + (horasEstimadas % 1) * 60);

    return endDate;
}

// Obtener tareas para una fecha y hora específica
function getTasksForDateAndHour(date, hour) {
    return tasks.filter(task => {
        if (!task.FechaPrometido) return false;

        const taskDate = new Date(task.FechaPrometido);
        const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (taskDateOnly.getTime() !== dateOnly.getTime()) return false;

        const taskHour = taskDate.getHours();
        const endTime = getTaskEndTime(task);
        const endHour = endTime ? endTime.getHours() : taskHour + 1;

        // La tarea ocupa este slot si la hora está entre la hora de inicio y fin
        return hour >= taskHour && hour < endHour;
    });
}

// Verificar si una tarea comienza en esta hora específica
function taskStartsAtHour(task, hour) {
    if (!task.FechaPrometido) return false;
    const taskDate = new Date(task.FechaPrometido);
    return taskDate.getHours() === hour;
}

// Obtener duración de la tarea en horas (para calcular altura)
function getTaskDurationHours(task) {
    if (task.ID_Estado === 'TRE' || task.ID_Estado === 'CER') {
        if (task.FechaPrometido && task.FechaFinalizacion) {
            const start = new Date(task.FechaPrometido);
            const end = new Date(task.FechaFinalizacion);
            const durationMs = end.getTime() - start.getTime();
            if (durationMs > 0) {
                return durationMs / (1000 * 60 * 60);
            }
        }
    }
    const horasEstimadas = parseFloat(task.HorasEstimadas) || parseFloat(task.HorasEstimada) || 1;
    return horasEstimadas;
}

// Obtener inicio de semana (lunes)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Obtener tareas para una fecha específica
function getTasksForDate(date) {
    return tasks.filter(task => {
        if (!task.FechaPrometido) return false;

        // Parsear fecha de la tarea
        const taskDate = new Date(task.FechaPrometido);

        // Crear fecha comparativa sin horas
        const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        return taskDateOnly.getTime() === dateOnly.getTime();
    });
}

// Seleccionar fecha
function selectDate(date) {
    selectedDate = date;
    if (currentView === 'day') {
        currentDate = new Date(date);
        render();
    } else {
        render();
        renderTasksForDate(date);
    }
}

// Renderizar tareas para una fecha
function renderTasksForDate(date) {
    const dayTasks = getTasksForDate(date);

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    selectedDateTitle.textContent = date.toLocaleDateString('es-ES', options);

    tasksList.innerHTML = '';

    if (dayTasks.length === 0) {
        tasksList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 12h8"/>
                </svg>
                <p>No hay tareas para este dia</p>
            </div>
        `;
        return;
    }

    dayTasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';

        const estadoTexto = getEstadoTexto(task.ID_Estado);

        taskCard.innerHTML = `
            <div class="task-card-header">
                <span class="task-client">${escapeHtml(task.ClienteNombre || 'Sin cliente')}</span>
                <span class="task-status ${getTaskColorClass(task)}">${escapeHtml(estadoTexto)}</span>
            </div>
            <div class="task-date">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${escapeHtml(task.Solicitante || 'Sin solicitante')}
            </div>
        `;

        taskCard.addEventListener('click', () => showTaskDetail(task));
        tasksList.appendChild(taskCard);
    });
}

// Generar opciones de hora (8:00 a 24:00, intervalos de 15 min)
function generateTimeOptions(selectedTime) {
    let options = '';
    for (let hour = 8; hour <= 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const h = hour.toString().padStart(2, '0');
            const m = minute.toString().padStart(2, '0');
            const timeValue = `${h}:${m}`;
            const selected = timeValue === selectedTime ? 'selected' : '';
            options += `<option value="${timeValue}" ${selected}>${timeValue}</option>`;
        }
    }
    return options;
}

// Obtener hora en formato HH:MM de un Date
function getTimeString(date) {
    if (!date) return '';
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Variable para almacenar el ID de la tarea actual
let currentTaskId = null;

// Mostrar detalle de tarea
async function showTaskDetail(task) {
    console.log('Abriendo detalle de tarea:', task.ID_PEDIDOSERVICIO);
    currentTaskId = task.ID_PEDIDOSERVICIO;

    try {
        const response = await fetch(`/api/task/${task.ID_PEDIDOSERVICIO}`);
        const data = await response.json();

        if (data.success) {
            const detail = data.task;
            const taskDate = detail.FechaPrometido ? new Date(detail.FechaPrometido) : null;
            const endDate = detail.FechaFinalizacion ? new Date(detail.FechaFinalizacion) : null;

            // Determinar estado
            let estadoTexto = 'Tarea Pendiente';
            let estadoClass = 'status-pending';
            if (detail.ID_Estado === 'CER' || detail.ID_Estado === 'TRE') {
                estadoTexto = 'Tarea Realizada';
                estadoClass = 'status-completed';
            }

            // Determinar tipo
            let tipoTexto = detail.ID_Tipo || 'No especificado';
            let tipoClass = '';
            if (detail.ID_Tipo === 'MOB') {
                tipoTexto = 'Presencial';
                tipoClass = 'type-presencial';
            } else if (detail.ID_Tipo === 'ELE') {
                tipoTexto = 'Remoto';
                tipoClass = 'type-remoto';
            }

            // Formatear fecha y hora
            const fechaStr = taskDate ? taskDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Sin fecha';
            const horaInicioActual = getTimeString(taskDate) || '08:00';
            const horaFinActual = getTimeString(endDate) || horaInicioActual;

            taskDetailContent.innerHTML = `
                <form id="taskForm" onsubmit="event.preventDefault();">
                    <div class="task-detail-container">
                        <!-- Columna izquierda -->
                        <div class="task-detail-left">
                            <div class="task-id-header">
                                <span class="task-id-number">#${detail.ID_PEDIDOSERVICIO}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Fecha</span>
                                <span class="detail-value">${escapeHtml(fechaStr)}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Cliente</span>
                                <span class="detail-value">${escapeHtml(detail.ClienteNombre || 'Sin cliente')}</span>
                                <div class="client-action-buttons">
                                    <button type="button" class="btn-client-action" onclick="openMailsModal(${detail.ID_Cliente})">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                            <polyline points="22,6 12,13 2,6"/>
                                        </svg>
                                        Mails
                                    </button>
                                    <button type="button" class="btn-client-action" onclick="openContactosModal(${detail.ID_Cliente})">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                            <circle cx="9" cy="7" r="4"/>
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                        </svg>
                                        Contactos
                                    </button>
                                    <button type="button" class="btn-client-action" onclick="openServiciosModal(${detail.ID_Cliente})">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                            <line x1="16" y1="2" x2="16" y2="6"/>
                                            <line x1="8" y1="2" x2="8" y2="6"/>
                                            <line x1="3" y1="10" x2="21" y2="10"/>
                                        </svg>
                                        Servicios
                                    </button>
                                    <button type="button" class="btn-client-action" onclick="openLlavesModal(${detail.ID_Cliente})">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <circle cx="7.5" cy="15.5" r="2.5"/>
                                            <path d="M10 14l6-6a2.828 2.828 0 1 1 4 4l-6 6"/>
                                            <path d="M17 10l2 2"/>
                                        </svg>
                                        Llaves
                                    </button>
                                </div>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Estado</span>
                                <span class="detail-value ${estadoClass}">${escapeHtml(estadoTexto)}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Tipo</span>
                                <span class="detail-value ${tipoClass}">${escapeHtml(tipoTexto)}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Contacto</span>
                                <span class="detail-value">${escapeHtml(detail.Solicitante || 'No especificado')}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Dirección</span>
                                <span class="detail-value">${escapeHtml(detail.Domicilio || detail.Direccion || 'No especificada')}</span>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Falla</span>
                                <div class="detail-textbox">${escapeHtml(detail.Falla || 'No especificada')}</div>
                            </div>
                        </div>

                        <!-- Columna derecha -->
                        <div class="task-detail-right">
                            <div class="detail-row">
                                <span class="detail-label">Hora Inicio</span>
                                <select id="horaInicio" class="time-select" required>
                                    <option value="">Seleccionar...</option>
                                    ${generateTimeOptions(horaInicioActual)}
                                </select>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Hora Finalización</span>
                                <select id="horaFin" class="time-select" required>
                                    <option value="">Seleccionar...</option>
                                    ${generateTimeOptions(horaFinActual)}
                                </select>
                            </div>

                            <div class="detail-row">
                                <span class="detail-label">Diagnóstico / Devolución</span>
                                <textarea id="diagnostico" class="diagnosis-textarea" rows="8" placeholder="Ingrese el diagnóstico o devolución...">${escapeHtml(detail.Diagnostico || '')}</textarea>
                            </div>

                            <div class="email-section">
                                <div class="detail-row">
                                    <span class="detail-label">Correo Destino</span>
                                    <input type="email" id="emailDestino" class="email-input" placeholder="ingresar@email.com">
                                </div>
                                <button type="button" class="send-email-btn" onclick="sendEmailSummary(${detail.ID_PEDIDOSERVICIO})">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                        <polyline points="22,6 12,13 2,6"/>
                                    </svg>
                                    Enviar Resumen por Email
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Botones de acción -->
                    <div class="modal-actions">
                        <button type="button" class="btn-cancel" onclick="closeModal()">Cancelar</button>
                        <button type="button" class="btn-save" onclick="saveTaskChanges()">Guardar Cambios</button>
                    </div>
                </form>
            `;

            taskModal.classList.add('show');
        }
    } catch (error) {
        console.error('Error obteniendo detalle:', error);
        alert('Error al cargar el detalle de la tarea');
    }
}

// Guardar cambios de la tarea
async function saveTaskChanges() {
    if (!currentTaskId) return;

    const horaInicio = document.getElementById('horaInicio').value;
    const horaFin = document.getElementById('horaFin').value;
    const diagnostico = document.getElementById('diagnostico').value;

    // Validaciones
    if (!horaInicio) {
        alert('Por favor, seleccione la hora de inicio');
        return;
    }

    if (!horaFin) {
        alert('Por favor, seleccione la hora de finalización');
        return;
    }

    // Validar que hora fin sea mayor o igual que hora inicio
    if (horaFin < horaInicio) {
        alert('La hora de finalización debe ser mayor o igual que la hora de inicio');
        return;
    }

    try {
        const response = await fetch(`/api/task/${currentTaskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                diagnostico: diagnostico,
                horaInicio: horaInicio,
                horaFin: horaFin
            })
        });

        const data = await response.json();

        if (data.success) {
            closeModal();
            // Recargar las tareas para reflejar los cambios
            await loadTasks();
            render();
        } else {
            alert('Error al guardar: ' + (data.message || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error guardando cambios:', error);
        alert('Error al guardar los cambios. Por favor, intente nuevamente.');
    }
}

// Enviar resumen por email
async function sendEmailSummary(taskId) {
    const emailInput = document.getElementById('emailDestino');
    const email = emailInput.value.trim();

    if (!email) {
        alert('Por favor, ingrese un correo electrónico');
        return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Por favor, ingrese un correo electrónico válido');
        return;
    }

    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                taskId: taskId,
                email: email
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Resumen enviado exitosamente a ' + email);
        } else {
            alert('Error al enviar el resumen: ' + (data.message || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error enviando email:', error);
        alert('Error al enviar el resumen. Por favor, intente nuevamente.');
    }
}

// Cerrar modal
function closeModal() {
    taskModal.classList.remove('show');
}

// Obtener clase de color según estado y tipo
function getTaskColorClass(task) {
    const estado = task.ID_Estado || 'PEN';
    const tipo = task.ID_Tipo || '';

    // MOB con estado PEN -> violeta
    if (tipo === 'MOB' && estado === 'PEN') {
        return 'estado-mob-pen';
    }

    // CER o TRE -> verde
    if (estado === 'CER' || estado === 'TRE') {
        return 'estado-cer';
    }

    // PEN -> amarillo (default)
    return 'estado-pen';
}

// Obtener texto del estado
function getEstadoTexto(idEstado) {
    if (!idEstado) return 'Pendiente';
    const estados = {
        'PEN': 'Pendiente',
        'CER': 'Cerrado',
        'TRE': 'Terminado'
    };
    return estados[idEstado] || idEstado;
}

// Escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Error al cerrar sesion:', error);
    }
}

// ===================== MODALES DE CLIENTE =====================

// Modal de Mails
async function openMailsModal(clienteId) {
    const mailsModal = document.getElementById('mailsModal');
    const mailsContent = document.getElementById('mailsContent');

    mailsContent.innerHTML = '<div class="loading-state">Cargando mails...</div>';
    mailsModal.classList.add('show');

    try {
        const response = await fetch(`/api/cliente/${clienteId}/mails`);
        const data = await response.json();

        if (data.success && data.mails.length > 0) {
            mailsContent.innerHTML = `
                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Asunto</th>
                                <th>Remitente</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.mails.map(mail => `
                                <tr ondblclick="openEmailDetail(${mail.ID_Email})" class="clickable-row">
                                    <td>${formatDateTime(mail.Fecha)}</td>
                                    <td>${escapeHtml(mail.Asunto || 'Sin asunto')}</td>
                                    <td>${escapeHtml(mail.Remitente || 'Desconocido')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p class="table-hint">Haga doble clic en un mail para ver los detalles</p>
                </div>
            `;
        } else {
            mailsContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <p>No hay mails registrados para este cliente</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando mails:', error);
        mailsContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar los mails. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeMailsModal() {
    document.getElementById('mailsModal').classList.remove('show');
}

// Modal de Contactos
async function openContactosModal(clienteId) {
    const contactosModal = document.getElementById('contactosModal');
    const contactosContent = document.getElementById('contactosContent');

    contactosContent.innerHTML = '<div class="loading-state">Cargando contactos...</div>';
    contactosModal.classList.add('show');

    try {
        const response = await fetch(`/api/cliente/${clienteId}/contactos`);
        const data = await response.json();

        if (data.success && data.contactos.length > 0) {
            contactosContent.innerHTML = `
                <div class="contactos-grid">
                    ${data.contactos.map(contacto => `
                        <div class="contacto-card">
                            <div class="contacto-nombre">${escapeHtml(contacto.Nombre)}</div>
                            <div class="contacto-datos">
                                ${contacto.Telefono ? `
                                    <div class="contacto-item">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                        </svg>
                                        <span>${escapeHtml(contacto.Telefono)}${contacto.Interno ? ` - Int: ${escapeHtml(contacto.Interno)}` : ''}</span>
                                    </div>
                                ` : ''}
                                ${contacto.Celular ? `
                                    <div class="contacto-item">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                                            <line x1="12" y1="18" x2="12.01" y2="18"/>
                                        </svg>
                                        <span>${escapeHtml(contacto.Celular)}</span>
                                    </div>
                                ` : ''}
                                ${contacto.Email ? `
                                    <div class="contacto-item">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                            <polyline points="22,6 12,13 2,6"/>
                                        </svg>
                                        <span>${escapeHtml(contacto.Email)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            contactosContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                    </svg>
                    <p>No hay contactos registrados para este cliente</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando contactos:', error);
        contactosContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar los contactos. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeContactosModal() {
    document.getElementById('contactosModal').classList.remove('show');
}

// Modal de Servicios
async function openServiciosModal(clienteId) {
    const serviciosModal = document.getElementById('serviciosModal');
    const serviciosContent = document.getElementById('serviciosContent');

    serviciosContent.innerHTML = '<div class="loading-state">Cargando servicios...</div>';
    serviciosModal.classList.add('show');

    try {
        const response = await fetch(`/api/cliente/${clienteId}/servicios`);
        const data = await response.json();

        if (data.success && data.servicios.length > 0) {
            serviciosContent.innerHTML = `
                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Fecha</th>
                                <th>Solicitante</th>
                                <th>Técnico</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.servicios.map(servicio => `
                                <tr ondblclick="openServicioDetail(${servicio.ID_PEDIDOSERVICIO})" class="clickable-row">
                                    <td>#${servicio.ID_PEDIDOSERVICIO}</td>
                                    <td>${formatDateTime(servicio.FechaPrometido)}</td>
                                    <td>${escapeHtml(servicio.Solicitante || 'N/A')}</td>
                                    <td>${escapeHtml(servicio.NombreTecnico || 'Sin asignar')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p class="table-hint">Haga doble clic en un servicio para ver los detalles</p>
                </div>
            `;
        } else {
            serviciosContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <p>No hay servicios registrados para este cliente</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        serviciosContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar los servicios. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeServiciosModal() {
    document.getElementById('serviciosModal').classList.remove('show');
}
// Modal de Llaves
async function openLlavesModal(clienteId) {
    const llavesModal = document.getElementById('llavesModal');
    const llavesContent = document.getElementById('llavesContent');

    llavesContent.innerHTML = '<div class="loading-state">Cargando llaves...</div>';
    llavesModal.classList.add('show');

    try {
        const response = await fetch(`/api/cliente/${clienteId}/llaves`);
        const data = await response.json();

        if (data.success && data.llaves.length > 0) {
            llavesContent.innerHTML = `
                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>N° Serie</th>
                                <th>Modelo</th>
                                <th>Marca</th>
                                <th>Cant. Puestos</th>
                                <th>Licencia</th>
                                <th>Producto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.llaves.map(llave => `
                                <tr>
                                    <td>${formatValue(llave.N_Serie)}</td>
                                    <td>${formatValue(llave.Modelo)}</td>
                                    <td>${formatValue(llave.Marca)}</td>
                                    <td>${formatValue(llave.CA_Cant_Puestos)}</td>
                                    <td>${formatValue(llave.CA_Licencia)}</td>
                                    <td>${formatValue(llave.CA_Producto)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            llavesContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="7.5" cy="15.5" r="2.5"/>
                        <path d="M10 14l6-6a2.828 2.828 0 1 1 4 4l-6 6"/>
                        <path d="M17 10l2 2"/>
                    </svg>
                    <p>No hay llaves registradas para este cliente</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando llaves:', error);
        llavesContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar las llaves. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeLlavesModal() {
    document.getElementById('llavesModal').classList.remove('show');
}

// Detalle de Email
async function openEmailDetail(emailId) {
    const emailDetailModal = document.getElementById('emailDetailModal');
    const emailDetailContent = document.getElementById('emailDetailContent');

    emailDetailContent.innerHTML = '<div class="loading-state">Cargando detalle del email...</div>';
    emailDetailModal.classList.add('show');

    try {
        const response = await fetch(`/api/email/${emailId}`);
        const data = await response.json();

        if (data.success) {
            const email = data.email;
            emailDetailContent.innerHTML = `
                <div class="email-detail">
                    <div class="email-field">
                        <span class="email-label">Fecha:</span>
                        <span class="email-value">${formatDateTime(email.Fecha)}</span>
                    </div>
                    <div class="email-field">
                        <span class="email-label">Asunto:</span>
                        <span class="email-value">${escapeHtml(email.Asunto || 'Sin asunto')}</span>
                    </div>
                    <div class="email-field">
                        <span class="email-label">De:</span>
                        <span class="email-value">${escapeHtml(email.DeNombre || 'Desconocido')}</span>
                    </div>
                    <div class="email-field">
                        <span class="email-label">Para:</span>
                        <span class="email-value">${escapeHtml(email.ParaNombre || 'Desconocido')}</span>
                    </div>
                    <div class="email-field email-texto-field">
                        <span class="email-label">Mensaje:</span>
                        <div class="email-texto">${escapeHtml(email.Texto || 'Sin contenido')}</div>
                    </div>
                </div>
            `;
        } else {
            emailDetailContent.innerHTML = `
                <div class="empty-state">
                    <p>No se pudo cargar el detalle del email.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando detalle del email:', error);
        emailDetailContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar el detalle. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeEmailDetailModal() {
    document.getElementById('emailDetailModal').classList.remove('show');
}

// Detalle de Servicio
async function openServicioDetail(servicioId) {
    const servicioDetailModal = document.getElementById('servicioDetailModal');
    const servicioDetailContent = document.getElementById('servicioDetailContent');

    servicioDetailContent.innerHTML = '<div class="loading-state">Cargando detalle del servicio...</div>';
    servicioDetailModal.classList.add('show');

    try {
        const response = await fetch(`/api/servicio/${servicioId}/detalle`);
        const data = await response.json();

        if (data.success) {
            const servicio = data.servicio;
            servicioDetailContent.innerHTML = `
                <div class="servicio-detail">
                    <div class="servicio-field">
                        <span class="servicio-label">Fecha Prometido:</span>
                        <span class="servicio-value">${formatDateTime(servicio.FechaPrometido)}</span>
                    </div>
                    <div class="servicio-field">
                        <span class="servicio-label">Fecha Finalización:</span>
                        <span class="servicio-value">${servicio.FechaFinalizacion ? formatDateTime(servicio.FechaFinalizacion) : 'No finalizado'}</span>
                    </div>
                    <div class="servicio-field">
                        <span class="servicio-label">Falla:</span>
                        <div class="servicio-texto">${escapeHtml(servicio.Falla || 'No registrada')}</div>
                    </div>
                    <div class="servicio-field">
                        <span class="servicio-label">Diagnóstico:</span>
                        <div class="servicio-texto">${escapeHtml(servicio.Diagnostico || 'Sin diagnóstico')}</div>
                    </div>
                </div>
            `;
        } else {
            servicioDetailContent.innerHTML = `
                <div class="empty-state">
                    <p>No se pudo cargar el detalle del servicio.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando detalle del servicio:', error);
        servicioDetailContent.innerHTML = `
            <div class="empty-state">
                <p>Error al cargar el detalle. Intente nuevamente.</p>
            </div>
        `;
    }
}

function closeServicioDetailModal() {
    document.getElementById('servicioDetailModal').classList.remove('show');
}
// Función auxiliar para mostrar valores
function formatValue(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    return escapeHtml(String(value));
}

// Función auxiliar para formatear fecha y hora
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Tecla ESC para cerrar modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && taskModal.classList.contains('show')) {
        closeModal();
    }
});

// Soporte para gestos táctiles (swipe)
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

const calendarWrapper = document.querySelector('.calendar-wrapper');

// Solo activar swipe en dispositivos táctiles
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });
}

function handleSwipe() {
    const swipeThreshold = 50;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Solo procesar si el swipe es más horizontal que vertical
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
        // Si el modal está abierto, no hacer nada
        if (taskModal.classList.contains('show')) return;

        if (diffX > 0) {
            // Swipe derecha - ir al anterior
            navigate(-1);
        } else {
            // Swipe izquierda - ir al siguiente
            navigate(1);
        }
    }
}

/**
 * LÓGICA DE NOTIFICACIONES
 */

// Solicitar permiso para notificaciones
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Este navegador no soporta notificaciones de escritorio");
        return;
    }

    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Permiso de notificación concedido");
            }
        });
    }
}

// Verificar si hay tareas que comiencen en 10 minutos
function checkNotifications() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    tasks.forEach(task => {
        // Solo notificar si tiene fecha, no ha sido notificada y no está terminada
        if (!task.FechaPrometido || notifiedTasks.has(task.ID_PedidoServicio)) return;
        if (task.ID_Estado === 'CER' || task.ID_Estado === 'TRE') return;

        const startTime = new Date(task.FechaPrometido);
        const diffMs = startTime - now;
        const diffMin = diffMs / (1000 * 60);

        // Si faltan entre 9.0 y 10.5 minutos
        if (diffMin > 0 && diffMin <= 10.5) {
            showTaskNotification(task);
            notifiedTasks.add(task.ID_PedidoServicio);
        }
    });
}

// Mostrar la notificación física
function showTaskNotification(task) {
    const timeStr = new Date(task.FechaPrometido).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clientName = task.ClienteNombre || 'Cliente desconocido';
    
    const notification = new Notification("Próxima Tarea (10 min)", {
        body: `Cliente: ${clientName}\nInicio: ${timeStr}\nSolicitante: ${task.Solicitante || 'N/A'}`,
        icon: '/favicon.ico',
        tag: 'task-alert-' + task.ID_PedidoServicio, // Evita duplicados si se recarga la página
        requireInteraction: true // La notificación se queda hasta que el usuario la cierre o haga clic
    });

    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        showTaskDetail(task);
        notification.close();
    };
}