/**
 * Servidor Express para aplicación de calendario con SQL Server
 * Autenticación y gestión de tareas por técnico
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const sql = require('mssql');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de SQL Server
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 8 * 60 * 60 * 1000 // 8 horas
    }
}));

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/');
}

// Función para ajustar zona horaria (UTC-3)
function adjustTimezone(date) {
    if (!date) return null;
    const d = new Date(date);
    // Ajustar 3 horas para compensar la visualización en el navegador (UTC-3)
    d.setHours(d.getHours() + 3);
    return d.toISOString();
}

// Pool de conexiones
let poolPromise;

async function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig).connect();
    }
    return poolPromise;
}

// Ruta principal - Login
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/calendar');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('username', sql.VarChar, username)
            .query(`
                SELECT ID_Vendedor, nombre, password
                FROM CRM_VENDEDORES
                WHERE LOWER(nombre) = LOWER(@username)
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        const user = result.recordset[0];

        // Verificar contraseña (case-sensitive según la BD)
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        // Buscar ID_Tecnico en CRM_TECNICOS
        const tecnicoResult = await pool.request()
            .input('idVendedor', sql.Int, user.ID_Vendedor)
            .query(`
                SELECT ID_TECNICO
                FROM CRM_TECNICOS
                WHERE ID_Vendedor = @idVendedor
            `);

        // Guardar en sesión
        req.session.userId = user.ID_Vendedor;
        req.session.userName = user.nombre;
        req.session.idTecnico = tecnicoResult.recordset.length > 0
            ? tecnicoResult.recordset[0].ID_TECNICO
            : null;

        res.json({
            success: true,
            message: 'Login exitoso',
            user: {
                name: user.nombre,
                idVendedor: user.ID_Vendedor,
                idTecnico: req.session.idTecnico
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// API: Obtener tareas del calendario
app.get('/api/tasks', requireAuth, async (req, res) => {
    const idTecnico = req.session.idTecnico;

    if (!idTecnico) {
        return res.status(400).json({ success: false, message: 'Usuario sin técnico asignado' });
    }

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idTecnico', sql.Int, idTecnico)
            .query(`
                SELECT
                    ps.ID_PEDIDOSERVICIO,
                    ps.ID_Cliente,
                    ps.FechaPrometido,
                    ps.Solicitante,
                    ps.Domicilio,
                    ps.ID_Tecnico,
                    ps.ID_Tipo,
                    ps.Falla,
                    ps.ID_Estado,
                    ps.FechaFinalizacion,
                    ps.Diagnostico,
                    ps.HorasEstimadas,
                    c.RazonSocial AS ClienteNombre
                FROM CRM_PEDIDOSSERVICIO ps
                INNER JOIN CRM_CLIENTES c ON ps.ID_Cliente = c.ID_Cliente
                WHERE ps.ID_Tecnico = @idTecnico
                AND ps.FechaPrometido IS NOT NULL
                ORDER BY ps.FechaPrometido ASC
            `);

        const tasks = result.recordset.map(task => ({
            ID_PEDIDOSERVICIO: task.ID_PEDIDOSERVICIO,
            ID_Cliente: task.ID_Cliente,
            FechaPrometido: task.FechaPrometido ? adjustTimezone(task.FechaPrometido) : null,
            Solicitante: task.Solicitante,
            Domicilio: task.Domicilio,
            ID_Tecnico: task.ID_Tecnico,
            ID_Tipo: task.ID_Tipo,
            Falla: task.Falla,
            ID_Estado: task.ID_Estado,
            FechaFinalizacion: task.FechaFinalizacion ? adjustTimezone(task.FechaFinalizacion) : null,
            Diagnostico: task.Diagnostico,
            HorasEstimadas: task.HorasEstimadas,
            ClienteNombre: task.ClienteNombre
        }));

        res.json({
            success: true,
            tasks: tasks,
            userName: req.session.userName
        });

    } catch (error) {
        console.error('Error obteniendo tareas:', error);
        res.status(500).json({ success: false, message: 'Error al obtener tareas' });
    }
});

// API: Obtener detalles de una tarea específica
app.get('/api/task/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT
                    ps.ID_PEDIDOSERVICIO,
                    ps.ID_Cliente,
                    ps.FechaPrometido,
                    ps.Solicitante,
                    ps.Domicilio,
                    ps.ID_Tecnico,
                    ps.ID_Tipo,
                    ps.Falla,
                    ps.ID_Estado,
                    ps.FechaFinalizacion,
                    ps.Diagnostico,
                    ps.HorasEstimadas,
                    c.RazonSocial AS ClienteNombre
                FROM CRM_PEDIDOSSERVICIO ps
                INNER JOIN CRM_CLIENTES c ON ps.ID_Cliente = c.ID_Cliente
                WHERE ps.ID_PEDIDOSERVICIO = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
        }

        const task = result.recordset[0];

        res.json({
            success: true,
            task: {
                ID_PEDIDOSERVICIO: task.ID_PEDIDOSERVICIO,
                ID_Cliente: task.ID_Cliente,
                FechaPrometido: task.FechaPrometido ? adjustTimezone(task.FechaPrometido) : null,
                Solicitante: task.Solicitante,
                Domicilio: task.Domicilio,
                ID_Tecnico: task.ID_Tecnico,
                ID_Tipo: task.ID_Tipo,
                Falla: task.Falla,
                ID_Estado: task.ID_Estado,
                FechaFinalizacion: task.FechaFinalizacion ? adjustTimezone(task.FechaFinalizacion) : null,
                Diagnostico: task.Diagnostico,
                HorasEstimadas: task.HorasEstimadas,
                ClienteNombre: task.ClienteNombre,
                Direccion: task.Direccion,
                Telefono: task.Telefono,
                Email: task.Email
            }
        });

    } catch (error) {
        console.error('Error obteniendo tarea:', error);
        res.status(500).json({ success: false, message: 'Error al obtener tarea' });
    }
});

// API: Actualizar tarea (diagnostico, hora inicio, hora fin)
app.put('/api/task/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { diagnostico, horaInicio, horaFin } = req.body;

    try {
        const pool = await getPool();

        // Obtener la tarea actual para preservar las fechas originales
        const currentResult = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT FechaPrometido, FechaFinalizacion
                FROM CRM_PEDIDOSSERVICIO
                WHERE ID_PEDIDOSERVICIO = @id
            `);

        if (currentResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
        }

        const currentTask = currentResult.recordset[0];

        // Construir la consulta de actualizacion dinamicamente
        let updateFields = [];
        let request = pool.request().input('id', sql.Int, parseInt(id));

        // Siempre actualizar el estado a TRE (Trabajo Realizado) al guardar
        updateFields.push('ID_Estado = @estado');
        request = request.input('estado', sql.VarChar(3), 'TRE');

        // Actualizar diagnostico si se proporciona
        if (diagnostico !== undefined) {
            updateFields.push('Diagnostico = @diagnostico');
            request = request.input('diagnostico', sql.NVarChar(sql.MAX), diagnostico);
        }

        // Actualizar FechaPrometido (hora de inicio) si se proporciona
        if (horaInicio) {
            const fechaOriginal = currentTask.FechaPrometido ? new Date(currentTask.FechaPrometido) : new Date();
            const [horas, minutos] = horaInicio.split(':').map(Number);

            // Crear nueva fecha combinando fecha original con nueva hora
            const nuevaFecha = new Date(fechaOriginal);
            nuevaFecha.setHours(horas, minutos, 0, 0);

            // Ajustar la fecha (Ya no restamos 3 horas manualmente)
            updateFields.push('FechaPrometido = @fechaPrometido');
            request = request.input('fechaPrometido', sql.DateTime, nuevaFecha);
        }

        // Actualizar FechaFinalizacion (hora de fin) si se proporciona
        if (horaFin) {
            let fechaBase;
            if (currentTask.FechaFinalizacion) {
                fechaBase = new Date(currentTask.FechaFinalizacion);
            } else if (currentTask.FechaPrometido) {
                fechaBase = new Date(currentTask.FechaPrometido);
            } else {
                fechaBase = new Date();
            }

            const [horas, minutos] = horaFin.split(':').map(Number);

            // Crear nueva fecha
            const nuevaFecha = new Date(fechaBase);
            nuevaFecha.setHours(horas, minutos, 0, 0);

            // Ajustar la fecha (Ya no restamos 3 horas manualmente)
            updateFields.push('FechaFinalizacion = @fechaFinalizacion');
            request = request.input('fechaFinalizacion', sql.DateTime, nuevaFecha);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
        }

        // Ejecutar la actualizacion
        const query = `
            UPDATE CRM_PEDIDOSSERVICIO
            SET ${updateFields.join(', ')}
            WHERE ID_PEDIDOSERVICIO = @id
        `;

        await request.query(query);

        res.json({
            success: true,
            message: 'Tarea actualizada correctamente'
        });

    } catch (error) {
        console.error('Error actualizando tarea:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar tarea: ' + error.message });
    }
});

// API: Obtener historial de mails del cliente
app.get('/api/cliente/:id/mails', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idCliente', sql.Int, parseInt(id))
            .query(`
                SELECT
                    ec.ID_EmailCliente,
                    ec.ID_Email,
                    ec.Nombre AS Remitente,
                    e.Fecha,
                    e.Asunto
                FROM CRM_EMAILSCLIENTES ec
                INNER JOIN CRM_EMAILS e ON ec.ID_Email = e.ID_Email
                WHERE ec.ID_Cliente = @idCliente
                ORDER BY e.Fecha DESC
            `);

        res.json({
            success: true,
            mails: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo mails del cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener mails: ' + error.message });
    }
});

// API: Obtener detalle de un email
app.get('/api/email/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idEmail', sql.Int, parseInt(id))
            .query(`
                SELECT
                    e.ID_Email,
                    e.Fecha,
                    e.Asunto,
                    e.DeNombre,
                    e.ParaNombre,
                    e.Texto
                FROM CRM_EMAILS e
                WHERE e.ID_Email = @idEmail
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Email no encontrado' });
        }

        res.json({
            success: true,
            email: result.recordset[0]
        });

    } catch (error) {
        console.error('Error obteniendo detalle del email:', error);
        res.status(500).json({ success: false, message: 'Error al obtener email: ' + error.message });
    }
});

// API: Obtener contactos del cliente
app.get('/api/cliente/:id/contactos', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idCliente', sql.Int, parseInt(id))
            .query(`
                SELECT
                    ID_Contacto,
                    Nombre,
                    Telefono,
                    Interno,
                    Celular,
                    Email
                FROM CRM_CONTACTOS
                WHERE ID_Cliente = @idCliente
                ORDER BY Nombre ASC
            `);

        res.json({
            success: true,
            contactos: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo contactos del cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener contactos: ' + error.message });
    }
});

// API: Obtener historial de servicios del cliente
app.get('/api/cliente/:id/servicios', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idCliente', sql.Int, parseInt(id))
            .query(`
                SELECT
                    ps.ID_PEDIDOSERVICIO,
                    ps.FechaPrometido,
                    ps.Solicitante,
                    ps.ID_Tecnico,
                    t.Nombre AS NombreTecnico
                FROM CRM_PEDIDOSSERVICIO ps
                LEFT JOIN CRM_TECNICOS t ON ps.ID_Tecnico = t.ID_Tecnico
                WHERE ps.ID_Cliente = @idCliente
                ORDER BY ps.FechaPrometido DESC
            `);

        res.json({
            success: true,
            servicios: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo servicios del cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener servicios: ' + error.message });
    }
});

// API: Obtener llaves/licencias del cliente
app.get('/api/cliente/:id/llaves', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idCliente', sql.Int, parseInt(id))
            .query(`
                SELECT
                    N_Serie,
                    Modelo,
                    Marca,
                    CA_Cant_Puestos,
                    CA_Licencia,
                    CA_Producto
                FROM CRM_Series
                WHERE ID_Cliente = @idCliente
                ORDER BY N_Serie ASC
            `);

        res.json({
            success: true,
            llaves: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo llaves del cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener llaves: ' + error.message });
    }
});
// API: Obtener detalle de un servicio
app.get('/api/servicio/:id/detalle', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('idServicio', sql.Int, parseInt(id))
            .query(`
                SELECT
                    FechaPrometido,
                    FechaFinalizacion,
                    Falla,
                    Diagnostico
                FROM CRM_PEDIDOSSERVICIO
                WHERE ID_PEDIDOSERVICIO = @idServicio
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Servicio no encontrado' });
        }

        res.json({
            success: true,
            servicio: result.recordset[0]
        });

    } catch (error) {
        console.error('Error obteniendo detalle del servicio:', error);
        res.status(500).json({ success: false, message: 'Error al obtener servicio: ' + error.message });
    }
});

// Página del calendario (protegida)
app.get('/calendar', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});

// API: Verificar sesión actual
app.get('/api/session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                name: req.session.userName,
                idVendedor: req.session.userId,
                idTecnico: req.session.idTecnico
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

// API: Debug - verificar estructura de tablas
app.get('/api/debug-schema', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();

        // Obtener columnas de CRM_PEDIDOSSERVICIO
        const pedidosColumns = await pool.request()
            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CRM_PEDIDOSSERVICIO' ORDER BY ORDINAL_POSITION`);

        res.json({
            pedidosColumns: pedidosColumns.recordset.map(r => r.COLUMN_NAME)
        });
    } catch (error) {
        console.error('Error debug schema:', error);
        res.status(500).json({ error: error.message });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
        }
        res.json({ success: true, message: 'Sesión cerrada' });
    });
});

// API: Enviar resumen por email
app.post('/api/send-email', requireAuth, async (req, res) => {
    const { taskId, email } = req.body;

    if (!taskId || !email) {
        return res.status(400).json({ success: false, message: 'ID de tarea y email son requeridos' });
    }

    try {
        const pool = await getPool();

        // Obtener detalles de la tarea
        const result = await pool.request()
            .input('id', sql.Int, taskId)
            .query(`
                SELECT
                    ps.ID_PEDIDOSERVICIO,
                    ps.FechaPrometido,
                    ps.Solicitante,
                    ps.Domicilio,
                    ps.ID_Tipo,
                    ps.Falla,
                    ps.ID_Estado,
                    ps.FechaFinalizacion,
                    ps.Diagnostico,
                    c.RazonSocial AS ClienteNombre,
                    c.Email as ClienteEmail,
                    v.nombre as TecnicoNombre
                FROM CRM_PEDIDOSSERVICIO ps
                INNER JOIN CRM_CLIENTES c ON ps.ID_Cliente = c.ID_Cliente
                LEFT JOIN CRM_TECNICOS t ON ps.ID_Tecnico = t.ID_TECNICO
                LEFT JOIN CRM_VENDEDORES v ON t.ID_Vendedor = v.ID_Vendedor
                WHERE ps.ID_PEDIDOSERVICIO = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
        }

        const task = result.recordset[0];

        // Determinar estado
        let estadoTexto = 'Tarea Pendiente';
        if (task.ID_Estado === 'CER' || task.ID_Estado === 'TRE') {
            estadoTexto = 'Tarea Realizada';
        }

        // Determinar tipo
        let tipoTexto = task.ID_Tipo || 'No especificado';
        if (task.ID_Tipo === 'MOB') {
            tipoTexto = 'Presencial';
        } else if (task.ID_Tipo === 'ELE') {
            tipoTexto = 'Remoto';
        }

        // Formatear fechas
        const fechaPrometido = task.FechaPrometido ? new Date(adjustTimezone(task.FechaPrometido)) : null;
        const fechaFin = task.FechaFinalizacion ? new Date(adjustTimezone(task.FechaFinalizacion)) : null;

        const fechaStr = fechaPrometido ? fechaPrometido.toLocaleDateString('es-AR') : 'Sin fecha';
        const horaInicioStr = fechaPrometido ? fechaPrometido.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Sin hora';
        const horaFinStr = fechaFin ? fechaFin.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'No registrada';

        // Enviar email (usando configuración SMTP)
        const nodemailer = require('nodemailer');
        const PDFDocument = require('pdfkit');

        // Configurar transporter SMTP
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // Generar PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        doc.on('end', async () => {
            const pdfData = Buffer.concat(buffers);

            // Contenido del email
            const mailOptions = {
                from: `"Servicios Borrajo y Asociados SRL" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: `Informe de Servicio Técnico #${task.ID_PEDIDOSERVICIO} - ${task.ClienteNombre}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6; font-size: 14px;">
                        <p>Estimado Cliente: se adjunta al presente el resumen de la tarea realizada.</p>
                        <p>Muchas gracias por contratar nuestros servicios.</p>
                        <p><strong>Borrajo & asoc.</strong></p>
                        <br>
                        <p style="margin-top: 30px; color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">
                            Este email fue generado automáticamente por el sistema de Agenda.
                        </p>
                    </div>
                `,
                attachments: [
                    {
                        filename: `Informe_Tarea_${task.ID_PEDIDOSERVICIO}.pdf`,
                        content: pdfData,
                        contentType: 'application/pdf'
                    }
                ]
            };

            try {
                // Enviar email
                await transporter.sendMail(mailOptions);
                res.json({ success: true, message: 'Email con PDF enviado exitosamente' });
            } catch (mailError) {
                console.error('Error enviando email con nodemailer:', mailError);
                res.status(500).json({ success: false, message: 'Error al enviar el email: ' + mailError.message });
            }
        });

        // ------------------ DIBUJAR PDF CON MARCO ------------------
        const fs = require('fs');
        const path = require('path');
        const backgroundPath = path.join(__dirname, 'public', 'MarcoPDF.jpg');
        
        // Dibujar el fondo (A4: 595.28 x 841.89)
        if (fs.existsSync(backgroundPath)) {
            doc.image(backgroundPath, 0, 0, { width: doc.page.width, height: doc.page.height });
        }

        // 1. FECHA (Margen superior derecho)
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text(`Fecha: ${fechaStr}`, 400, 50, { align: 'right', width: 145 });

        // 2. RECUADRO GRIS IZQUIERDO (Datos de la Tarea)
        const leftBoxX = 50;
        const leftBoxY = 205;
        const boxWidth = 240;
        
        doc.fontSize(10).fillColor('#333333');
        doc.font('Helvetica-Bold').text('N° de Tarea: ', leftBoxX, leftBoxY, { continued: true })
           .font('Helvetica').text(task.ID_PEDIDOSERVICIO);
           
        doc.font('Helvetica-Bold').text('Empresa: ', { continued: true })
           .font('Helvetica').text(task.ClienteNombre || 'N/A');
           
        doc.font('Helvetica-Bold').text('Solicitante: ', { continued: true })
           .font('Helvetica').text(task.Solicitante || 'N/A');
           
        doc.font('Helvetica-Bold').text('Hora Solicitada: ', { continued: true })
           .font('Helvetica').text(horaInicioStr);

        // 3. RECUADRO GRIS DERECHO (Falla Reportada)
        const rightBoxX = 305;
        doc.font('Helvetica-Bold').text('FALLA REPORTADA:', rightBoxX, leftBoxY);
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').text(task.Falla || 'Sin falla reportada', { width: boxWidth, align: 'justify' });

        // 4. DEBAJO DE FRANJA MORADA (Devolución)
        const feedbackY = 455;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#443891'); // Color morado para el título
        doc.text('DEVOLUCIÓN TÉCNICA', leftBoxX, feedbackY);
        
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#333333');
        const tecnicoName = task.TecnicoNombre || req.session.userName || 'No asignado';
        
        doc.font('Helvetica-Bold').text('Técnico: ', { continued: true })
           .font('Helvetica').text(tecnicoName);
           
        doc.font('Helvetica-Bold').text('Hora de Finalización: ', { continued: true })
           .font('Helvetica').text(horaFinStr);
        
        doc.moveDown(1);
        doc.font('Helvetica-Bold').text('DIAGNÓSTICO / TRABAJO REALIZADO:');
        doc.moveDown(0.5);
        doc.font('Helvetica').text(task.Diagnostico || 'Sin diagnóstico reportado.', { align: 'justify', width: 500 });

        // 5. PIE DE PÁGINA (Leyenda legal)
        const legalText = "ESTIMADO CLIENTE, LE RECORDAMOS QUE LA VISITA MINIMA A FACTURAR ES DE TRES HORAS, AUN EN EL CASO QUE NUESTRO PERSONAL HAYA PERMANECIDO MENOS TIEMPO EN SU EMPRESA. EN CUANTO A LOS ACCESOS REMOTOS, EL TIEMPO MINIMO ES DE UNA HORA";

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#666666')
            .text(legalText, 50, doc.page.height - 80, {
                align: 'center',
                width: doc.page.width - 100,
                lineGap: 2
            });

        // Finalizar documento
        doc.end();

    } catch (error) {
        console.error('Error generando email/PDF:', error);
        res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
    console.log('Conectando a SQL Server...');
    getPool().then(() => {
        console.log('Conexión a SQL Server establecida correctamente');
    }).catch(err => {
        console.error('Error conectando a SQL Server:', err);
    });
});

// Manejar cierre graceful
process.on('SIGINT', async () => {
    const pool = await getPool();
    await pool.close();
    process.exit();
});