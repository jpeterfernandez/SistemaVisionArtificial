# Cardinova - Backend API & Visión Artificial

Sistema REST desarrollado con **FastAPI**, **SQLAlchemy 2.0**, **PostgreSQL** y **Ultralytics YOLOv8** para el seguimiento y control de las etapas de producción en Cardinova.

## 1. Requisitos Previos

- Python 3.11+ (Entorno actual: Python 3.13 en `.venv`)
- PostgreSQL 15+ ejecutándose (actualmente en contenedor Docker `postgres_contenedor`, puerto 5432).
- Modelo YOLO entrenado `best.pt` en la raíz del servidor (`server/best.pt`).

## 2. Configuración del Entorno (.env)

Copia `.env.example` a `.env`:
```bash
cp .env.example .env
```

Parámetros clave:
- `DATABASE_URL`: Conexión PostgreSQL (ej. `postgresql+psycopg://admin:admin@localhost:5432/cardinova_core_platform`)
- `SECRET_KEY`: Clave para firma de tokens JWT.
- `ODOO_ENCRYPTION_KEY`: Clave independiente para cifrar credenciales Odoo guardadas en PostgreSQL; obligatoria fuera de desarrollo.
- `YOLO_MODEL_PATH`: Ruta al archivo de pesos del modelo (`best.pt`).
- `ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_USERNAME`, `ODOO_API_KEY`: Parámetros de integración con Odoo ERP.

## 3. Base de Datos y Migraciones

Las tablas se gestionan mediante **Alembic**:
```bash
# Aplicar migraciones
alembic upgrade head
```

Las migraciones `9a5c1e4f7b20`, `c83d1f2a6b90` y `d9164a70be21` agregan auditoría, permisos por zona y snapshots de zona en eventos/detecciones. Ejecuta `alembic upgrade head` antes de usar la versión nueva.

Los administradores asignan zonas a cada usuario desde **Usuarios**. ADMIN tiene alcance global; OPERATOR y VIEWER solo acceden a sus zonas asignadas. Las cuentas preexistentes migran sin zonas asignadas y deben configurarse antes de volver a consultar datos.

## 4. Inicialización de Datos

Para crear el usuario administrador inicial y registrar las 3 zonas de cámara:
```bash
# Crear o actualizar usuario administrador con una contraseña elegida para el entorno
python app/scripts/create_admin.py --username admin --password "CAMBIA_ESTA_CONTRASENA"

# Registrar cámaras iniciales y mapeo de clases
python app/scripts/seed_cameras.py
```

## 5. Ejecución del Servidor

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- Documentación interactiva Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)
- Documentación ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- Endpoint de verificación de salud: `GET http://localhost:8000/api/v1/health`

## 6. Pruebas Automatizadas

```bash
pytest -v tests
```

## 7. Respaldo y Restauración

`pg_dump` y `pg_restore` deben estar instalados y disponibles en `PATH`.

```bash
python app/scripts/backup_database.py
python app/scripts/restore_database.py storage/backups/cardinova-AAAAmmddTHHMMSSZ.dump --target-database cardinova_restore
```

La restauración no borra objetos y debe apuntar a una base destino vacía. Verifica los respaldos con restauraciones periódicas antes de depender de ellos. Para revisar candidatos de retención sin borrar nada:

```bash
python app/scripts/prune_backups.py --older-than-days 90
```

Solo añade `--delete` después de confirmar la política de retención y que existe un respaldo válido.
