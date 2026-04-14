const { Router } = require('express');
const { register, login, forgotPassword, resetPassword, logout } = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register',        register);
router.post('/login',           login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.post('/logout',          verificarToken, logout);

module.exports = router;
