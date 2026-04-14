const { Router } = require('express');
const { verificarToken, soloAdmin } = require('../middlewares/auth.middleware');
const {
  listarReglas, obtenerRegla, crearRegla,
  actualizarRegla, toggleActivo, eliminarRegla,
} = require('../controllers/reglas.controller');

const router = Router();

router.use(verificarToken, soloAdmin);

router.get('/',                  listarReglas);
router.get('/:id',               obtenerRegla);
router.post('/',                 crearRegla);
router.put('/:id',               actualizarRegla);
router.put('/:id/toggle-activo', toggleActivo);
router.delete('/:id',            eliminarRegla);

module.exports = router;
