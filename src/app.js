const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes       = require('./routes/auth.routes');
const usuariosRoutes   = require('./routes/usuarios.routes');
const categoriasRoutes = require('./routes/categorias.routes');
const reglasRoutes     = require('./routes/reglas.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth',       authRoutes);
app.use('/api/usuarios',   usuariosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/reglas',     reglasRoutes);

// Ruta de salud
app.get('/', (req, res) => {
  res.json({ mensaje: 'API Sistema de Tickets - Servicios Integrales S.A.', version: '1.0.0' });
});

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});

module.exports = app;
