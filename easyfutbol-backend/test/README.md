# Pruebas del backend

`npm test` ejecuta las pruebas rápidas y no se conecta a ninguna base de datos.

## Integración con MySQL

Las pruebas transaccionales requieren una base vacía y aislada. El ejecutor rechaza
explícitamente `easyfutbol` y solo admite nombres que empiecen por `test_` o terminen
en `_test`.

Preparación inicial en el servidor:

```sql
CREATE DATABASE easyfutbol_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'easyfutbol_test'@'localhost' IDENTIFIED BY 'CAMBIA_ESTA_CONTRASENA';
GRANT ALL PRIVILEGES ON easyfutbol_test.* TO 'easyfutbol_test'@'localhost';
FLUSH PRIVILEGES;
```

Ejecución:

```bash
TEST_DB_HOST=127.0.0.1 \
TEST_DB_PORT=3306 \
TEST_DB_NAME=easyfutbol_test \
TEST_DB_USER=easyfutbol_test \
TEST_DB_PASSWORD='TU_CONTRASENA_DE_TEST' \
npm run test:integration
```

El esquema mínimo se crea de nuevo en cada ejecución. Nunca deben utilizarse aquí
las credenciales ni el nombre de la base de producción.

