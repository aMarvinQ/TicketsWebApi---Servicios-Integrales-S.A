const app = require('./src/app');
const { getConnection } = require('./src/config/db');
const { iniciarEmailListener } = require('./src/services/emailListener');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const iniciar = async () => {
  try {
    await getConnection();
    console.log('Conexión a SQL Server establecida correctamente.');

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });

    iniciarEmailListener();
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error.message);
    process.exit(1);
  }
};

iniciar();
