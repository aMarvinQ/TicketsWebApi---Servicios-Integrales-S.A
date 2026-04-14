const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth.middleware');
const {
  obtenerPerfil, actualizarPerfil, cambiarPassword,
  listarUsuarios, obtenerUsuario, crearUsuario,
  actualizarUsuario, resetPasswordAdmin, toggleActivo,
  listarAgentes,
} = require('../controllers/usuarios.controller');

const router = Router();

router.use(verificarToken);

// Perfil propio
router.get('/perfil',                    obtenerPerfil);
router.put('/perfil',                    actualizarPerfil);
router.put('/perfil/cambiar-password',   cambiarPassword);

// Consulta de agentes
router.get('/agentes',                   listarAgentes);

// Gestión de usuarios (solo admin)
router.get('/',                          soloAdmin, listarUsuarios);
router.get('/:id',                       soloAdmin, obtenerUsuario);
router.post('/',                         soloAdmin, crearUsuario);
router.put('/:id',                       soloAdmin, actualizarUsuario);
router.put('/:id/reset-password',        soloAdmin, resetPasswordAdmin);
router.put('/:id/toggle-activo',         soloAdmin, toggleActivo);

module.exports = router;
